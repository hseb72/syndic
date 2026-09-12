import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createProvisionCall, listFundCalls } from './service.js';
import { listReceivables } from '../receivable/service.js';

const copParams = z.object({ copId: z.string().uuid() });
const listQuery = z.object({ exerciseId: z.string().uuid().optional() });

const createSchema = z.object({
  exerciseId: z.string().uuid(),
  label: z.string().min(1),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount: z.number().positive(),
  callType: z.enum(['PROVISION', 'EXCEPTIONNEL']).optional(),
});

export async function fundCallRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/fund-calls', async (request) => {
    const { copId } = copParams.parse(request.params);
    const { exerciseId } = listQuery.parse(request.query);
    return listFundCalls(copId, exerciseId);
  });

  app.post('/coproperties/:copId/fund-calls', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const input = createSchema.parse(request.body);
    return reply.code(201).send(await createProvisionCall(copId, input));
  });

  app.get('/coproperties/:copId/receivables', async (request) => {
    const { copId } = copParams.parse(request.params);
    const { exerciseId } = listQuery.parse(request.query);
    return listReceivables(copId, exerciseId);
  });
}
