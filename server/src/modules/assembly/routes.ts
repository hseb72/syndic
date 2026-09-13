import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addAnnex,
  addResolution,
  createAssembly,
  deleteAnnex,
  deleteAssembly,
  deleteResolution,
  getAssembly,
  getBudgetComparison,
  listAnnexes,
  listAssemblies,
  listResolutions,
  updateAssembly,
  updateResolution,
} from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const asmParams = z.object({ copId: z.string().uuid(), id: z.string().uuid() });
const subParams = z.object({ copId: z.string().uuid(), id: z.string().uuid(), subId: z.string().uuid() });
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  kind: z.enum(['ORDINAIRE', 'EXTRAORDINAIRE']).optional(),
  meetingDate: z.string().regex(dateRe),
  meetingTime: z.string().nullish(),
  location: z.string().nullish(),
  convocationDate: z.string().regex(dateRe).nullish(),
  notes: z.string().nullish(),
});
const updateSchema = createSchema.partial().extend({ status: z.enum(['BROUILLON', 'CONVOQUEE', 'TENUE']).optional() });
const resolutionSchema = z.object({
  title: z.string().min(1),
  body: z.string().nullish(),
  majority: z.enum(['ART_24', 'ART_25', 'ART_26', 'UNANIMITE', 'INFORMATION']).optional(),
  exerciseId: z.string().uuid().nullish(),
  position: z.number().int().optional(),
});
const annexSchema = z.object({
  reportType: z.enum(['BUDGET', 'COMPARATIF', 'REGULARISATION', 'IMPAYES', 'TRESORERIE', 'LIBRE']),
  exerciseId: z.string().uuid().nullish(),
  label: z.string().nullish(),
  note: z.string().nullish(),
});
const exQuery = z.object({ exerciseId: z.string().uuid() });

export async function assemblyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/assemblies', async (request) => {
    const { copId } = copParams.parse(request.params);
    return listAssemblies(copId);
  });

  app.post('/coproperties/:copId/assemblies', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    return reply.code(201).send(await createAssembly(copId, createSchema.parse(request.body)));
  });

  app.get('/coproperties/:copId/assemblies/:id', async (request, reply) => {
    const { copId, id } = asmParams.parse(request.params);
    const asm = await getAssembly(copId, id);
    if (!asm) return reply.code(404).send({ error: 'NotFound', message: 'Assemblée introuvable.' });
    return { assembly: asm, resolutions: await listResolutions(id), annexes: await listAnnexes(id) };
  });

  app.patch('/coproperties/:copId/assemblies/:id', async (request) => {
    const { copId, id } = asmParams.parse(request.params);
    return updateAssembly(copId, id, updateSchema.parse(request.body));
  });

  app.delete('/coproperties/:copId/assemblies/:id', async (request) => {
    const { copId, id } = asmParams.parse(request.params);
    return deleteAssembly(copId, id);
  });

  // Résolutions
  app.post('/coproperties/:copId/assemblies/:id/resolutions', async (request, reply) => {
    const { id } = asmParams.parse(request.params);
    return reply.code(201).send(await addResolution(id, resolutionSchema.parse(request.body)));
  });
  app.patch('/coproperties/:copId/assemblies/:id/resolutions/:subId', async (request) => {
    const { subId } = subParams.parse(request.params);
    return updateResolution(subId, resolutionSchema.partial().parse(request.body));
  });
  app.delete('/coproperties/:copId/assemblies/:id/resolutions/:subId', async (request) => {
    const { subId } = subParams.parse(request.params);
    return deleteResolution(subId);
  });

  // Annexes
  app.post('/coproperties/:copId/assemblies/:id/annexes', async (request, reply) => {
    const { id } = asmParams.parse(request.params);
    return reply.code(201).send(await addAnnex(id, annexSchema.parse(request.body)));
  });
  app.delete('/coproperties/:copId/assemblies/:id/annexes/:subId', async (request) => {
    const { subId } = subParams.parse(request.params);
    return deleteAnnex(subId);
  });

  // Comparatif budget / réel (annexe COMPARATIF)
  app.get('/coproperties/:copId/budget-comparison', async (request) => {
    const { copId } = copParams.parse(request.params);
    const { exerciseId } = exQuery.parse(request.query);
    return getBudgetComparison(copId, exerciseId);
  });
}
