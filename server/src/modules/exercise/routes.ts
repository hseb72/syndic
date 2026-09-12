import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  closeExercise,
  createExercise,
  listCarryForward,
  listExercises,
  reopenExercise,
} from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const exParams = z.object({ copId: z.string().uuid(), exId: z.string().uuid() });
const createSchema = z.object({
  label: z.string().nullish(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function exerciseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/exercises', async (request) => {
    const { copId } = copParams.parse(request.params);
    return listExercises(copId);
  });
  app.post('/coproperties/:copId/exercises', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const input = createSchema.parse(request.body);
    return reply.code(201).send(await createExercise(copId, input));
  });
  app.post('/coproperties/:copId/exercises/:exId/close', async (request) => {
    const { copId, exId } = exParams.parse(request.params);
    return closeExercise(copId, exId);
  });
  app.post('/coproperties/:copId/exercises/:exId/reopen', async (request) => {
    const { copId, exId } = exParams.parse(request.params);
    return reopenExercise(copId, exId);
  });
  app.get('/coproperties/:copId/exercises/:exId/carry-forward', async (request) => {
    const { copId, exId } = exParams.parse(request.params);
    return listCarryForward(copId, exId);
  });
}
