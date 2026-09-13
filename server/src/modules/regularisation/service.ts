import { randomUUID } from 'node:crypto';
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

export interface GenerateRegularisationInput extends RegularisationInput {
  label: string;
  issueDate: string;
  dueDate: string;
}

/**
 * Génère l'appel de régularisation réel : un fund_call (call_type
 * REGULARISATION) + une créance par propriétaire pour les montants positifs.
 * Les montants négatifs (régul créditrice) ne créent pas de créance : c'est un
 * crédit en faveur du copropriétaire.
 */
export async function generateRegularisation(copropertyId: string, input: GenerateRegularisationInput) {
  const result = await computeRegularisation(copropertyId, input);

  const lotIds = result.byLot.map((l) => l.lotId);
  const ownerRows =
    lotIds.length === 0
      ? []
      : await db
          .selectFrom('ownership')
          .select(['lot_id as lotId', 'person_id as personId', 'ownership_share as share'])
          .where('lot_id', 'in', lotIds)
          .where('valid_to', 'is', null)
          .execute();
  const ownersByLot = new Map<string, { personId: string; share: number }[]>();
  for (const o of ownerRows) {
    const list = ownersByLot.get(o.lotId) ?? [];
    list.push({ personId: o.personId, share: Number(o.share) });
    ownersByLot.set(o.lotId, list);
  }

  const fundCallId = randomUUID();
  let credits = 0;
  let receivablesCreated = 0;
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto('fund_call')
      .values({
        id: fundCallId,
        coproperty_id: copropertyId,
        exercise_id: input.exerciseN1Id,
        call_type: 'REGULARISATION',
        label: input.label,
        issue_date: input.issueDate,
        due_date: input.dueDate,
        total_amount: result.totals.amount,
      })
      .execute();

    for (const lot of result.byLot) {
      const itemId = randomUUID();
      await tx
        .insertInto('fund_call_item')
        .values({ id: itemId, fund_call_id: fundCallId, lot_id: lot.lotId, distribution_key_id: null, amount: lot.amount })
        .execute();

      if (lot.amount < 0) {
        credits++;
        continue; // crédit en faveur du copropriétaire, pas de créance
      }
      const owners = ownersByLot.get(lot.lotId) ?? [];
      if (owners.length === 0 || lot.amount === 0) continue;
      const shares = distribute(lot.amount, owners.map((o) => o.share));
      for (let j = 0; j < owners.length; j++) {
        const amt = shares[j]!;
        if (amt <= 0) continue;
        await tx
          .insertInto('receivable')
          .values({
            id: randomUUID(),
            coproperty_id: copropertyId,
            lot_id: lot.lotId,
            person_id: owners[j]!.personId,
            exercise_id: input.exerciseN1Id,
            source_type: 'FUND_CALL_ITEM',
            source_id: itemId,
            nature: 'REGULARISATION',
            amount: amt,
            computed_amount: amt,
            due_date: input.dueDate,
          })
          .execute();
        receivablesCreated++;
      }
    }
  });

  const fundCall = await db.selectFrom('fund_call').selectAll().where('id', '=', fundCallId).executeTakeFirstOrThrow();
  return { fundCall, total: result.totals.amount, receivablesCreated, credits };
}
