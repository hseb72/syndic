import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { ensureGeneralKey } from '../distribution/service.js';
import { distribute } from '../../util/money.js';

export interface CreateProvisionCallInput {
  exerciseId: string;
  label: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  callType?: 'PROVISION' | 'EXCEPTIONNEL';
}

interface LotShare {
  lotId: string;
  share: number;
  owners: { personId: string; ownershipShare: number }[];
}

async function lotsWithSharesAndOwners(copropertyId: string, keyId: string): Promise<LotShare[]> {
  const lots = await db
    .selectFrom('lot')
    .innerJoin('building', 'building.id', 'lot.building_id')
    .leftJoin('lot_distribution_share as s', (join) =>
      join.onRef('s.lot_id', '=', 'lot.id').on('s.distribution_key_id', '=', keyId),
    )
    .select(['lot.id as lotId', 's.share as share', 'lot.created_at as createdAt'])
    .where('building.coproperty_id', '=', copropertyId)
    .orderBy('lot.created_at', 'asc')
    .execute();

  const lotIds = lots.map((l) => l.lotId);
  const owners =
    lotIds.length === 0
      ? []
      : await db
          .selectFrom('ownership')
          .select(['lot_id as lotId', 'person_id as personId', 'ownership_share as ownershipShare'])
          .where('lot_id', 'in', lotIds)
          .where('valid_to', 'is', null)
          .execute();
  const ownersByLot = new Map<string, { personId: string; ownershipShare: number }[]>();
  for (const o of owners) {
    const list = ownersByLot.get(o.lotId) ?? [];
    list.push({ personId: o.personId, ownershipShare: Number(o.ownershipShare) });
    ownersByLot.set(o.lotId, list);
  }

  return lots.map((l) => ({
    lotId: l.lotId,
    share: Number(l.share ?? 0),
    owners: ownersByLot.get(l.lotId) ?? [],
  }));
}

export async function createProvisionCall(copropertyId: string, input: CreateProvisionCallInput) {
  const keyId = await ensureGeneralKey(db, copropertyId);
  const lots = await lotsWithSharesAndOwners(copropertyId, keyId);
  const amounts = distribute(input.totalAmount, lots.map((l) => l.share));

  const fundCallId = randomUUID();
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto('fund_call')
      .values({
        id: fundCallId,
        coproperty_id: copropertyId,
        exercise_id: input.exerciseId,
        call_type: input.callType ?? 'PROVISION',
        label: input.label,
        issue_date: input.issueDate,
        due_date: input.dueDate,
        total_amount: input.totalAmount,
      })
      .execute();

    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i]!;
      const lotAmount = amounts[i]!;
      if (lotAmount <= 0) continue;

      const itemId = randomUUID();
      await tx
        .insertInto('fund_call_item')
        .values({
          id: itemId,
          fund_call_id: fundCallId,
          lot_id: lot.lotId,
          distribution_key_id: keyId,
          amount: lotAmount,
        })
        .execute();

      // Une créance par propriétaire courant (indivision répartie par quote-part).
      if (lot.owners.length === 0) continue;
      const ownerAmounts = distribute(lotAmount, lot.owners.map((o) => o.ownershipShare));
      for (let j = 0; j < lot.owners.length; j++) {
        const amt = ownerAmounts[j]!;
        if (amt <= 0) continue;
        await tx
          .insertInto('receivable')
          .values({
            id: randomUUID(),
            coproperty_id: copropertyId,
            lot_id: lot.lotId,
            person_id: lot.owners[j]!.personId,
            exercise_id: input.exerciseId,
            source_type: 'FUND_CALL_ITEM',
            source_id: itemId,
            amount: amt,
            due_date: input.dueDate,
          })
          .execute();
      }
    }
  });

  return db.selectFrom('fund_call').selectAll().where('id', '=', fundCallId).executeTakeFirstOrThrow();
}

export function listFundCalls(copropertyId: string, exerciseId?: string) {
  let q = db
    .selectFrom('fund_call')
    .selectAll()
    .where('coproperty_id', '=', copropertyId)
    .orderBy('issue_date', 'asc');
  if (exerciseId) q = q.where('exercise_id', '=', exerciseId);
  return q.execute();
}

/**
 * Rapport d'AG : la répartition par lot du dernier appel de régularisation
 * de l'exercice. Lecture — partagé à tous les copropriétaires.
 */
export async function getRegularisationReport(copropertyId: string, exerciseId: string) {
  const call = await db
    .selectFrom('fund_call')
    .selectAll()
    .where('coproperty_id', '=', copropertyId)
    .where('exercise_id', '=', exerciseId)
    .where('call_type', '=', 'REGULARISATION')
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  if (!call) return { exists: false, label: null, issueDate: null, total: 0, rows: [] };

  const items = await db
    .selectFrom('fund_call_item as it')
    .innerJoin('lot as l', 'l.id', 'it.lot_id')
    .select(['it.lot_id as lotId', 'l.lot_number as lotNumber', 'it.amount as amount', 'l.created_at as createdAt'])
    .where('it.fund_call_id', '=', call.id)
    .orderBy('l.created_at', 'asc')
    .execute();

  const lotIds = items.map((i) => i.lotId);
  const owners = lotIds.length
    ? await db
        .selectFrom('ownership')
        .innerJoin('person as p', 'p.id', 'ownership.person_id')
        .select(['ownership.lot_id as lotId', 'p.first_name as firstName', 'p.last_name as lastName', 'p.company_name as companyName'])
        .where('ownership.lot_id', 'in', lotIds)
        .where('ownership.valid_to', 'is', null)
        .execute()
    : [];
  const ownerByLot = new Map<string, string>();
  for (const o of owners) {
    const name = o.companyName ?? [o.firstName, o.lastName].filter(Boolean).join(' ').trim();
    ownerByLot.set(o.lotId, ownerByLot.has(o.lotId) ? `${ownerByLot.get(o.lotId)} / ${name}` : name);
  }

  return {
    exists: true,
    label: call.label,
    issueDate: call.issue_date,
    total: Math.round(Number(call.total_amount) * 100) / 100,
    rows: items.map((i) => ({ lotNumber: i.lotNumber, ownerLabel: ownerByLot.get(i.lotId) ?? '', amount: Number(i.amount) })),
  };
}
