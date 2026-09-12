import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { allocatePayment, createPayment, listPayments } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const payParams = z.object({ copId: z.string().uuid(), paymentId: z.string().uuid() });

const createSchema = z.object({
  personId: z.string().uuid().nullish(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  reference: z.string().nullish(),
  autoAllocate: z.boolean().optional(),
});

const allocateSchema = z.object({
  allocations: z.array(z.object({ receivableId: z.string().uuid(), amount: z.number().positive() })).min(1),
});

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/payments', async (request) => {
    const { copId } = copParams.parse(request.params);
    return listPayments(copId);
  });

  app.post('/coproperties/:copId/payments', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const input = createSchema.parse(request.body);
    return reply.code(201).send(await createPayment(copId, input));
  });

  app.post('/coproperties/:copId/payments/:paymentId/allocations', async (request) => {
    const { paymentId } = payParams.parse(request.params);
    const input = allocateSchema.parse(request.body);
    return allocatePayment(paymentId, input);
  });
}
