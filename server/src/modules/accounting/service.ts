import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { db } from '../../db/index.js';
import type { Database } from '../../db/types.js';

type Tx = Transaction<Database>;

// Plan comptable copropriété simplifié.
const ACCOUNTS: { number: string; name: string }[] = [
  { number: '512', name: 'Banque' },
  { number: '401', name: 'Fournisseurs' },
  { number: '450', name: 'Copropriétaires' },
  { number: '600', name: 'Charges courantes' },
  { number: '701', name: 'Appels de fonds' },
];

async function ensureAccounts(tx: Tx, copropertyId: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    const existing = await tx
      .selectFrom('accounting_account')
      .select('id')
      .where('coproperty_id', '=', copropertyId)
      .where('number', '=', a.number)
      .executeTakeFirst();
    if (existing) {
      map[a.number] = existing.id;
    } else {
      const id = randomUUID();
      await tx
        .insertInto('accounting_account')
        .values({ id, coproperty_id: copropertyId, number: a.number, name: a.name })
        .execute();
      map[a.number] = id;
    }
  }
  return map;
}

async function ensureJournal(tx: Tx, copropertyId: string): Promise<string> {
  const existing = await tx
    .selectFrom('journal')
    .select('id')
    .where('coproperty_id', '=', copropertyId)
    .where('code', '=', 'GEN')
    .executeTakeFirst();
  if (existing) return existing.id;
  const id = randomUUID();
  await tx.insertInto('journal').values({ id, coproperty_id: copropertyId, code: 'GEN', name: 'Journal général' }).execute();
  return id;
}

interface Line {
  accountId: string;
  debit: number;
  credit: number;
}

async function insertEntry(
  tx: Tx,
  journalId: string,
  exerciseId: string,
  date: string,
  description: string,
  sourceType: string,
  sourceId: string,
  lines: Line[],
): Promise<void> {
  const entryId = randomUUID();
  await tx
    .insertInto('journal_entry')
    .values({ id: entryId, journal_id: journalId, exercise_id: exerciseId, entry_date: date, description, source_type: sourceType, source_id: sourceId })
    .execute();
  for (const l of lines) {
    await tx
      .insertInto('journal_entry_line')
      .values({ id: randomUUID(), journal_entry_id: entryId, accounting_account_id: l.accountId, debit: l.debit, credit: l.credit })
      .execute();
  }
}

/**
 * (Re)génère le journal comptable d'un exercice à partir des faits métier.
 * La comptabilité est une conséquence des opérations : appels -> créances,
 * paiements, factures, paiements fournisseurs. Partie double, chaque écriture
 * équilibrée (débit = crédit).
 */
export async function generateAccounting(copropertyId: string, exerciseId: string) {
  let entries = 0;
  await db.transaction().execute(async (tx) => {
    const acc = await ensureAccounts(tx, copropertyId);
    const journalId = await ensureJournal(tx, copropertyId);

    // Purge des écritures existantes de l'exercice.
    await sql`
      delete from journal_entry_line
      where journal_entry_id in (select id from journal_entry where exercise_id = ${exerciseId})
    `.execute(tx);
    await tx.deleteFrom('journal_entry').where('exercise_id', '=', exerciseId).execute();

    // a) Appels de fonds -> D 450 (copropriétaires) / C 701 (appels).
    const calls = await tx
      .selectFrom('fund_call')
      .select(['id', 'label', 'issue_date', 'total_amount'])
      .where('coproperty_id', '=', copropertyId)
      .where('exercise_id', '=', exerciseId)
      .where('status', '<>', 'CANCELLED')
      .execute();
    for (const c of calls) {
      const amt = Number(c.total_amount);
      if (Math.abs(amt) < 0.01) continue;
      const [d450, c701] =
        amt >= 0
          ? [{ accountId: acc['450']!, debit: amt, credit: 0 }, { accountId: acc['701']!, debit: 0, credit: amt }]
          : [{ accountId: acc['450']!, debit: 0, credit: -amt }, { accountId: acc['701']!, debit: -amt, credit: 0 }];
      await insertEntry(tx, journalId, exerciseId, c.issue_date, `Appel de fonds — ${c.label}`, 'FUND_CALL', c.id, [d450, c701]);
      entries++;
    }

    // b) Encaissements copropriétaires (affectés à une créance de l'exercice) -> D 512 / C 450.
    const ownerPays = await sql<{ id: string; payment_date: string; amount: string; reference: string | null }>`
      select op.id, op.payment_date, sum(pa.amount) as amount, max(op.reference) as reference
      from payment_allocation pa
      join owner_payment op on op.id = pa.owner_payment_id
      join receivable r on r.id = pa.receivable_id
      where r.exercise_id = ${exerciseId} and op.status <> 'REVERSED'
      group by op.id, op.payment_date
    `.execute(tx);
    for (const p of ownerPays.rows) {
      const amt = Number(p.amount);
      if (amt < 0.01) continue;
      await insertEntry(tx, journalId, exerciseId, p.payment_date, `Encaissement — ${p.reference ?? 'copropriétaire'}`, 'OWNER_PAYMENT', p.id, [
        { accountId: acc['512']!, debit: amt, credit: 0 },
        { accountId: acc['450']!, debit: 0, credit: amt },
      ]);
      entries++;
    }

    // c) Factures fournisseurs -> D 600 (charges) / C 401 (fournisseurs).
    const invoices = await tx
      .selectFrom('supplier_invoice')
      .select(['id', 'invoice_date', 'amount', 'category'])
      .where('coproperty_id', '=', copropertyId)
      .where('exercise_id', '=', exerciseId)
      .where('status', '<>', 'CANCELLED')
      .execute();
    for (const inv of invoices) {
      const amt = Number(inv.amount);
      await insertEntry(tx, journalId, exerciseId, inv.invoice_date, `Facture — ${inv.category ?? 'charge'}`, 'SUPPLIER_INVOICE', inv.id, [
        { accountId: acc['600']!, debit: amt, credit: 0 },
        { accountId: acc['401']!, debit: 0, credit: amt },
      ]);
      entries++;
    }

    // d) Paiements fournisseurs (des factures de l'exercice) -> D 401 / C 512.
    const supPays = await tx
      .selectFrom('supplier_payment as sp')
      .innerJoin('supplier_invoice as inv', 'inv.id', 'sp.supplier_invoice_id')
      .select(['sp.id as id', 'sp.payment_date as paymentDate', 'sp.amount as amount'])
      .where('inv.coproperty_id', '=', copropertyId)
      .where('inv.exercise_id', '=', exerciseId)
      .execute();
    for (const sp of supPays) {
      const amt = Number(sp.amount);
      await insertEntry(tx, journalId, exerciseId, sp.paymentDate, 'Paiement fournisseur', 'SUPPLIER_PAYMENT', sp.id, [
        { accountId: acc['401']!, debit: amt, credit: 0 },
        { accountId: acc['512']!, debit: 0, credit: amt },
      ]);
      entries++;
    }
  });

  return { entries, ...(await getBalance(copropertyId, exerciseId)) };
}

export interface BalanceRow {
  number: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
}

export async function getBalance(copropertyId: string, exerciseId: string) {
  const result = await sql<{ number: string; name: string; debit: string; credit: string }>`
    select a.number, a.name,
           coalesce(sum(jl.debit), 0) as debit,
           coalesce(sum(jl.credit), 0) as credit
    from accounting_account a
    left join journal_entry_line jl on jl.accounting_account_id = a.id
    left join journal_entry je on je.id = jl.journal_entry_id and je.exercise_id = ${exerciseId}
    where a.coproperty_id = ${copropertyId}
    group by a.number, a.name
    having coalesce(sum(jl.debit),0) <> 0 or coalesce(sum(jl.credit),0) <> 0
    order by a.number
  `.execute(db);

  const rows: BalanceRow[] = result.rows.map((r) => {
    const debit = Math.round(Number(r.debit) * 100) / 100;
    const credit = Math.round(Number(r.credit) * 100) / 100;
    return { number: r.number, name: r.name, debit, credit, balance: Math.round((debit - credit) * 100) / 100 };
  });
  const totalDebit = Math.round(rows.reduce((s, r) => s + r.debit, 0) * 100) / 100;
  const totalCredit = Math.round(rows.reduce((s, r) => s + r.credit, 0) * 100) / 100;
  return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

export async function listJournal(copropertyId: string, exerciseId: string) {
  const result = await sql<{
    entryId: string;
    entryDate: string;
    description: string;
    number: string;
    accountName: string;
    debit: string;
    credit: string;
  }>`
    select je.id as "entryId", je.entry_date as "entryDate", je.description,
           a.number, a.name as "accountName", jl.debit, jl.credit
    from journal_entry je
    join journal_entry_line jl on jl.journal_entry_id = je.id
    join accounting_account a on a.id = jl.accounting_account_id
    where je.exercise_id = ${exerciseId} and a.coproperty_id = ${copropertyId}
    order by je.entry_date, je.created_at, a.number
  `.execute(db);
  return result.rows.map((r) => ({
    entryId: r.entryId,
    entryDate: r.entryDate,
    description: r.description,
    account: `${r.number} ${r.accountName}`,
    debit: Number(r.debit),
    credit: Number(r.credit),
  }));
}
