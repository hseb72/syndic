import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createAccount,
  ensureDefaultAccount,
  importTransactions,
  listAccounts,
  listTransactions,
  recordOwnerPaymentFromLine,
  suggestPayers,
} from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const txParams = z.object({ copId: z.string().uuid(), txId: z.string().uuid() });
const listQuery = z.object({ unreconciled: z.enum(['true', 'false']).optional() });

const accountSchema = z.object({
  name: z.string().min(1),
  iban: z.string().nullish(),
  initialBalance: z.number().optional(),
  initialDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
        amount: z.number(),
        label: z.string().nullish(),
        externalId: z.string().nullish(),
      }),
    )
    .min(1),
});

const recordSchema = z.object({ personId: z.string().uuid() });

export async function bankRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/bank-accounts', async (request) => {
    const { copId } = copParams.parse(request.params);
    return listAccounts(copId);
  });

  app.post('/coproperties/:copId/bank-accounts', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const input = accountSchema.parse(request.body);
    return reply.code(201).send(await createAccount(copId, input));
  });

  app.get('/coproperties/:copId/bank-transactions', async (request) => {
    const { copId } = copParams.parse(request.params);
    const { unreconciled } = listQuery.parse(request.query);
    return listTransactions(copId, unreconciled === 'true');
  });

  // Import de relevé (crée un compte par défaut si besoin).
  app.post('/coproperties/:copId/bank-transactions/import', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const { rows } = importSchema.parse(request.body);
    const accountId = await ensureDefaultAccount(copId);
    return reply.code(201).send(await importTransactions(accountId, rows));
  });

  app.get('/coproperties/:copId/bank-transactions/:txId/suggest', async (request) => {
    const { copId, txId } = txParams.parse(request.params);
    return suggestPayers(copId, txId);
  });

  app.post('/coproperties/:copId/bank-transactions/:txId/record-owner-payment', async (request, reply) => {
    const { copId, txId } = txParams.parse(request.params);
    const { personId } = recordSchema.parse(request.body);
    return reply.code(201).send(await recordOwnerPaymentFromLine(copId, txId, personId));
  });
}
