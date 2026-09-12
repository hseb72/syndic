import { db } from '../../db/index.js';

/** Utilisateur tel que porté par le jeton JWT. */
export interface AuthUser {
  sub: string;
  email: string;
  role: string;
}

/**
 * Copropriétés visibles par l'utilisateur.
 *
 *  - BUREAU        : toutes les copropriétés (le syndic gère l'ensemble).
 *  - COPROPRIÉTAIRE: uniquement celles où *sa personne* possède un lot.
 *
 * Une personne est globale et peut posséder des lots dans plusieurs
 * copropriétés (mais pas toutes) : l'accès se déduit donc de la propriété
 * (ownership) et non d'un rattachement fixe du compte à une copropriété.
 */
export async function accessibleCopropertyIds(user: Pick<AuthUser, 'role' | 'sub'>): Promise<string[]> {
  if (user.role === 'BUREAU') {
    const rows = await db.selectFrom('coproperty').select('id').execute();
    return rows.map((r) => r.id);
  }

  const account = await db
    .selectFrom('app_user')
    .select('person_id')
    .where('id', '=', user.sub)
    .executeTakeFirst();
  if (!account?.person_id) return [];

  const rows = await db
    .selectFrom('ownership as o')
    .innerJoin('lot as l', 'l.id', 'o.lot_id')
    .innerJoin('building as b', 'b.id', 'l.building_id')
    .select('b.coproperty_id as copId')
    .distinct()
    .where('o.person_id', '=', account.person_id)
    .where('o.valid_to', 'is', null)
    .execute();
  return rows.map((r) => r.copId);
}

/** Vrai si l'utilisateur est autorisé à consulter cette copropriété. */
export async function canAccessCoproperty(user: Pick<AuthUser, 'role' | 'sub'>, copId: string): Promise<boolean> {
  if (user.role === 'BUREAU') return true;
  const ids = await accessibleCopropertyIds(user);
  return ids.includes(copId);
}
