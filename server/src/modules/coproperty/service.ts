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

export interface UpdateCopropertyInput {
  name?: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string;
}

export async function getCoproperty(id: string) {
  return db.selectFrom('coproperty').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function updateCoproperty(id: string, input: UpdateCopropertyInput) {
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set['name'] = input.name;
  if (input.address !== undefined) set['address'] = input.address;
  if (input.postalCode !== undefined) set['postal_code'] = input.postalCode;
  if (input.city !== undefined) set['city'] = input.city;
  if (input.country !== undefined) set['country'] = input.country;
  if (Object.keys(set).length === 0) return getCoproperty(id);
  return db.updateTable('coproperty').set(set).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
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
