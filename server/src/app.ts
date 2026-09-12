import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.js';
import { pool } from './db/index.js';
import { copropertyRoutes } from './modules/coproperty/routes.js';
import { personRoutes } from './modules/person/routes.js';
import { buildingRoutes } from './modules/building/routes.js';
import { lotRoutes } from './modules/lot/routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      transport:
        config.env === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
  });

  await app.register(cors, { origin: config.corsOrigins });

  // Erreurs de validation zod -> 400 lisible.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'ValidationError',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    app.log.error(error);
    return reply.code(error.statusCode ?? 500).send({
      error: error.name ?? 'InternalError',
      message: error.message,
    });
  });

  // Santé : liveness + vérification d'accès à la base.
  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok', db: 'up', time: new Date().toISOString() };
  });

  await app.register(copropertyRoutes, { prefix: '/api' });
  await app.register(personRoutes, { prefix: '/api' });
  await app.register(buildingRoutes, { prefix: '/api' });
  await app.register(lotRoutes, { prefix: '/api' });

  return app;
}
