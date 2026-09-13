import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../../db/index.js';

// ---- Assemblée ----
export interface CreateAssemblyInput {
  kind?: 'ORDINAIRE' | 'EXTRAORDINAIRE';
  meetingDate: string;
  meetingTime?: string | null;
  location?: string | null;
  convocationDate?: string | null;
  notes?: string | null;
}

export function listAssemblies(copropertyId: string) {
  return db
    .selectFrom('general_assembly')
    .selectAll()
    .where('coproperty_id', '=', copropertyId)
    .orderBy('meeting_date', 'desc')
    .execute();
}

export function getAssembly(copropertyId: string, id: string) {
  return db
    .selectFrom('general_assembly')
    .selectAll()
    .where('id', '=', id)
    .where('coproperty_id', '=', copropertyId)
    .executeTakeFirst();
}

export async function createAssembly(copropertyId: string, input: CreateAssemblyInput) {
  return db
    .insertInto('general_assembly')
    .values({
      id: randomUUID(),
      coproperty_id: copropertyId,
      kind: input.kind ?? 'ORDINAIRE',
      meeting_date: input.meetingDate,
      meeting_time: input.meetingTime ?? null,
      location: input.location ?? null,
      convocation_date: input.convocationDate ?? null,
      notes: input.notes ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateAssembly(copropertyId: string, id: string, input: Partial<CreateAssemblyInput> & { status?: string }) {
  const set: Record<string, unknown> = {};
  if (input.kind !== undefined) set['kind'] = input.kind;
  if (input.meetingDate !== undefined) set['meeting_date'] = input.meetingDate;
  if (input.meetingTime !== undefined) set['meeting_time'] = input.meetingTime;
  if (input.location !== undefined) set['location'] = input.location;
  if (input.convocationDate !== undefined) set['convocation_date'] = input.convocationDate;
  if (input.notes !== undefined) set['notes'] = input.notes;
  if (input.status !== undefined) set['status'] = input.status;
  if (Object.keys(set).length > 0) {
    await db.updateTable('general_assembly').set(set).where('id', '=', id).where('coproperty_id', '=', copropertyId).execute();
  }
  return getAssembly(copropertyId, id);
}

export async function deleteAssembly(copropertyId: string, id: string) {
  await db.deleteFrom('general_assembly').where('id', '=', id).where('coproperty_id', '=', copropertyId).execute();
  return { deleted: true };
}

// ---- Résolutions (ordre du jour) ----
export interface ResolutionInput {
  title: string;
  body?: string | null;
  majority?: string;
  exerciseId?: string | null;
  position?: number;
}

export function listResolutions(assemblyId: string) {
  return db
    .selectFrom('assembly_resolution')
    .selectAll()
    .where('assembly_id', '=', assemblyId)
    .orderBy('position', 'asc')
    .orderBy('created_at', 'asc')
    .execute();
}

export async function addResolution(assemblyId: string, input: ResolutionInput) {
  const max = await db
    .selectFrom('assembly_resolution')
    .select((eb) => eb.fn.max('position').as('m'))
    .where('assembly_id', '=', assemblyId)
    .executeTakeFirst();
  const position = input.position ?? Number(max?.m ?? -1) + 1;
  return db
    .insertInto('assembly_resolution')
    .values({
      id: randomUUID(),
      assembly_id: assemblyId,
      position,
      title: input.title,
      body: input.body ?? null,
      majority: input.majority ?? 'ART_24',
      exercise_id: input.exerciseId ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateResolution(id: string, input: Partial<ResolutionInput>) {
  const set: Record<string, unknown> = {};
  if (input.title !== undefined) set['title'] = input.title;
  if (input.body !== undefined) set['body'] = input.body;
  if (input.majority !== undefined) set['majority'] = input.majority;
  if (input.exerciseId !== undefined) set['exercise_id'] = input.exerciseId;
  if (input.position !== undefined) set['position'] = input.position;
  if (Object.keys(set).length > 0) {
    await db.updateTable('assembly_resolution').set(set).where('id', '=', id).execute();
  }
  return db.selectFrom('assembly_resolution').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function deleteResolution(id: string) {
  await db.deleteFrom('assembly_resolution').where('id', '=', id).execute();
  return { deleted: true };
}

// ---- Annexes ----
export interface AnnexInput {
  reportType: 'BUDGET' | 'COMPARATIF' | 'REGULARISATION' | 'IMPAYES' | 'TRESORERIE' | 'LIBRE';
  exerciseId?: string | null;
  label?: string | null;
  note?: string | null;
}

export function listAnnexes(assemblyId: string) {
  return db
    .selectFrom('assembly_annex')
    .selectAll()
    .where('assembly_id', '=', assemblyId)
    .orderBy('position', 'asc')
    .orderBy('created_at', 'asc')
    .execute();
}

export async function addAnnex(assemblyId: string, input: AnnexInput) {
  const max = await db
    .selectFrom('assembly_annex')
    .select((eb) => eb.fn.max('position').as('m'))
    .where('assembly_id', '=', assemblyId)
    .executeTakeFirst();
  return db
    .insertInto('assembly_annex')
    .values({
      id: randomUUID(),
      assembly_id: assemblyId,
      position: Number(max?.m ?? -1) + 1,
      report_type: input.reportType,
      exercise_id: input.exerciseId ?? null,
      label: input.label ?? null,
      note: input.note ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteAnnex(id: string) {
  await db.deleteFrom('assembly_annex').where('id', '=', id).execute();
  return { deleted: true };
}

// ---- Comparatif budget / réel par catégorie (annexe COMPARATIF) ----
export interface ComparisonRow {
  category: string;
  budget: number;
  real: number;
  variance: number;
}

export async function getBudgetComparison(
  copropertyId: string,
  exerciseId: string,
): Promise<{ rows: ComparisonRow[]; budgetTotal: number; realTotal: number }> {
  // Budget voté par catégorie.
  const budgetRows = await sql<{ category: string; planned: string }>`
    select bl.category, sum(bl.planned_amount) as planned
    from budget b join budget_line bl on bl.budget_id = b.id
    where b.coproperty_id = ${copropertyId} and b.exercise_id = ${exerciseId}
    group by bl.category
  `.execute(db);

  // Charges réelles COURANTES par catégorie.
  const realRows = await sql<{ category: string | null; real: string }>`
    select coalesce(category, 'Autres') as category, sum(amount) as real
    from supplier_invoice
    where coproperty_id = ${copropertyId} and exercise_id = ${exerciseId} and fund = 'COURANT'
    group by coalesce(category, 'Autres')
  `.execute(db);

  const map = new Map<string, ComparisonRow>();
  for (const b of budgetRows.rows) {
    map.set(b.category, { category: b.category, budget: Number(b.planned), real: 0, variance: 0 });
  }
  for (const r of realRows.rows) {
    const cat = r.category ?? 'Autres';
    const row = map.get(cat) ?? { category: cat, budget: 0, real: 0, variance: 0 };
    row.real = Number(r.real);
    map.set(cat, row);
  }
  const rows = [...map.values()].map((r) => ({ ...r, variance: Math.round((r.real - r.budget) * 100) / 100 }));
  rows.sort((a, b) => a.category.localeCompare(b.category));
  const budgetTotal = Math.round(rows.reduce((s, r) => s + r.budget, 0) * 100) / 100;
  const realTotal = Math.round(rows.reduce((s, r) => s + r.real, 0) * 100) / 100;
  return { rows, budgetTotal, realTotal };
}
