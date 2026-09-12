import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';

export function listBuildings(copropertyId: string) {
  return db
    .selectFrom('building')
    .selectAll()
    .where('coproperty_id', '=', copropertyId)
    .orderBy('created_at', 'asc')
    .execute();
}

export function createBuilding(copropertyId: string, name: string, address?: string | null) {
  return db
    .insertInto('building')
    .values({ id: randomUUID(), coproperty_id: copropertyId, name, address: address ?? null })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Renvoie un bâtiment pour la copropriété : le premier existant, sinon en crée
 * un par défaut. Pratique pour les petites copros mono-bâtiment où l'on ne veut
 * pas imposer la saisie d'un immeuble avant les lots.
 */
export async function ensureDefaultBuilding(copropertyId: string): Promise<string> {
  const existing = await db
    .selectFrom('building')
    .select('id')
    .where('coproperty_id', '=', copropertyId)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  if (existing) return existing.id;

  const cop = await db
    .selectFrom('coproperty')
    .select('name')
    .where('id', '=', copropertyId)
    .executeTakeFirstOrThrow();
  const created = await createBuilding(copropertyId, cop.name);
  return created.id;
}
