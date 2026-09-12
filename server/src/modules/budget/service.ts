import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { ensureGeneralKey, ensureWaterKey } from '../distribution/service.js';

export async function getOrCreateBudget(copropertyId: string, exerciseId: string) {
  const existing = await db
    .selectFrom('budget')
    .selectAll()
    .where('coproperty_id', '=', copropertyId)
    .where('exercise_id', '=', exerciseId)
    .executeTakeFirst();
  if (existing) return existing;
  return db
    .insertInto('budget')
    .values({ id: randomUUID(), coproperty_id: copropertyId, exercise_id: exerciseId })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getBudgetWithLines(copropertyId: string, exerciseId: string) {
  const budget = await getOrCreateBudget(copropertyId, exerciseId);
  const lines = await db
    .selectFrom('budget_line as bl')
    .innerJoin('distribution_key as k', 'k.id', 'bl.distribution_key_id')
    .select(['bl.id as id', 'bl.category as category', 'bl.planned_amount as plannedAmount', 'k.code as keyCode', 'k.name as keyName'])
    .where('bl.budget_id', '=', budget.id)
    .orderBy('bl.category', 'asc')
    .execute();
  const total = lines.reduce((s, l) => s + Number(l.plannedAmount), 0);
  return { budget, lines, total: Math.round(total * 100) / 100 };
}

export interface AddBudgetLineInput {
  category: string;
  keyCode: 'GENERAL' | 'EAU';
  plannedAmount: number;
}

export async function addBudgetLine(copropertyId: string, exerciseId: string, input: AddBudgetLineInput) {
  const budget = await getOrCreateBudget(copropertyId, exerciseId);
  const keyId =
    input.keyCode === 'EAU' ? await ensureWaterKey(db, copropertyId) : await ensureGeneralKey(db, copropertyId);
  await db
    .insertInto('budget_line')
    .values({
      id: randomUUID(),
      budget_id: budget.id,
      category: input.category,
      distribution_key_id: keyId,
      planned_amount: input.plannedAmount,
    })
    .execute();
  return getBudgetWithLines(copropertyId, exerciseId);
}

export async function voteBudget(copropertyId: string, exerciseId: string) {
  const budget = await getOrCreateBudget(copropertyId, exerciseId);
  await db
    .updateTable('budget')
    .set({ status: 'VOTED', voted_at: new Date().toISOString().slice(0, 10) })
    .where('id', '=', budget.id)
    .execute();
  return getBudgetWithLines(copropertyId, exerciseId);
}
