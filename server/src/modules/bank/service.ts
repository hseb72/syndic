import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { createPayment, allocatePayment } from '../payment/service.js';
import { categorize } from './categorize.js';

const CENT = 0.01;

export function listAccounts(copropertyId: string) {
  return db
    .selectFrom('bank_account')
    .selectAll()
    .where('coproperty_id', '=', copropertyId)
    .orderBy('created_at', 'asc')
    .execute();
}

export interface CreateAccountInput {
  name: string;
  iban?: string | null;
  initialBalance?: number;
  initialDate?: string | null;
}

export function createAccount(copropertyId: string, input: CreateAccountInput) {
  return db
    .insertInto('bank_account')
    .values({
      id: randomUUID(),
      coproperty_id: copropertyId,
      name: input.name,
      iban: input.iban ?? null,
      initial_balance: input.initialBalance ?? 0,
      initial_date: input.initialDate ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function ensureDefaultAccount(copropertyId: string): Promise<string> {
  const existing = await db
    .selectFrom('bank_account')
    .select('id')
    .where('coproperty_id', '=', copropertyId)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  if (existing) return existing.id;
  const created = await createAccount(copropertyId, { name: 'Compte principal' });
  return created.id;
}

export interface ImportRow {
  transactionDate: string;
  valueDate?: string | null;
  amount: number;
  label?: string | null;
  externalId?: string | null;
  category?: string | null;
  comment?: string | null;
}

/** Importe des lignes de relevé. Dédup par external_id (grand livre continu). */
export async function importTransactions(bankAccountId: string, rows: ImportRow[]) {
  let inserted = 0;
  for (const r of rows) {
    // Catégorie fournie (revue par l'utilisateur) ou évaluée automatiquement.
    const category = r.category ?? categorize(r.label, r.amount);
    const res = await db
      .insertInto('bank_transaction')
      .values({
        id: randomUUID(),
        bank_account_id: bankAccountId,
        transaction_date: r.transactionDate,
        value_date: r.valueDate ?? null,
        amount: r.amount,
        label: r.label ?? null,
        external_id: r.externalId ?? null,
        category,
        comment: r.comment ?? null,
      })
      .onConflict((oc) => oc.columns(['bank_account_id', 'external_id']).doNothing())
      .executeTakeFirst();
    if (Number(res.numInsertedOrUpdatedRows ?? 0) > 0) inserted++;
  }
  return { inserted, received: rows.length };
}

/** Pré-catégorise des lignes analysées (aperçu avant import), sans rien écrire. */
export function categorizeRows(rows: { transactionDate: string; amount: number; label?: string | null }[]) {
  return rows.map((r) => ({
    transactionDate: r.transactionDate,
    amount: r.amount,
    label: r.label ?? null,
    category: categorize(r.label, r.amount),
    comment: '',
  }));
}

/** Met à jour la catégorie et/ou le commentaire d'une ligne bancaire. */
export async function updateTransaction(
  copropertyId: string,
  bankTransactionId: string,
  input: { category?: string | null; comment?: string | null },
) {
  // Vérifie que la ligne appartient bien à une copropriété donnée.
  const owned = await db
    .selectFrom('bank_transaction as bt')
    .innerJoin('bank_account as ba', 'ba.id', 'bt.bank_account_id')
    .select('bt.id')
    .where('bt.id', '=', bankTransactionId)
    .where('ba.coproperty_id', '=', copropertyId)
    .executeTakeFirst();
  if (!owned) throw Object.assign(new Error('Ligne introuvable.'), { statusCode: 404 });

  const set: Record<string, unknown> = {};
  if (input.category !== undefined) set['category'] = input.category;
  if (input.comment !== undefined) set['comment'] = input.comment;
  if (Object.keys(set).length === 0) return { updated: false };
  await db.updateTable('bank_transaction').set(set).where('id', '=', bankTransactionId).execute();
  return { updated: true };
}

interface TxRaw {
  id: string;
  transactionDate: string;
  amount: string;
  label: string | null;
  category: string | null;
  comment: string | null;
  reconciled: string;
}

function mapTx(r: TxRaw) {
  const amount = Number(r.amount);
  const reconciled = Number(r.reconciled);
  const remaining = Math.round((Math.abs(amount) - reconciled) * 100) / 100;
  const status = reconciled <= CENT ? 'UNRECONCILED' : remaining <= CENT ? 'RECONCILED' : 'PARTIAL';
  return {
    id: r.id,
    transactionDate: r.transactionDate,
    amount: r.amount,
    label: r.label,
    category: r.category,
    comment: r.comment,
    reconciled: String(reconciled),
    remaining,
    status,
    direction: amount >= 0 ? 'CREDIT' : 'DEBIT',
  };
}

export async function listTransactions(copropertyId: string, onlyUnreconciled = false) {
  const result = await sql<TxRaw>`
    select bt.id,
           bt.transaction_date as "transactionDate",
           bt.amount,
           bt.label,
           bt.category,
           bt.comment,
           coalesce((select sum(br.amount) from bank_reconciliation br where br.bank_transaction_id = bt.id), 0) as reconciled
    from bank_transaction bt
    join bank_account ba on ba.id = bt.bank_account_id
    where ba.coproperty_id = ${copropertyId}
    order by bt.transaction_date desc, bt.created_at desc
  `.execute(db);
  const rows = result.rows.map(mapTx);
  return onlyUnreconciled ? rows.filter((r) => r.status !== 'RECONCILED') : rows;
}

/** Suggestions de payeur : tokens du nom d'un copropriétaire présents dans le libellé. */
export async function suggestPayers(copropertyId: string, bankTransactionId: string) {
  const tx = await db
    .selectFrom('bank_transaction')
    .select('label')
    .where('id', '=', bankTransactionId)
    .executeTakeFirstOrThrow();
  const label = (tx.label ?? '').toLowerCase();
  if (!label) return [];

  const owners = await db
    .selectFrom('ownership')
    .innerJoin('person as p', 'p.id', 'ownership.person_id')
    .innerJoin('lot as l', 'l.id', 'ownership.lot_id')
    .innerJoin('building as b', 'b.id', 'l.building_id')
    .select(['p.id as personId', 'p.first_name as firstName', 'p.last_name as lastName', 'p.company_name as companyName', 'l.lot_number as lotNumber'])
    .where('b.coproperty_id', '=', copropertyId)
    .where('ownership.valid_to', 'is', null)
    .execute();

  const seen = new Set<string>();
  const matches: { personId: string; name: string; lotNumber: string }[] = [];
  for (const o of owners) {
    const name = o.companyName ?? [o.firstName, o.lastName].filter(Boolean).join(' ').trim();
    const tokens = name
      .split(/[\s/]+/)
      .map((s) => s.toLowerCase())
      .filter((s) => s.length >= 3);
    if (tokens.some((tk) => label.includes(tk)) && !seen.has(o.personId)) {
      seen.add(o.personId);
      matches.push({ personId: o.personId, name, lotNumber: o.lotNumber });
    }
  }
  return matches;
}

/** Factures non soldées, proposées pour rapprocher un débit bancaire. */
export async function suggestInvoices(copropertyId: string, bankTransactionId: string) {
  const tx = await db
    .selectFrom('bank_transaction')
    .select(['label', 'amount'])
    .where('id', '=', bankTransactionId)
    .executeTakeFirstOrThrow();
  const amountAbs = Math.abs(Number(tx.amount));
  const label = (tx.label ?? '').toLowerCase();

  const rows = await sql<{
    id: string;
    supplierName: string;
    invoiceNumber: string | null;
    invoiceDate: string;
    category: string | null;
    amount: string;
    remaining: string;
  }>`
    select inv.id, s.name as "supplierName", inv.invoice_number as "invoiceNumber",
           inv.invoice_date as "invoiceDate", inv.category, inv.amount,
           (inv.amount - coalesce((select sum(sp.amount) from supplier_payment sp where sp.supplier_invoice_id = inv.id), 0)) as remaining
    from supplier_invoice inv
    join supplier s on s.id = inv.supplier_id
    where inv.coproperty_id = ${copropertyId} and inv.status <> 'CANCELLED'
    order by inv.invoice_date desc
  `.execute(db);

  return rows.rows
    .map((r) => {
      const remaining = Math.round(Number(r.remaining) * 100) / 100;
      const nameHit = r.supplierName && label.includes(r.supplierName.toLowerCase());
      const amountHit = Math.abs(remaining - amountAbs) <= 0.01 || Math.abs(Number(r.amount) - amountAbs) <= 0.01;
      return { ...r, remaining, score: (amountHit ? 2 : 0) + (nameHit ? 1 : 0) };
    })
    .filter((r) => r.remaining > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

export interface ReconcileInput {
  payerPersonId?: string | null;
  receivableAllocations?: { receivableId: string; amount: number }[];
  invoiceAllocations?: { invoiceId: string; amount: number }[];
}

/**
 * Rapprochement unifié d'une ligne bancaire : on y affecte une ou plusieurs
 * cibles — créances de copropriétaires (encaissement) et/ou factures
 * fournisseurs (décaissement), chacune pour un montant. Autorise le partiel
 * (la ligne garde son reste), le split (plusieurs cibles) et, combiné à
 * plusieurs lignes vers une même cible, le paiement en plusieurs fois.
 */
export async function reconcileTransaction(copropertyId: string, bankTransactionId: string, input: ReconcileInput) {
  const tx = await db
    .selectFrom('bank_transaction as bt')
    .innerJoin('bank_account as ba', 'ba.id', 'bt.bank_account_id')
    .select(['bt.id as id', 'bt.transaction_date as date', 'bt.label as label'])
    .where('bt.id', '=', bankTransactionId)
    .where('ba.coproperty_id', '=', copropertyId)
    .executeTakeFirst();
  if (!tx) throw Object.assign(new Error('Ligne bancaire introuvable.'), { statusCode: 404 });

  const recAllocs = (input.receivableAllocations ?? []).filter((a) => a.amount > CENT);
  const invAllocs = (input.invoiceAllocations ?? []).filter((a) => a.amount > CENT);
  if (recAllocs.length === 0 && invAllocs.length === 0) {
    throw Object.assign(new Error('Aucune affectation fournie.'), { statusCode: 400 });
  }

  let reconciled = 0;

  // Encaissement copropriétaire : un seul paiement, ventilé sur les créances.
  if (recAllocs.length > 0) {
    const sum = Math.round(recAllocs.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    const payment = await createPayment(copropertyId, {
      personId: input.payerPersonId ?? null,
      paymentDate: tx.date,
      amount: sum,
      reference: tx.label,
      autoAllocate: false,
    });
    await allocatePayment(payment.id, { allocations: recAllocs });
    await db
      .insertInto('bank_reconciliation')
      .values({ id: randomUUID(), bank_transaction_id: bankTransactionId, target_type: 'OWNER_PAYMENT', target_id: payment.id, amount: sum })
      .execute();
    reconciled += sum;
  }

  // Décaissements fournisseurs : un paiement + un lien par facture.
  for (const a of invAllocs) {
    await db.transaction().execute(async (trx) => {
      const spId = randomUUID();
      await trx
        .insertInto('supplier_payment')
        .values({ id: spId, supplier_invoice_id: a.invoiceId, payment_date: tx.date, amount: a.amount, reference: tx.label })
        .execute();
      const inv = await trx.selectFrom('supplier_invoice').select('amount').where('id', '=', a.invoiceId).executeTakeFirstOrThrow();
      const paid = await trx
        .selectFrom('supplier_payment')
        .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount'), sql<string>`0`).as('total'))
        .where('supplier_invoice_id', '=', a.invoiceId)
        .executeTakeFirstOrThrow();
      if (Number(paid.total) + CENT >= Number(inv.amount)) {
        await trx.updateTable('supplier_invoice').set({ status: 'PAID' }).where('id', '=', a.invoiceId).execute();
      }
      await trx
        .insertInto('bank_reconciliation')
        .values({ id: randomUUID(), bank_transaction_id: bankTransactionId, target_type: 'SUPPLIER_PAYMENT', target_id: spId, amount: a.amount })
        .execute();
    });
    reconciled += a.amount;
  }

  return { reconciled: Math.round(reconciled * 100) / 100 };
}

/**
 * Enregistre un encaissement à partir d'une ligne bancaire (crédit) : crée le
 * paiement copropriétaire (lettré automatiquement sur ses créances ouvertes) et
 * rapproche la ligne. C'est l'action principale du syndic bénévole.
 */
export async function recordOwnerPaymentFromLine(copropertyId: string, bankTransactionId: string, personId: string) {
  const tx = await db
    .selectFrom('bank_transaction')
    .selectAll()
    .where('id', '=', bankTransactionId)
    .executeTakeFirstOrThrow();
  const amount = Number(tx.amount);
  if (amount <= 0) {
    throw Object.assign(new Error('La ligne n’est pas un encaissement (montant négatif).'), { statusCode: 400 });
  }

  const payment = await createPayment(copropertyId, {
    personId,
    paymentDate: tx.transaction_date,
    amount,
    reference: tx.label,
    autoAllocate: true,
  });

  await db
    .insertInto('bank_reconciliation')
    .values({
      id: randomUUID(),
      bank_transaction_id: bankTransactionId,
      target_type: 'OWNER_PAYMENT',
      target_id: payment.id,
      amount,
    })
    .execute();

  return { payment, reconciled: true };
}
