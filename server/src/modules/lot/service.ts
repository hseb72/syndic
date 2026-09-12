import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { ensureDefaultBuilding } from '../building/service.js';
import { createPerson, displayName } from '../person/service.js';
import { ensureGeneralKey, recomputeBase, removeLotShares, setLotShare } from '../distribution/service.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface LotOverviewRow {
  id: string;
  lotNumber: string;
  description: string | null;
  tantiemes: string;
  quotePart: number | null; // pourcentage (affichage uniquement)
  owners: { personId: string; name: string }[];
  ownerLabel: string;
}

export interface CopropertyOverview {
  generalKeyBase: string | null;
  totalTantiemes: string;
  lotCount: number;
  lots: LotOverviewRow[];
}

export interface CreateLotInput {
  lotNumber: string;
  description?: string | null;
  tantiemes: number;
  buildingId?: string | null;
  ownerPersonId?: string | null;
  ownerName?: string | null;
}

export async function getOverview(copropertyId: string): Promise<CopropertyOverview> {
  const lots = await db
    .selectFrom('lot')
    .innerJoin('building', 'building.id', 'lot.building_id')
    .select(['lot.id as id', 'lot.lot_number as lotNumber', 'lot.description as description', 'lot.created_at as createdAt'])
    .where('building.coproperty_id', '=', copropertyId)
    .orderBy('lot.created_at', 'asc')
    .execute();

  const shares = await db
    .selectFrom('lot_distribution_share')
    .innerJoin('distribution_key', 'distribution_key.id', 'lot_distribution_share.distribution_key_id')
    .select(['lot_distribution_share.lot_id as lotId', 'lot_distribution_share.share as share'])
    .where('distribution_key.coproperty_id', '=', copropertyId)
    .where('distribution_key.code', '=', 'GENERAL')
    .execute();
  const shareByLot = new Map(shares.map((s) => [s.lotId, s.share]));
  const base = shares.reduce((acc, s) => acc + Number(s.share), 0);

  const lotIds = lots.map((l) => l.id);
  const owners =
    lotIds.length === 0
      ? []
      : await db
          .selectFrom('ownership')
          .innerJoin('person', 'person.id', 'ownership.person_id')
          .select([
            'ownership.lot_id as lotId',
            'person.id as personId',
            'person.first_name as firstName',
            'person.last_name as lastName',
            'person.company_name as companyName',
          ])
          .where('ownership.lot_id', 'in', lotIds)
          .where('ownership.valid_to', 'is', null)
          .execute();
  const ownersByLot = new Map<string, { personId: string; name: string }[]>();
  for (const o of owners) {
    const name = displayName({ first_name: o.firstName, last_name: o.lastName, company_name: o.companyName });
    const list = ownersByLot.get(o.lotId) ?? [];
    list.push({ personId: o.personId, name });
    ownersByLot.set(o.lotId, list);
  }

  const rows: LotOverviewRow[] = lots.map((l) => {
    const share = shareByLot.get(l.id) ?? '0';
    const lotOwners = ownersByLot.get(l.id) ?? [];
    return {
      id: l.id,
      lotNumber: l.lotNumber,
      description: l.description,
      tantiemes: share,
      quotePart: base > 0 ? (Number(share) / base) * 100 : null,
      owners: lotOwners,
      ownerLabel: lotOwners.map((o) => o.name).join(' / '),
    };
  });

  return {
    generalKeyBase: base > 0 ? String(base) : null,
    totalTantiemes: String(base),
    lotCount: rows.length,
    lots: rows,
  };
}

async function coproIdForLot(lotId: string): Promise<string> {
  const row = await db
    .selectFrom('lot')
    .innerJoin('building', 'building.id', 'lot.building_id')
    .select('building.coproperty_id as copId')
    .where('lot.id', '=', lotId)
    .executeTakeFirstOrThrow();
  return row.copId;
}

export async function createLot(copropertyId: string, input: CreateLotInput): Promise<CopropertyOverview> {
  const buildingId = input.buildingId ?? (await ensureDefaultBuilding(copropertyId));

  let ownerPersonId = input.ownerPersonId ?? null;
  if (!ownerPersonId && input.ownerName && input.ownerName.trim()) {
    const person = await createPerson({ lastName: input.ownerName.trim() });
    ownerPersonId = person.id;
  }

  const lotId = randomUUID();
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto('lot')
      .values({ id: lotId, building_id: buildingId, lot_number: input.lotNumber, description: input.description ?? null })
      .execute();
    const keyId = await ensureGeneralKey(tx, copropertyId);
    await setLotShare(tx, keyId, lotId, input.tantiemes);
    await recomputeBase(tx, keyId);
    if (ownerPersonId) {
      await tx
        .insertInto('ownership')
        .values({ id: randomUUID(), lot_id: lotId, person_id: ownerPersonId, valid_from: today() })
        .execute();
    }
  });

  return getOverview(copropertyId);
}

export interface PatchLotInput {
  lotNumber?: string;
  description?: string | null;
  tantiemes?: number;
}

export async function patchLot(copropertyId: string, lotId: string, input: PatchLotInput): Promise<CopropertyOverview> {
  await db.transaction().execute(async (tx) => {
    const set: Record<string, unknown> = {};
    if (input.lotNumber !== undefined) set['lot_number'] = input.lotNumber;
    if (input.description !== undefined) set['description'] = input.description;
    if (Object.keys(set).length > 0) {
      await tx.updateTable('lot').set(set).where('id', '=', lotId).execute();
    }
    if (input.tantiemes !== undefined) {
      const keyId = await ensureGeneralKey(tx, copropertyId);
      await setLotShare(tx, keyId, lotId, input.tantiemes);
      await recomputeBase(tx, keyId);
    }
  });
  return getOverview(copropertyId);
}

export async function deleteLot(copropertyId: string, lotId: string): Promise<CopropertyOverview> {
  await db.transaction().execute(async (tx) => {
    // Clôture des propriétés en cours, puis retrait des parts et du lot.
    await tx.deleteFrom('ownership').where('lot_id', '=', lotId).execute();
    await removeLotShares(tx, lotId);
    await tx.deleteFrom('lot').where('id', '=', lotId).execute();
    const keyId = await ensureGeneralKey(tx, copropertyId);
    await recomputeBase(tx, keyId);
  });
  return getOverview(copropertyId);
}

export interface SetOwnerInput {
  personId?: string | null;
  name?: string | null;
  validFrom?: string | null;
}

export async function setLotOwner(copropertyId: string, lotId: string, input: SetOwnerInput): Promise<CopropertyOverview> {
  let personId = input.personId ?? null;
  if (!personId && input.name && input.name.trim()) {
    const person = await createPerson({ lastName: input.name.trim() });
    personId = person.id;
  }
  if (!personId) throw new Error('Aucun propriétaire fourni (personId ou name requis).');

  const from = input.validFrom || today();
  await db.transaction().execute(async (tx) => {
    await tx
      .updateTable('ownership')
      .set({ valid_to: from })
      .where('lot_id', '=', lotId)
      .where('valid_to', 'is', null)
      .execute();
    await tx
      .insertInto('ownership')
      .values({ id: randomUUID(), lot_id: lotId, person_id: personId, valid_from: from })
      .execute();
  });
  return getOverview(copropertyId);
}

export { coproIdForLot };
