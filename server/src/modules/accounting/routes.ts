import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateAccounting, getBalance, listJournal } from './service.js';

const params = z.object({ copId: z.string().uuid(), exId: z.string().uuid() });

export async function accountingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/coproperties/:copId/exercises/:exId/accounting/generate', async (request) => {
    const { copId, exId } = params.parse(request.params);
    return generateAccounting(copId, exId);
  });

  app.get('/coproperties/:copId/exercises/:exId/accounting/balance', async (request) => {
    const { copId, exId } = params.parse(request.params);
    return getBalance(copId, exId);
  });

  app.get('/coproperties/:copId/exercises/:exId/accounting/journal', async (request) => {
    const { copId, exId } = params.parse(request.params);
    return listJournal(copId, exId);
  });
}
