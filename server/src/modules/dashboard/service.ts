import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { getOverview } from '../lot/service.js';
import { listReceivables } from '../receivable/service.js';
import { listTransactions } from '../bank/service.js';
import { getBudgetWithLines } from '../budget/service.js';
import { computeChargesByLot } from '../charges/service.js';

export interface DashboardSummary {
  lotCount: number;
  totalTantiemes: string;
  cashBalance: number;
  unpaidTotal: number;
  unpaidCount: number;
  worklistCount: number;
  exercise: { id: string; label: string | null; status: string } | null;
  budgetVoted: number | null;
  expenses: number | null;
  budgetByCategory: { category: string; planned: number }[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function computeDashboard(copropertyId: string, exerciseId?: string): Promise<DashboardSummary> {
  const overview = await getOverview(copropertyId);

  // Solde de trésorerie = soldes initiaux des comptes + somme des lignes bancaires.
  const cashRow = await sql<{ balance: string }>`
    select
      coalesce((select sum(ba.initial_balance) from bank_account ba where ba.coproperty_id = ${copropertyId}), 0)
      + coalesce((select sum(bt.amount) from bank_transaction bt
                  join bank_account ba on ba.id = bt.bank_account_id
                  where ba.coproperty_id = ${copropertyId}), 0) as balance
  `.execute(db);
  const cashBalance = round2(Number(cashRow.rows[0]?.balance ?? 0));

  const recs = await listReceivables(copropertyId);
  const openRecs = recs.filter((r) => r.status !== 'CANCELLED' && r.remaining > 0);
  const unpaidTotal = round2(openRecs.reduce((s, r) => s + r.remaining, 0));

  const worklistCount = (await listTransactions(copropertyId, true)).length;

  let exercise: DashboardSummary['exercise'] = null;
  let budgetVoted: number | null = null;
  let expenses: number | null = null;
  let budgetByCategory: { category: string; planned: number }[] = [];
  if (exerciseId) {
    const ex = await db
      .selectFrom('accounting_exercise')
      .select(['id', 'label', 'status'])
      .where('id', '=', exerciseId)
      .executeTakeFirst();
    if (ex) exercise = ex;
    const budget = await getBudgetWithLines(copropertyId, exerciseId);
    budgetVoted = budget.total;
    budgetByCategory = budget.lines.map((l) => ({ category: l.category, planned: Number(l.plannedAmount) }));
    const charges = await computeChargesByLot(copropertyId, exerciseId);
    expenses = charges.total;
  }

  return {
    lotCount: overview.lotCount,
    totalTantiemes: overview.totalTantiemes,
    cashBalance,
    unpaidTotal,
    unpaidCount: openRecs.length,
    worklistCount,
    exercise,
    budgetVoted,
    expenses,
    budgetByCategory,
  };
}
