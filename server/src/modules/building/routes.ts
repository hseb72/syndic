import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createBuilding, listBuildings } from './service.js';

const paramsSchema = z.object({ copId: z.string().uuid() });
const createSchema = z.object({ name: z.string().min(1), address: z.string().nullish() });

export async function buildingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/buildings', async (request) => {
    const { copId } = paramsSchema.parse(request.params);
    return listBuildings(copId);
  });

  app.post('/coproperties/:copId/buildings', async (request, reply) => {
    const { copId } = paramsSchema.parse(request.params);
    const input = createSchema.parse(request.body);
    const created = await createBuilding(copId, input.name, input.address ?? null);
    return reply.code(201).send(created);
  });
}
