import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import type { PersonTable } from '../../db/types.js';
import type { Selectable } from 'kysely';

export type PersonRow = Selectable<PersonTable>;

export interface CreatePersonInput {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Nom d'affichage : raison sociale, sinon prénom + nom. */
export function displayName(p: Pick<PersonRow, 'first_name' | 'last_name' | 'company_name'>): string {
  if (p.company_name) return p.company_name;
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
}

export function listPersons() {
  return db.selectFrom('person').selectAll().orderBy('created_at', 'asc').execute();
}

/**
 * Crée une personne. Le schéma exige soit (first_name + last_name), soit
 * company_name. Si on ne reçoit qu'un libellé libre (cas d'un propriétaire
 * saisi rapidement, ex. "Rigal / Merzeau"), on le range en company_name.
 */
export async function createPerson(input: CreatePersonInput): Promise<PersonRow> {
  let { firstName, lastName, companyName } = input;
  if (!companyName && !(firstName && lastName)) {
    companyName = (firstName || lastName || '').trim() || 'Sans nom';
    firstName = null;
    lastName = null;
  }
  return db
    .insertInto('person')
    .values({
      id: randomUUID(),
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      company_name: companyName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
