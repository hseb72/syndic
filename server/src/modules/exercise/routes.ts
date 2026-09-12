import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createExercise, listExercises } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
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
}
