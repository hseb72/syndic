import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getMySummary } from './service.js';
import { canAccessCoproperty } from '../auth/access.js';

const query = z.object({
  copId: z.string().uuid(),
  exerciseId: z.string().uuid().optional(),
});

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me/summary', async (request, reply) => {
    const { copId, exerciseId } = query.parse(request.query);
    // Une personne peut posséder dans plusieurs copropriétés : on borne
    // l'accès à celles où elle possède réellement un lot.
    if (!(await canAccessCoproperty(request.user, copId))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Accès non autorisé à cette copropriété.' });
    }
    return getMySummary(request.user.sub, copId, exerciseId);
  });
}
