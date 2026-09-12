import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { hashPassword } from './password.js';

export async function countUsers(): Promise<number> {
  const row = await db
    .selectFrom('app_user')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

export function findByEmail(email: string) {
  return db
    .selectFrom('app_user')
    .selectAll()
    .where('email', '=', email.toLowerCase())
    .executeTakeFirst();
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string | null;
  role: 'BUREAU' | 'COPROPRIETAIRE';
  copropertyId?: string | null;
}

export async function createUser(input: CreateUserInput) {
  return db
    .insertInto('app_user')
    .values({
      id: randomUUID(),
      email: input.email.toLowerCase(),
      password_hash: hashPassword(input.password),
      display_name: input.displayName ?? null,
      role: input.role,
      coproperty_id: input.copropertyId ?? null,
    })
    .returning(['id', 'email', 'display_name', 'role', 'coproperty_id'])
    .executeTakeFirstOrThrow();
}
