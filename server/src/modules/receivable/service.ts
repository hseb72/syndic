import { sql } from 'kysely';
import { db } from '../../db/index.js';

export interface ReceivableRow {
  id: string;
  lotId: string;
  lotNumber: string;
  personId: string;
  personName: string;
  amount: string;
  allocated: string;
  remaining: number;
  dueDate: string;
  status: string;
  nature: string;
  exercise: string | null;
}

interface Raw {
  id: string;
  lotId: string;
  lotNumber: string;
  personId: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  amount: string;
  allocated: string;
  dueDate: string;
  status: string;
  nature: string;
  exercise: string | null;
}

/**
 * Créances d'une copropriété (option : d'un exercice), avec le montant déjà
 * affecté (payment_allocation) et le reste dû. Le reste dû est calculé, jamais
 * stocké.
 */
export async function listReceivables(copropertyId: string, exerciseId?: string): Promise<ReceivableRow[]> {
  const result = await sql<Raw>`
    select r.id,
           r.lot_id       as "lotId",
           l.lot_number   as "lotNumber",
           r.person_id    as "personId",
           p.first_name   as "firstName",
           p.last_name    as "lastName",
           p.company_name as "companyName",
           r.amount,
           coalesce((select sum(pa.amount) from payment_allocation pa where pa.receivable_id = r.id), 0) as allocated,
           r.due_date     as "dueDate",
           r.status,
           r.nature,
           ex.label       as "exercise"
    from receivable r
    join lot l    on l.id = r.lot_id
    join person p on p.id = r.person_id
    join accounting_exercise ex on ex.id = r.exercise_id
    where r.coproperty_id = ${copropertyId}
      ${exerciseId ? sql`and r.exercise_id = ${exerciseId}` : sql``}
    order by l.created_at asc
  `.execute(db);

  return result.rows.map((r) => {
    const name = r.companyName ?? [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
    const remaining = Math.round((Number(r.amount) - Number(r.allocated)) * 100) / 100;
    return {
      id: r.id,
      lotId: r.lotId,
      lotNumber: r.lotNumber,
      personId: r.personId,
      personName: name,
      amount: r.amount,
      allocated: String(r.allocated),
      remaining,
      dueDate: r.dueDate,
      status: r.status,
      nature: r.nature,
      exercise: r.exercise,
    };
  });
}
