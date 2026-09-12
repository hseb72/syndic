import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeDashboard } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const query = z.object({ exerciseId: z.string().uuid().optional() });

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/dashboard', async (request) => {
    const { copId } = copParams.parse(request.params);
    const { exerciseId } = query.parse(request.query);
    return computeDashboard(copId, exerciseId);
  });
}
