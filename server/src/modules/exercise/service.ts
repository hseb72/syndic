import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { listReceivables } from '../receivable/service.js';

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

async function nextExerciseId(copropertyId: string, startDate: string): Promise<string | null> {
  const next = await db
    .selectFrom('accounting_exercise')
    .select('id')
    .where('coproperty_id', '=', copropertyId)
    .where('start_date', '>', startDate)
    .orderBy('start_date', 'asc')
    .executeTakeFirst();
  return next?.id ?? null;
}

/**
 * Clôture d'un exercice. NE TOUCHE AUCUNE bank_transaction (le grand livre
 * bancaire est un flux continu). Fige l'exercice et pose le report à nouveau :
 * pour chaque lot, le solde impayé des créances de l'exercice est reporté vers
 * l'exercice suivant (s'il existe). Réversible tant que approved_at est NULL.
 */
export async function closeExercise(copropertyId: string, exerciseId: string) {
  const ex = await db
    .selectFrom('accounting_exercise')
    .selectAll()
    .where('id', '=', exerciseId)
    .where('coproperty_id', '=', copropertyId)
    .executeTakeFirstOrThrow();
  if (ex.status === 'CLOSED') {
    throw Object.assign(new Error('Exercice déjà clôturé.'), { statusCode: 400 });
  }

  const toExId = await nextExerciseId(copropertyId, ex.start_date);
  const recs = await listReceivables(copropertyId, exerciseId);
  const remainingByLot = new Map<string, number>();
  for (const r of recs) {
    remainingByLot.set(r.lotId, Math.round(((remainingByLot.get(r.lotId) ?? 0) + r.remaining) * 100) / 100);
  }

  await db.transaction().execute(async (tx) => {
    // Report à nouveau (uniquement si un exercice suivant existe).
    await tx.deleteFrom('exercise_carry_forward').where('from_exercise_id', '=', exerciseId).execute();
    if (toExId) {
      for (const [lotId, amount] of remainingByLot) {
        if (Math.abs(amount) < 0.01) continue;
        await tx
          .insertInto('exercise_carry_forward')
          .values({
            id: randomUUID(),
            from_exercise_id: exerciseId,
            to_exercise_id: toExId,
            lot_id: lotId,
            kind: 'OWNER_BALANCE',
            amount,
          })
          .execute();
      }
    }
    await tx
      .updateTable('accounting_exercise')
      .set({ status: 'CLOSED', closed_at: new Date() })
      .where('id', '=', exerciseId)
      .execute();
  });

  return db.selectFrom('accounting_exercise').selectAll().where('id', '=', exerciseId).executeTakeFirstOrThrow();
}

/** Ré-ouverture (tant que l'AG n'a pas approuvé). Retire le report à nouveau. */
export async function reopenExercise(copropertyId: string, exerciseId: string) {
  const ex = await db
    .selectFrom('accounting_exercise')
    .selectAll()
    .where('id', '=', exerciseId)
    .where('coproperty_id', '=', copropertyId)
    .executeTakeFirstOrThrow();
  if (ex.approved_at) {
    throw Object.assign(new Error('Exercice approuvé en AG : ré-ouverture impossible.'), { statusCode: 400 });
  }
  await db.transaction().execute(async (tx) => {
    await tx.deleteFrom('exercise_carry_forward').where('from_exercise_id', '=', exerciseId).execute();
    await tx
      .updateTable('accounting_exercise')
      .set({ status: 'OPEN', closed_at: null })
      .where('id', '=', exerciseId)
      .execute();
  });
  return db.selectFrom('accounting_exercise').selectAll().where('id', '=', exerciseId).executeTakeFirstOrThrow();
}

export async function listCarryForward(copropertyId: string, exerciseId: string) {
  return db
    .selectFrom('exercise_carry_forward as cf')
    .innerJoin('lot as l', 'l.id', 'cf.lot_id')
    .select(['cf.id as id', 'l.lot_number as lotNumber', 'cf.kind as kind', 'cf.amount as amount'])
    .where('cf.from_exercise_id', '=', exerciseId)
    .orderBy('l.created_at', 'asc')
    .execute();
}
