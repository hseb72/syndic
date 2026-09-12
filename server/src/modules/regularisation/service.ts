import { db } from '../../db/index.js';
import { getOverview } from '../lot/service.js';
import { computeChargesByLot } from '../charges/service.js';
import { listReceivables } from '../receivable/service.js';
import { distribute } from '../../util/money.js';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface RegularisationLot {
  lotId: string;
  lotNumber: string;
  ownerLabel: string;
  depenses: number; // dépenses individuelles N-1
  provisionsN1: number; // provisions sur charges appelées en N-1
  impayes: number; // impayés N-1 (reste dû des créances N-1)
  provisionsNext: number; // provisions sur charges appelées pour N
  workFundNext: number; // provision fonds travaux pour N
  amount: number; // appel de régularisation du lot
}

export interface RegularisationResult {
  exerciseN1Id: string;
  provisionsNextTotal: number;
  workFundNextTotal: number;
  totals: {
    depenses: number;
    provisionsN1: number;
    impayes: number;
    provisionsNext: number;
    workFundNext: number;
    amount: number;
  };
  byLot: RegularisationLot[];
}

export interface RegularisationInput {
  exerciseN1Id: string;
  provisionsNextTotal: number;
  workFundNextTotal: number;
}

/**
 * Régularisation annuelle (AG de l'année N, sur l'exercice N-1).
 * Par lot :
 *   appel = dépenses_N-1 + impayés_N-1 − provisions_N-1 + provisions_N + fonds_N
 * où « provisions_N-1 » est le montant APPELÉ en N-1 (pas payé) et « impayés_N-1 »
 * la part non encaissée — de sorte que, net, chacun paie son réel N-1 moins ce
 * qu'il a effectivement versé.
 */
export async function computeRegularisation(
  copropertyId: string,
  input: RegularisationInput,
): Promise<RegularisationResult> {
  const overview = await getOverview(copropertyId);
  const weights = overview.lots.map((l) => Number(l.tantiemes));
  const provNextArr = distribute(input.provisionsNextTotal, weights);
  const fondsNextArr = distribute(input.workFundNextTotal, weights);

  const charges = await computeChargesByLot(copropertyId, input.exerciseN1Id);
  const depByLot = new Map(charges.byLot.map((c) => [c.lotId, c.amount]));

  const recs = await listReceivables(copropertyId, input.exerciseN1Id);
  const calledByLot = new Map<string, number>();
  const impayesByLot = new Map<string, number>();
  for (const r of recs) {
    calledByLot.set(r.lotId, (calledByLot.get(r.lotId) ?? 0) + Number(r.amount));
    impayesByLot.set(r.lotId, (impayesByLot.get(r.lotId) ?? 0) + r.remaining);
  }

  const byLot: RegularisationLot[] = overview.lots.map((l, i) => {
    const depenses = round2(depByLot.get(l.id) ?? 0);
    const provisionsN1 = round2(calledByLot.get(l.id) ?? 0);
    const impayes = round2(impayesByLot.get(l.id) ?? 0);
    const provisionsNext = provNextArr[i]!;
    const workFundNext = fondsNextArr[i]!;
    const amount = round2(depenses + impayes - provisionsN1 + provisionsNext + workFundNext);
    return {
      lotId: l.id,
      lotNumber: l.lotNumber,
      ownerLabel: l.ownerLabel,
      depenses,
      provisionsN1,
      impayes,
      provisionsNext,
      workFundNext,
      amount,
    };
  });

  const sum = (f: (r: RegularisationLot) => number) => round2(byLot.reduce((s, r) => s + f(r), 0));
  return {
    exerciseN1Id: input.exerciseN1Id,
    provisionsNextTotal: input.provisionsNextTotal,
    workFundNextTotal: input.workFundNextTotal,
    totals: {
      depenses: sum((r) => r.depenses),
      provisionsN1: sum((r) => r.provisionsN1),
      impayes: sum((r) => r.impayes),
      provisionsNext: sum((r) => r.provisionsNext),
      workFundNext: sum((r) => r.workFundNext),
      amount: sum((r) => r.amount),
    },
    byLot,
  };
}
