import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';

export function listExercises(copropertyId: string) {
  return db
    .selectFrom('accounting_exercise')
    .selectAll()
    .where('coproperty_id', '=', copropertyId)
    .orderBy('start_date', 'asc')
    .execute();
}

export interface CreateExerciseInput {
  label?: string | null;
  startDate: string;
  endDate: string;
}

export function createExercise(copropertyId: string, input: CreateExerciseInput) {
  return db
    .insertInto('accounting_exercise')
    .values({
      id: randomUUID(),
      coproperty_id: copropertyId,
      label: input.label ?? null,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
