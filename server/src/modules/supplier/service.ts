import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';

export function listSuppliers(copropertyId: string) {
  return db
    .selectFrom('supplier')
    .selectAll()
    .where('coproperty_id', '=', copropertyId)
    .orderBy('name', 'asc')
    .execute();
}

export interface CreateSupplierInput {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export function createSupplier(copropertyId: string, input: CreateSupplierInput) {
  return db
    .insertInto('supplier')
    .values({
      id: randomUUID(),
      coproperty_id: copropertyId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
