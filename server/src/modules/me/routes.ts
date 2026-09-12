import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getMySummary } from './service.js';

const query = z.object({ exerciseId: z.string().uuid().optional() });

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me/summary', async (request) => {
    const { exerciseId } = query.parse(request.query);
    return getMySummary(request.user.sub, exerciseId);
  });
}
