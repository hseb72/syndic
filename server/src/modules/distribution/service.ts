import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import { db } from '../../db/index.js';
import type { Database } from '../../db/types.js';

export type Executor = Kysely<Database> | Transaction<Database>;

export const GENERAL_KEY_CODE = 'GENERAL';
export const WATER_KEY_CODE = 'EAU';

/** Renvoie une clé de la copro (par code), en la créant au besoin. */
export async function ensureKey(
  exec: Executor,
  copropertyId: string,
  code: string,
  name: string,
  method: 'TANTIEMES' | 'CONSUMPTION' | 'EQUAL',
): Promise<string> {
  const existing = await exec
    .selectFrom('distribution_key')
    .select('id')
    .where('coproperty_id', '=', copropertyId)
    .where('code', '=', code)
    .executeTakeFirst();
  if (existing) return existing.id;

  const created = await exec
    .insertInto('distribution_key')
    .values({ id: randomUUID(), coproperty_id: copropertyId, code, name, method, base: null })
    .returning('id')
    .executeTakeFirstOrThrow();
  return created.id;
}

/** Renvoie la clé tantièmes générale de la copro, en la créant au besoin. */
export function ensureGeneralKey(exec: Executor, copropertyId: string): Promise<string> {
  return ensureKey(exec, copropertyId, GENERAL_KEY_CODE, 'Charges générales', 'TANTIEMES');
}

/** Renvoie la clé eau (répartition à la consommation), en la créant au besoin. */
export function ensureWaterKey(exec: Executor, copropertyId: string): Promise<string> {
  return ensureKey(exec, copropertyId, WATER_KEY_CODE, 'Eau (consommation)', 'CONSUMPTION');
}

export function listKeys(copropertyId: string) {
  return db
    .selectFrom('distribution_key')
    .selectAll()
    .where('coproperty_id', '=', copropertyId)
    .orderBy('code', 'asc')
    .execute();
}

/** Pose (ou met à jour) la part d'un lot sur une clé. */
export async function setLotShare(
  exec: Executor,
  distributionKeyId: string,
  lotId: string,
  share: number,
): Promise<void> {
  await exec
    .insertInto('lot_distribution_share')
    .values({ id: randomUUID(), distribution_key_id: distributionKeyId, lot_id: lotId, share })
    .onConflict((oc) =>
      oc.columns(['distribution_key_id', 'lot_id']).doUpdateSet({ share: share.toString() }),
    )
    .execute();
}

/** Recalcule et stocke la base d'une clé = somme des parts. */
export async function recomputeBase(exec: Executor, distributionKeyId: string): Promise<void> {
  const row = await exec
    .selectFrom('lot_distribution_share')
    .select((eb) => eb.fn.sum<string>('share').as('total'))
    .where('distribution_key_id', '=', distributionKeyId)
    .executeTakeFirst();
  await exec
    .updateTable('distribution_key')
    .set({ base: row?.total ?? '0' })
    .where('id', '=', distributionKeyId)
    .execute();
}

/** Supprime la part d'un lot sur la clé générale (ex. suppression de lot). */
export async function removeLotShares(exec: Executor, lotId: string): Promise<void> {
  await exec.deleteFrom('lot_distribution_share').where('lot_id', '=', lotId).execute();
}

/** Remplace les relevés de compteur d'une clé CONSUMPTION pour une période. */
export async function setReadings(
  distributionKeyId: string,
  periodLabel: string,
  readings: { lotId: string; consumption: number }[],
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await tx
      .deleteFrom('meter_reading')
      .where('distribution_key_id', '=', distributionKeyId)
      .where('period_label', '=', periodLabel)
      .execute();
    if (readings.length > 0) {
      await tx
        .insertInto('meter_reading')
        .values(
          readings.map((r) => ({
            id: randomUUID(),
            distribution_key_id: distributionKeyId,
            lot_id: r.lotId,
            period_label: periodLabel,
            consumption: r.consumption,
          })),
        )
        .execute();
    }
  });
}

export function getReadings(distributionKeyId: string, periodLabel: string) {
  return db
    .selectFrom('meter_reading')
    .select(['lot_id as lotId', 'consumption'])
    .where('distribution_key_id', '=', distributionKeyId)
    .where('period_label', '=', periodLabel)
    .execute();
}

export { db };
