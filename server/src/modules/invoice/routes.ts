import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createInvoice, deleteInvoice, listInvoices, recordPayment, updateInvoice } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const invParams = z.object({ copId: z.string().uuid(), invoiceId: z.string().uuid() });
const listQuery = z.object({ exerciseId: z.string().uuid().optional() });

const distributionSchema = z.object({
  keyCode: z.enum(['GENERAL', 'EAU']),
  label: z.string().nullish(),
  amount: z.number(),
  periodLabel: z.string().nullish(),
});

const createSchema = z.object({
  supplierId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  invoiceNumber: z.string().nullish(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  amount: z.number().positive(),
  category: z.string().nullish(),
  fund: z.enum(['COURANT', 'TRAVAUX']).optional(),
  distributions: z.array(distributionSchema).optional(),
});

const updateSchema = z.object({
  supplierId: z.string().uuid().optional(),
  invoiceNumber: z.string().nullish(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  amount: z.number().positive().optional(),
  category: z.string().nullish(),
  fund: z.enum(['COURANT', 'TRAVAUX']).optional(),
});

const paymentSchema = z.object({
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  reference: z.string().nullish(),
});

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/invoices', async (request) => {
    const { copId } = copParams.parse(request.params);
    const { exerciseId } = listQuery.parse(request.query);
    return listInvoices(copId, exerciseId);
  });

  app.post('/coproperties/:copId/invoices', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const input = createSchema.parse(request.body);
    return reply.code(201).send(await createInvoice(copId, input));
  });

  app.patch('/coproperties/:copId/invoices/:invoiceId', async (request) => {
    const { copId, invoiceId } = invParams.parse(request.params);
    const input = updateSchema.parse(request.body);
    return updateInvoice(copId, invoiceId, input);
  });

  app.delete('/coproperties/:copId/invoices/:invoiceId', async (request) => {
    const { copId, invoiceId } = invParams.parse(request.params);
    return deleteInvoice(copId, invoiceId);
  });

  app.post('/coproperties/:copId/invoices/:invoiceId/payments', async (request, reply) => {
    const { invoiceId } = invParams.parse(request.params);
    const input = paymentSchema.parse(request.body);
    return reply.code(201).send(await recordPayment(invoiceId, input));
  });
}
