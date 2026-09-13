import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createProvisionCall, getRegularisationReport, listFundCalls } from './service.js';
import { listReceivables, updateReceivableAmount } from '../receivable/service.js';

const copParams = z.object({ copId: z.string().uuid() });
const exParams = z.object({ copId: z.string().uuid(), exId: z.string().uuid() });
const recParams = z.object({ copId: z.string().uuid(), receivableId: z.string().uuid() });
const listQuery = z.object({ exerciseId: z.string().uuid().optional() });
const amountSchema = z.object({ amount: z.number().positive() });

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

  // Montant définitif d'une créance (saisie manuelle ; situation de départ).
  app.patch('/coproperties/:copId/receivables/:receivableId', async (request) => {
    const { copId, receivableId } = recParams.parse(request.params);
    const { amount } = amountSchema.parse(request.body);
    return updateReceivableAmount(copId, receivableId, amount);
  });

  // Rapport d'AG : répartition de la régularisation (lecture, tous rôles).
  app.get('/coproperties/:copId/exercises/:exId/regularisation-report', async (request) => {
    const { copId, exId } = exParams.parse(request.params);
    return getRegularisationReport(copId, exId);
  });
}
