import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { distribute } from '../../util/money.js';
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

export interface UpdateInvoiceInput {
  supplierId?: string;
  invoiceDate?: string;
  amount?: number;
  category?: string | null;
  fund?: 'COURANT' | 'TRAVAUX';
  invoiceNumber?: string | null;
  dueDate?: string | null;
  /**
   * Si fourni, remplace intégralement la ventilation (ex. dépense d'eau où l'on
   * veut redéfinir la part abonnement / consommation). Sinon, un changement de
   * montant ré-échelonne les portions existantes à l'identique.
   */
  distributions?: InvoiceDistributionInput[];
}

/**
 * Corrige une facture/dépense. Les champs sont modifiables librement ; si le
 * montant change (sans nouvelle ventilation explicite), les portions sont
 * ré-échelonnées à l'identique (le partage GÉNÉRAL/EAU est conservé), pour que
 * charges et régularisation restent cohérentes.
 */
export async function updateInvoice(copropertyId: string, invoiceId: string, input: UpdateInvoiceInput) {
  const inv = await db
    .selectFrom('supplier_invoice')
    .select(['id', 'amount'])
    .where('id', '=', invoiceId)
    .where('coproperty_id', '=', copropertyId)
    .executeTakeFirst();
  if (!inv) throw Object.assign(new Error('Facture introuvable.'), { statusCode: 404 });

  if (input.distributions && input.distributions.length > 0 && input.amount !== undefined) {
    const sum = input.distributions.reduce((acc, p) => acc + p.amount, 0);
    if (Math.abs(sum - input.amount) > CENT) {
      throw Object.assign(
        new Error(
          `La ventilation (${sum.toFixed(2)}) ne correspond pas au montant de la facture (${input.amount.toFixed(2)}).`,
        ),
        { statusCode: 400 },
      );
    }
  }

  await db.transaction().execute(async (tx) => {
    const set: Record<string, unknown> = {};
    if (input.supplierId !== undefined) set['supplier_id'] = input.supplierId;
    if (input.invoiceDate !== undefined) set['invoice_date'] = input.invoiceDate;
    if (input.category !== undefined) set['category'] = input.category;
    if (input.fund !== undefined) set['fund'] = input.fund;
    if (input.invoiceNumber !== undefined) set['invoice_number'] = input.invoiceNumber;
    if (input.dueDate !== undefined) set['due_date'] = input.dueDate;
    if (input.amount !== undefined) set['amount'] = input.amount;
    if (Object.keys(set).length > 0) {
      await tx.updateTable('supplier_invoice').set(set).where('id', '=', invoiceId).execute();
    }

    if (input.distributions && input.distributions.length > 0) {
      // Remplacement intégral de la ventilation.
      await tx.deleteFrom('invoice_distribution').where('supplier_invoice_id', '=', invoiceId).execute();
      for (const p of input.distributions) {
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
    } else if (input.amount !== undefined && Math.abs(input.amount - Number(inv.amount)) > CENT) {
      const portions = await tx
        .selectFrom('invoice_distribution')
        .select(['id', 'amount'])
        .where('supplier_invoice_id', '=', invoiceId)
        .execute();
      if (portions.length > 0) {
        const scaled = distribute(input.amount, portions.map((p) => Number(p.amount)));
        for (let i = 0; i < portions.length; i++) {
          await tx.updateTable('invoice_distribution').set({ amount: scaled[i]! }).where('id', '=', portions[i]!.id).execute();
        }
      }
    }
  });

  return db.selectFrom('supplier_invoice').selectAll().where('id', '=', invoiceId).executeTakeFirstOrThrow();
}

/** Détail d'une facture/dépense avec sa ventilation (pour l'écran de correction). */
export async function getInvoice(copropertyId: string, invoiceId: string) {
  const inv = await db
    .selectFrom('supplier_invoice')
    .selectAll()
    .where('id', '=', invoiceId)
    .where('coproperty_id', '=', copropertyId)
    .executeTakeFirst();
  if (!inv) throw Object.assign(new Error('Facture introuvable.'), { statusCode: 404 });

  const distributions = await db
    .selectFrom('invoice_distribution as d')
    .innerJoin('distribution_key as k', 'k.id', 'd.distribution_key_id')
    .select(['d.id as id', 'k.code as keyCode', 'd.label as label', 'd.amount as amount', 'd.period_label as periodLabel'])
    .where('d.supplier_invoice_id', '=', invoiceId)
    .execute();

  return { ...inv, distributions };
}

/**
 * Supprime une facture/dépense créée par erreur. Retire aussi ses portions de
 * ventilation, ses paiements fournisseurs et les rapprochements bancaires qui
 * s'y rattachaient (la ligne bancaire redevient disponible).
 */
export async function deleteInvoice(copropertyId: string, invoiceId: string) {
  const inv = await db
    .selectFrom('supplier_invoice')
    .select('id')
    .where('id', '=', invoiceId)
    .where('coproperty_id', '=', copropertyId)
    .executeTakeFirst();
  if (!inv) throw Object.assign(new Error('Facture introuvable.'), { statusCode: 404 });

  await db.transaction().execute(async (tx) => {
    await tx
      .deleteFrom('bank_reconciliation')
      .where('target_type', '=', 'SUPPLIER_PAYMENT')
      .where('target_id', 'in', (eb) => eb.selectFrom('supplier_payment').select('id').where('supplier_invoice_id', '=', invoiceId))
      .execute();
    await tx.deleteFrom('supplier_payment').where('supplier_invoice_id', '=', invoiceId).execute();
    await tx.deleteFrom('invoice_distribution').where('supplier_invoice_id', '=', invoiceId).execute();
    await tx.deleteFrom('supplier_invoice').where('id', '=', invoiceId).execute();
  });
  return { deleted: true };
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
