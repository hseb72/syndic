import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';

export interface CreateCopropertyInput {
  name: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string;
}

export async function listCoproperties() {
  return db
    .selectFrom('coproperty')
    .selectAll()
    .orderBy('created_at', 'asc')
    .execute();
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
