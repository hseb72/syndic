import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addBudgetLine, getBudgetWithLines, voteBudget } from './service.js';

const params = z.object({ copId: z.string().uuid(), exId: z.string().uuid() });
const lineSchema = z.object({
  category: z.string().min(1),
  keyCode: z.enum(['GENERAL', 'EAU']),
  plannedAmount: z.number().min(0),
});

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/exercises/:exId/budget', async (request) => {
    const { copId, exId } = params.parse(request.params);
    return getBudgetWithLines(copId, exId);
  });

  app.post('/coproperties/:copId/exercises/:exId/budget/lines', async (request, reply) => {
    const { copId, exId } = params.parse(request.params);
    const input = lineSchema.parse(request.body);
    return reply.code(201).send(await addBudgetLine(copId, exId, input));
  });

  app.post('/coproperties/:copId/exercises/:exId/budget/vote', async (request) => {
    const { copId, exId } = params.parse(request.params);
    return voteBudget(copId, exId);
  });
}
