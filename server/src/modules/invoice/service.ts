import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { ensureGeneralKey, ensureWaterKey } from '../distribution/service.js';

export interface InvoiceDistributionInput {
  keyCode: 'GENERAL' | 'EAU';
  label?: string | null;
  amount: number;
  periodLabel?: string | null;
}

export interface CreateInvoiceInput {
  supplierId: string;
  exerciseId: string;
  invoiceNumber?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  amount: number;
  category?: string | null;
  fund?: 'COURANT' | 'TRAVAUX';
  distributions?: InvoiceDistributionInput[];
}

const CENT = 0.01;

export async function createInvoice(copropertyId: string, input: CreateInvoiceInput) {
  // Ventilation : par défaut une seule portion sur la clé générale.
  const portions: InvoiceDistributionInput[] =
    input.distributions && input.distributions.length > 0
      ? input.distributions
      : [{ keyCode: 'GENERAL', amount: input.amount, label: input.category ?? null }];

  const sum = portions.reduce((acc, p) => acc + p.amount, 0);
  if (Math.abs(sum - input.amount) > CENT) {
    throw Object.assign(
      new Error(
        `La ventilation (${sum.toFixed(2)}) ne correspond pas au montant de la facture (${input.amount.toFixed(2)}).`,
      ),
      { statusCode: 400 },
    );
  }

  const invoiceId = randomUUID();
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto('supplier_invoice')
      .values({
        id: invoiceId,
        coproperty_id: copropertyId,
        supplier_id: input.supplierId,
        exercise_id: input.exerciseId,
        invoice_number: input.invoiceNumber ?? null,
        invoice_date: input.invoiceDate,
        due_date: input.dueDate ?? null,
        amount: input.amount,
        category: input.category ?? null,
        fund: input.fund ?? 'COURANT',
      })
      .execute();

    for (const p of portions) {
      const keyId =
        p.keyCode === 'EAU'
          ? await ensureWaterKey(tx, copropertyId)
          : await ensureGeneralKey(tx, copropertyId);
      await tx
        .insertInto('invoice_distribution')
        .values({
          id: randomUUID(),
          supplier_invoice_id: invoiceId,
          distribution_key_id: keyId,
          label: p.label ?? null,
          amount: p.amount,
          period_label: p.periodLabel ?? null,
        })
        .execute();
    }
  });

  return db.selectFrom('supplier_invoice').selectAll().where('id', '=', invoiceId).executeTakeFirstOrThrow();
}

export async function listInvoices(copropertyId: string, exerciseId?: string) {
  let q = db
    .selectFrom('supplier_invoice as inv')
    .innerJoin('supplier as s', 's.id', 'inv.supplier_id')
    .leftJoin('supplier_payment as p', 'p.supplier_invoice_id', 'inv.id')
    .select((eb) => [
      'inv.id as id',
      'inv.invoice_number as invoiceNumber',
      'inv.invoice_date as invoiceDate',
      'inv.amount as amount',
      'inv.category as category',
      'inv.fund as fund',
      'inv.status as status',
      'inv.exercise_id as exerciseId',
      's.name as supplierName',
      eb.fn.coalesce(eb.fn.sum<string>('p.amount'), sql<string>`0`).as('paidAmount'),
    ])
    .where('inv.coproperty_id', '=', copropertyId)
    .groupBy(['inv.id', 's.name'])
    .orderBy('inv.invoice_date', 'asc');
  if (exerciseId) q = q.where('inv.exercise_id', '=', exerciseId);
  return q.execute();
}

export interface RecordPaymentInput {
  paymentDate: string;
  amount: number;
  reference?: string | null;
}

export async function recordPayment(invoiceId: string, input: RecordPaymentInput) {
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto('supplier_payment')
      .values({
        id: randomUUID(),
        supplier_invoice_id: invoiceId,
        payment_date: input.paymentDate,
        amount: input.amount,
        reference: input.reference ?? null,
      })
      .execute();

    const inv = await tx
      .selectFrom('supplier_invoice')
      .select('amount')
      .where('id', '=', invoiceId)
      .executeTakeFirstOrThrow();
    const paid = await tx
      .selectFrom('supplier_payment')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount'), sql<string>`0`).as('total'))
      .where('supplier_invoice_id', '=', invoiceId)
      .executeTakeFirstOrThrow();
    if (Number(paid.total) + CENT >= Number(inv.amount)) {
      await tx.updateTable('supplier_invoice').set({ status: 'PAID' }).where('id', '=', invoiceId).execute();
    }
  });
  return db.selectFrom('supplier_invoice').selectAll().where('id', '=', invoiceId).executeTakeFirstOrThrow();
}
