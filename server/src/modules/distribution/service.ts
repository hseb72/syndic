import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import { db } from '../../db/index.js';
import type { Database } from '../../db/types.js';

export type Executor = Kysely<Database> | Transaction<Database>;

export const GENERAL_KEY_CODE = 'GENERAL';

/** Renvoie la clé tantièmes générale de la copro, en la créant au besoin. */
export async function ensureGeneralKey(exec: Executor, copropertyId: string): Promise<string> {
  const existing = await exec
    .selectFrom('distribution_key')
    .select('id')
    .where('coproperty_id', '=', copropertyId)
    .where('code', '=', GENERAL_KEY_CODE)
    .executeTakeFirst();
  if (existing) return existing.id;

  const created = await exec
    .insertInto('distribution_key')
    .values({
      id: randomUUID(),
      coproperty_id: copropertyId,
      code: GENERAL_KEY_CODE,
      name: 'Charges générales',
      method: 'TANTIEMES',
      base: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return created.id;
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

export { db };
