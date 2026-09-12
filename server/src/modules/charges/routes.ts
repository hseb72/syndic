import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeChargesByLot } from './service.js';
import { ensureWaterKey, getReadings, setReadings, listKeys } from '../distribution/service.js';
import { db } from '../../db/index.js';

const copParams = z.object({ copId: z.string().uuid() });
const chargesParams = z.object({ copId: z.string().uuid(), exId: z.string().uuid() });

const readingsSchema = z.object({
  periodLabel: z.string().min(1),
  readings: z.array(z.object({ lotId: z.string().uuid(), consumption: z.number().min(0) })),
});

export async function chargesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/exercises/:exId/charges', async (request) => {
    const { copId, exId } = chargesParams.parse(request.params);
    return computeChargesByLot(copId, exId);
  });

  app.get('/coproperties/:copId/distribution-keys', async (request) => {
    const { copId } = copParams.parse(request.params);
    return listKeys(copId);
  });

  // Relevés d'eau (clé EAU) pour une période.
  app.get('/coproperties/:copId/water-readings/:period', async (request) => {
    const { copId } = copParams.parse(request.params);
    const period = z.object({ period: z.string() }).parse(request.params).period;
    const keyId = await ensureWaterKey(db, copId);
    return { periodLabel: period, readings: await getReadings(keyId, period) };
  });

  app.put('/coproperties/:copId/water-readings', async (request) => {
    const { copId } = copParams.parse(request.params);
    const input = readingsSchema.parse(request.body);
    const keyId = await ensureWaterKey(db, copId);
    await setReadings(keyId, input.periodLabel, input.readings);
    return { periodLabel: input.periodLabel, readings: await getReadings(keyId, input.periodLabel) };
  });
}
