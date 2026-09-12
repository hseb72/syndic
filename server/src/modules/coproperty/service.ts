import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';

export interface CreateCopropertyInput {
  name: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string;
}

/**
 * Liste les copropriétés. Si `restrictTo` est fourni (copropriétaire), la
 * liste est bornée à ces identifiants ; `null`/`undefined` = aucune borne
 * (bureau).
 */
export async function listCoproperties(restrictTo?: string[] | null) {
  if (restrictTo && restrictTo.length === 0) return [];
  let q = db.selectFrom('coproperty').selectAll().orderBy('created_at', 'asc');
  if (restrictTo) q = q.where('id', 'in', restrictTo);
  return q.execute();
}

export async function createCoproperty(input: CreateCopropertyInput) {
  const row = await db
    .insertInto('coproperty')
    .values({
      id: randomUUID(),
      name: input.name,
      address: input.address ?? null,
      postal_code: input.postalCode ?? null,
      city: input.city ?? null,
      country: input.country ?? 'FR',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return row;
}
