import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createCoproperty, getCoproperty, listCoproperties, updateCoproperty } from './service.js';
import { accessibleCopropertyIds, canAccessCoproperty } from '../auth/access.js';

const createSchema = z.object({
  name: z.string().min(1, 'Le nom est obligatoire.'),
  address: z.string().nullish(),
  postalCode: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().length(2).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().nullish(),
  postalCode: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().length(2).optional(),
});

const idParams = z.object({ id: z.string().uuid() });

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

  app.get('/coproperties/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const cop = await getCoproperty(id);
    if (!cop) return reply.code(404).send({ error: 'NotFound', message: 'Copropriété introuvable.' });
    return cop;
  });

  app.patch('/coproperties/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    // Sécurité : seul le bureau écrit (déjà garanti globalement), et on borne
    // à une copropriété accessible.
    if (!(await canAccessCoproperty(request.user, id))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Accès non autorisé à cette copropriété.' });
    }
    const input = updateSchema.parse(request.body);
    return updateCoproperty(id, input);
  });
}
