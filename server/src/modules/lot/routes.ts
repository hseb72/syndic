import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addLotOwner, createLot, deleteLot, equalizeOwners, getOverview, patchLot, removeLotOwner, setLotOwner, setOwnerShare } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const lotParams = z.object({ copId: z.string().uuid(), lotId: z.string().uuid() });
const ownerParams = z.object({ copId: z.string().uuid(), lotId: z.string().uuid(), personId: z.string().uuid() });

const addOwnerSchema = z.object({
  personId: z.string().uuid().nullish(),
  name: z.string().nullish(),
  sharePct: z.number().min(0).max(100).nullish(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

const shareSchema = z.object({ sharePct: z.number().min(0).max(100) });

const createLotSchema = z.object({
  lotNumber: z.string().min(1),
  description: z.string().nullish(),
  tantiemes: z.number().positive(),
  buildingId: z.string().uuid().nullish(),
  ownerPersonId: z.string().uuid().nullish(),
  ownerName: z.string().nullish(),
});

const patchLotSchema = z.object({
  lotNumber: z.string().min(1).optional(),
  description: z.string().nullish(),
  tantiemes: z.number().positive().optional(),
});

const ownerSchema = z.object({
  personId: z.string().uuid().nullish(),
  name: z.string().nullish(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

const importSchema = z.object({
  lots: z
    .array(
      z.object({
        lotNumber: z.string().min(1),
        tantiemes: z.number().positive(),
        ownerName: z.string().nullish(),
        description: z.string().nullish(),
      }),
    )
    .min(1),
});

export async function lotRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties/:copId/overview', async (request) => {
    const { copId } = copParams.parse(request.params);
    return getOverview(copId);
  });

  app.post('/coproperties/:copId/lots', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const input = createLotSchema.parse(request.body);
    const overview = await createLot(copId, input);
    return reply.code(201).send(overview);
  });

  app.post('/coproperties/:copId/lots/import', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    const { lots } = importSchema.parse(request.body);
    let overview = await getOverview(copId);
    for (const l of lots) {
      overview = await createLot(copId, {
        lotNumber: l.lotNumber,
        tantiemes: l.tantiemes,
        ownerName: l.ownerName ?? null,
        description: l.description ?? null,
      });
    }
    return reply.code(201).send(overview);
  });

  app.patch('/coproperties/:copId/lots/:lotId', async (request) => {
    const { copId, lotId } = lotParams.parse(request.params);
    const input = patchLotSchema.parse(request.body);
    return patchLot(copId, lotId, input);
  });

  app.delete('/coproperties/:copId/lots/:lotId', async (request) => {
    const { copId, lotId } = lotParams.parse(request.params);
    return deleteLot(copId, lotId);
  });

  app.post('/coproperties/:copId/lots/:lotId/owner', async (request) => {
    const { copId, lotId } = lotParams.parse(request.params);
    const input = ownerSchema.parse(request.body);
    return setLotOwner(copId, lotId, input);
  });

  // Indivision : gérer plusieurs copropriétaires sur un même lot.
  app.post('/coproperties/:copId/lots/:lotId/owners', async (request, reply) => {
    const { copId, lotId } = lotParams.parse(request.params);
    const input = addOwnerSchema.parse(request.body);
    const overview = await addLotOwner(copId, lotId, input);
    return reply.code(201).send(overview);
  });

  app.patch('/coproperties/:copId/lots/:lotId/owners/:personId', async (request) => {
    const { copId, lotId, personId } = ownerParams.parse(request.params);
    const { sharePct } = shareSchema.parse(request.body);
    return setOwnerShare(copId, lotId, personId, sharePct);
  });

  app.delete('/coproperties/:copId/lots/:lotId/owners/:personId', async (request) => {
    const { copId, lotId, personId } = ownerParams.parse(request.params);
    return removeLotOwner(copId, lotId, personId);
  });

  // Répartir la pleine propriété à parts égales entre les personnes rattachées.
  app.post('/coproperties/:copId/lots/:lotId/owners/equalize', async (request) => {
    const { copId, lotId } = lotParams.parse(request.params);
    return equalizeOwners(copId, lotId);
  });
}
