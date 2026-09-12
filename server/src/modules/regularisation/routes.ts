import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeRegularisation, generateRegularisation } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const computeSchema = z.object({
  exerciseN1Id: z.string().uuid(),
  provisionsNextTotal: z.number().min(0),
  workFundNextTotal: z.number().min(0),
});
const generateSchema = computeSchema.extend({
  label: z.string().min(1),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function regularisationRoutes(app: FastifyInstance): Promise<void> {
  // POST (calcul, sans effet de bord) : renvoie le détail par lot.
  app.post('/coproperties/:copId/regularisation/compute', async (request) => {
    const { copId } = copParams.parse(request.params);
    const input = computeSchema.parse(request.body);
    return computeRegularisation(copId, input);
  });

  // POST (génère l'appel réel + créances).
  app.post('/coproperties/:copId/regularisation/generate', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const input = generateSchema.parse(request.body);
    return reply.code(201).send(await generateRegularisation(copId, input));
  });
}
