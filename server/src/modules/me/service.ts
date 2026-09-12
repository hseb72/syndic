import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { getUserById } from '../auth/service.js';

export interface MyReceivable {
  id: string;
  lotNumber: string;
  exercise: string | null;
  amount: string;
  paid: string;
  remaining: number;
  dueDate: string;
  status: string;
}

export interface MySummary {
  linked: boolean;
  personName: string | null;
  lots: { lotNumber: string; tantiemes: string | null }[];
  receivables: MyReceivable[];
  totals: { due: number; paid: number; remaining: number };
}

/** Résumé personnel du copropriétaire connecté : ses lots et ses créances. */
export async function getMySummary(userId: string, exerciseId?: string): Promise<MySummary> {
  const user = await getUserById(userId);
  const empty: MySummary = { linked: false, personName: null, lots: [], receivables: [], totals: { due: 0, paid: 0, remaining: 0 } };
  if (!user?.person_id) return empty;
  const personId = user.person_id;

  const person = await db
    .selectFrom('person')
    .select(['first_name', 'last_name', 'company_name'])
    .where('id', '=', personId)
    .executeTakeFirst();
  const personName = person
    ? person.company_name ?? [person.first_name, person.last_name].filter(Boolean).join(' ').trim()
    : null;

  const lots = await db
    .selectFrom('ownership as o')
    .innerJoin('lot as l', 'l.id', 'o.lot_id')
    .leftJoin('lot_distribution_share as s', (join) =>
      join.onRef('s.lot_id', '=', 'l.id'),
    )
    .leftJoin('distribution_key as k', (join) =>
      join.onRef('k.id', '=', 's.distribution_key_id').on('k.code', '=', 'GENERAL'),
    )
    .select(['l.lot_number as lotNumber', 's.share as tantiemes'])
    .where('o.person_id', '=', personId)
    .where('o.valid_to', 'is', null)
    .where((eb) => eb.or([eb('k.code', '=', 'GENERAL'), eb('k.code', 'is', null)]))
    .execute();

  const recResult = await sql<{
    id: string;
    lotNumber: string;
    exercise: string | null;
    amount: string;
    paid: string;
    dueDate: string;
    status: string;
  }>`
    select r.id, l.lot_number as "lotNumber", ex.label as exercise,
           r.amount, r.due_date as "dueDate", r.status,
           coalesce((select sum(pa.amount) from payment_allocation pa where pa.receivable_id = r.id), 0) as paid
    from receivable r
    join lot l on l.id = r.lot_id
    join accounting_exercise ex on ex.id = r.exercise_id
    where r.person_id = ${personId}
      ${exerciseId ? sql`and r.exercise_id = ${exerciseId}` : sql``}
    order by r.due_date
  `.execute(db);

  const receivables: MyReceivable[] = recResult.rows.map((r) => ({
    id: r.id,
    lotNumber: r.lotNumber,
    exercise: r.exercise,
    amount: r.amount,
    paid: String(r.paid),
    remaining: Math.round((Number(r.amount) - Number(r.paid)) * 100) / 100,
    dueDate: r.dueDate,
    status: r.status,
  }));

  const due = Math.round(receivables.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
  const paid = Math.round(receivables.reduce((s, r) => s + Number(r.paid), 0) * 100) / 100;
  const remaining = Math.round((due - paid) * 100) / 100;

  return { linked: true, personName, lots: lots.map((l) => ({ lotNumber: l.lotNumber, tantiemes: l.tantiemes })), receivables, totals: { due, paid, remaining } };
}
