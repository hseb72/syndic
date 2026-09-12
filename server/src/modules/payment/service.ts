import { randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import { db } from '../../db/index.js';
import type { Database } from '../../db/types.js';

type Tx = Transaction<Database>;
const CENT = 0.01;

async function receivableRemaining(tx: Tx, receivableId: string): Promise<number> {
  const rec = await tx
    .selectFrom('receivable')
    .select('amount')
    .where('id', '=', receivableId)
    .executeTakeFirstOrThrow();
  const alloc = await tx
    .selectFrom('payment_allocation')
    .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount'), eb.val('0')).as('t'))
    .where('receivable_id', '=', receivableId)
    .executeTakeFirstOrThrow();
  return Math.round((Number(rec.amount) - Number(alloc.t)) * 100) / 100;
}

async function refreshReceivableStatus(tx: Tx, receivableId: string): Promise<void> {
  const rec = await tx
    .selectFrom('receivable')
    .select('status')
    .where('id', '=', receivableId)
    .executeTakeFirstOrThrow();
  if (rec.status === 'CANCELLED') return;
  const remaining = await receivableRemaining(tx, receivableId);
  await tx
    .updateTable('receivable')
    .set({ status: remaining <= CENT ? 'PAID' : 'OPEN' })
    .where('id', '=', receivableId)
    .execute();
}

async function refreshPaymentStatus(tx: Tx, paymentId: string): Promise<void> {
  const pay = await tx
    .selectFrom('owner_payment')
    .select(['amount', 'person_id', 'status'])
    .where('id', '=', paymentId)
    .executeTakeFirstOrThrow();
  if (pay.status === 'REVERSED') return;
  const alloc = await tx
    .selectFrom('payment_allocation')
    .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount'), eb.val('0')).as('t'))
    .where('owner_payment_id', '=', paymentId)
    .executeTakeFirstOrThrow();
  const allocated = Number(alloc.t);
  let status: string;
  if (allocated <= CENT) status = pay.person_id ? 'IDENTIFIED' : 'RECEIVED';
  else if (allocated + CENT >= Number(pay.amount)) status = 'FULLY_ALLOCATED';
  else status = 'PARTIALLY_ALLOCATED';
  await tx.updateTable('owner_payment').set({ status }).where('id', '=', paymentId).execute();
}

export interface CreatePaymentInput {
  personId?: string | null;
  paymentDate: string;
  amount: number;
  reference?: string | null;
  autoAllocate?: boolean;
}

export async function createPayment(copropertyId: string, input: CreatePaymentInput) {
  const paymentId = randomUUID();
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto('owner_payment')
      .values({
        id: paymentId,
        coproperty_id: copropertyId,
        person_id: input.personId ?? null,
        payment_date: input.paymentDate,
        amount: input.amount,
        reference: input.reference ?? null,
        status: input.personId ? 'IDENTIFIED' : 'RECEIVED',
      })
      .execute();

    if (input.autoAllocate && input.personId) {
      let left = input.amount;
      const openRecs = await tx
        .selectFrom('receivable')
        .select('id')
        .where('person_id', '=', input.personId)
        .where('status', '=', 'OPEN')
        .orderBy('due_date', 'asc')
        .execute();
      for (const r of openRecs) {
        if (left <= CENT) break;
        const remaining = await receivableRemaining(tx, r.id);
        if (remaining <= 0) continue;
        const amt = Math.round(Math.min(left, remaining) * 100) / 100;
        await tx
          .insertInto('payment_allocation')
          .values({ id: randomUUID(), owner_payment_id: paymentId, receivable_id: r.id, amount: amt })
          .execute();
        await refreshReceivableStatus(tx, r.id);
        left = Math.round((left - amt) * 100) / 100;
      }
    }
    await refreshPaymentStatus(tx, paymentId);
  });
  return db.selectFrom('owner_payment').selectAll().where('id', '=', paymentId).executeTakeFirstOrThrow();
}

export interface AllocateInput {
  allocations: { receivableId: string; amount: number }[];
}

export async function allocatePayment(paymentId: string, input: AllocateInput) {
  await db.transaction().execute(async (tx) => {
    for (const a of input.allocations) {
      const remaining = await receivableRemaining(tx, a.receivableId);
      if (a.amount > remaining + CENT) {
        throw Object.assign(new Error(`Affectation (${a.amount}) supérieure au reste dû (${remaining}).`), {
          statusCode: 400,
        });
      }
      await tx
        .insertInto('payment_allocation')
        .values({ id: randomUUID(), owner_payment_id: paymentId, receivable_id: a.receivableId, amount: a.amount })
        .execute();
      await refreshReceivableStatus(tx, a.receivableId);
    }
    await refreshPaymentStatus(tx, paymentId);
  });
  return db.selectFrom('owner_payment').selectAll().where('id', '=', paymentId).executeTakeFirstOrThrow();
}

export function listPayments(copropertyId: string) {
  return db
    .selectFrom('owner_payment as pay')
    .leftJoin('person as p', 'p.id', 'pay.person_id')
    .select([
      'pay.id as id',
      'pay.payment_date as paymentDate',
      'pay.amount as amount',
      'pay.reference as reference',
      'pay.status as status',
      'p.first_name as firstName',
      'p.last_name as lastName',
      'p.company_name as companyName',
    ])
    .where('pay.coproperty_id', '=', copropertyId)
    .orderBy('pay.payment_date', 'desc')
    .execute();
}
