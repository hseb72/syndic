import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cancelNotice, generateNotices, getNoticeLines, listNotices, payNotice } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const noticeParams = z.object({ copId: z.string().uuid(), id: z.string().uuid() });
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const generateSchema = z.object({
  label: z.string().min(1),
  issueDate: z.string().regex(dateRe),
  dueDate: z.string().regex(dateRe),
});
const paySchema = z.object({ paymentDate: z.string().regex(dateRe) });

export async function noticeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/payment-notices', async (request) => {
    const { copId } = copParams.parse(request.params);
    return listNotices(copId);
  });

  app.get('/coproperties/:copId/payment-notices/:id/lines', async (request) => {
    const { copId, id } = noticeParams.parse(request.params);
    return getNoticeLines(copId, id);
  });

  app.post('/coproperties/:copId/payment-notices/generate', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const input = generateSchema.parse(request.body);
    return reply.code(201).send(await generateNotices(copId, input));
  });

  app.post('/coproperties/:copId/payment-notices/:id/pay', async (request, reply) => {
    const { copId, id } = noticeParams.parse(request.params);
    const input = paySchema.parse(request.body);
    return reply.code(201).send(await payNotice(copId, id, input));
  });

  app.post('/coproperties/:copId/payment-notices/:id/cancel', async (request) => {
    const { copId, id } = noticeParams.parse(request.params);
    return cancelNotice(copId, id);
  });
}
