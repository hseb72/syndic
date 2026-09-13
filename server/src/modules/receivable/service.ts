import { sql } from 'kysely';
import { db } from '../../db/index.js';

export interface ReceivableRow {
  id: string;
  lotId: string;
  lotNumber: string;
  personId: string;
  personName: string;
  amount: string;
  computedAmount: string | null;
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
  computedAmount: string | null;
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
           r.computed_amount as "computedAmount",
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
      computedAmount: r.computedAmount,
      allocated: String(r.allocated),
      remaining,
      dueDate: r.dueDate,
      status: r.status,
      nature: r.nature,
      exercise: r.exercise,
    };
  });
}

/**
 * Fixe le montant DÉFINITIF d'une créance (la valeur calculée reste conservée
 * dans `computed_amount`). Utile pour poser une situation de départ. On répercute
 * sur l'appel de fonds d'origine : le montant de la ligne d'appel (fund_call_item)
 * devient la somme de ses créances, et le total de l'appel la somme de ses lignes,
 * pour que l'appel reste égal à ce qui est réellement dû.
 */
export async function updateReceivableAmount(copropertyId: string, receivableId: string, amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  const r = await db
    .selectFrom('receivable')
    .select(['id', 'source_type', 'source_id'])
    .where('id', '=', receivableId)
    .where('coproperty_id', '=', copropertyId)
    .executeTakeFirst();
  if (!r) throw Object.assign(new Error('Créance introuvable.'), { statusCode: 404 });
  if (rounded <= 0) throw Object.assign(new Error('Le montant doit être strictement positif.'), { statusCode: 400 });

  const allocated = await db
    .selectFrom('payment_allocation')
    .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount'), sql<string>`0`).as('total'))
    .where('receivable_id', '=', receivableId)
    .executeTakeFirstOrThrow();
  if (rounded + 0.001 < Number(allocated.total)) {
    throw Object.assign(
      new Error(`Le montant (${rounded.toFixed(2)}) ne peut pas être inférieur au déjà payé (${Number(allocated.total).toFixed(2)}).`),
      { statusCode: 400 },
    );
  }

  await db.transaction().execute(async (tx) => {
    await tx.updateTable('receivable').set({ amount: rounded }).where('id', '=', receivableId).execute();

    // Créance issue d'un appel : on aligne la ligne d'appel puis le total.
    if (r.source_type === 'FUND_CALL_ITEM') {
      const itemSum = await tx
        .selectFrom('receivable')
        .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount'), sql<string>`0`).as('total'))
        .where('source_type', '=', 'FUND_CALL_ITEM')
        .where('source_id', '=', r.source_id)
        .where('status', '<>', 'CANCELLED')
        .executeTakeFirstOrThrow();
      await tx.updateTable('fund_call_item').set({ amount: Number(itemSum.total) }).where('id', '=', r.source_id).execute();

      const item = await tx
        .selectFrom('fund_call_item')
        .select('fund_call_id')
        .where('id', '=', r.source_id)
        .executeTakeFirst();
      if (item) {
        const callSum = await tx
          .selectFrom('fund_call_item')
          .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount'), sql<string>`0`).as('total'))
          .where('fund_call_id', '=', item.fund_call_id)
          .executeTakeFirstOrThrow();
        await tx.updateTable('fund_call').set({ total_amount: Number(callSum.total) }).where('id', '=', item.fund_call_id).execute();
      }
    }

    // Le reste dû a pu retomber à zéro (ou repasser au-dessus) : réaligne le statut.
    const paid = Number(allocated.total);
    await tx
      .updateTable('receivable')
      .set({ status: paid + 0.001 >= rounded ? 'PAID' : 'OPEN' })
      .where('id', '=', receivableId)
      .where('status', '<>', 'CANCELLED')
      .execute();
  });

  return db.selectFrom('receivable').selectAll().where('id', '=', receivableId).executeTakeFirstOrThrow();
}
