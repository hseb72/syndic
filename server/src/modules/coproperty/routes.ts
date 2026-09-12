import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createCoproperty, listCoproperties } from './service.js';
import { accessibleCopropertyIds } from '../auth/access.js';

const createSchema = z.object({
  name: z.string().min(1, 'Le nom est obligatoire.'),
  address: z.string().nullish(),
  postalCode: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().length(2).optional(),
});

export async function copropertyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coproperties', async (request) => {
    // Bureau : toutes. Copropriétaire : seulement celles où il possède un lot.
    const restrict = request.user.role === 'BUREAU' ? null : await accessibleCopropertyIds(request.user);
    return listCoproperties(restrict);
  });

  app.post('/coproperties', async (request, reply) => {
    const input = createSchema.parse(request.body);
    const created = await createCoproperty(input);
    return reply.code(201).send(created);
  });
}
