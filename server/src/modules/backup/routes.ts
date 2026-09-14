import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canAccessCoproperty } from '../auth/access.js';
import { exportCoproperty, importCoproperty } from './service.js';

const copParams = z.object({ copId: z.string().uuid() });
const importSchema = z.object({
  mode: z.enum(['NEW', 'RESTORE']),
  file: z.record(z.string(), z.unknown()),
});

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  // Export : lecture, mais réservée au bureau (données financières + personnelles
  // de toute la copropriété). La garde globale ne restreint que les écritures.
  app.get('/coproperties/:copId/export', async (request, reply) => {
    const { copId } = copParams.parse(request.params);
    if (request.user.role !== 'BUREAU') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Export réservé au bureau.' });
    }
    if (!(await canAccessCoproperty(request.user, copId))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Accès non autorisé à cette copropriété.' });
    }
    const data = await exportCoproperty(copId);
    reply.header('Content-Disposition', `attachment; filename="copro-${copId}.json"`);
    return data;
  });

  // Import : réservé au bureau (écriture → déjà garanti globalement). Hors du
  // préfixe /coproperties/:copId car il peut créer une copropriété.
  app.post('/coproperty-import', async (request, reply) => {
    const { mode, file } = importSchema.parse(request.body);
    return reply.code(201).send(await importCoproperty(file, mode));
  });
}
