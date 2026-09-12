import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSupplier, listSuppliers } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullish().or(z.literal('')),
  phone: z.string().nullish(),
});

export async function supplierRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/suppliers', async (request) => {
    const { copId } = copParams.parse(request.params);
    return listSuppliers(copId);
  });
  app.post('/coproperties/:copId/suppliers', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const input = createSchema.parse(request.body);
    return reply.code(201).send(
      await createSupplier(copId, { name: input.name, email: input.email || null, phone: input.phone ?? null }),
    );
  });
}
