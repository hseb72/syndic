import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeRegularisation } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const bodySchema = z.object({
  exerciseN1Id: z.string().uuid(),
  provisionsNextTotal: z.number().min(0),
  workFundNextTotal: z.number().min(0),
});

export async function regularisationRoutes(app: FastifyInstance): Promise<void> {
  // POST (calcul, sans effet de bord) : renvoie le détail par lot.
  app.post('/coproperties/:copId/regularisation/compute', async (request) => {
    const { copId } = copParams.parse(request.params);
    const input = bodySchema.parse(request.body);
    return computeRegularisation(copId, input);
  });
}
