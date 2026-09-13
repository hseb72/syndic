import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.js';
import { pool } from './db/index.js';
import { countUsers } from './modules/auth/service.js';
import { canAccessCoproperty } from './modules/auth/access.js';
import { authRoutes } from './modules/auth/routes.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: string };
    user: { sub: string; email: string; role: string };
  }
}
import { copropertyRoutes } from './modules/coproperty/routes.js';
import { personRoutes } from './modules/person/routes.js';
import { buildingRoutes } from './modules/building/routes.js';
import { lotRoutes } from './modules/lot/routes.js';
import { exerciseRoutes } from './modules/exercise/routes.js';
import { supplierRoutes } from './modules/supplier/routes.js';
import { invoiceRoutes } from './modules/invoice/routes.js';
import { chargesRoutes } from './modules/charges/routes.js';
import { budgetRoutes } from './modules/budget/routes.js';
import { fundCallRoutes } from './modules/fundcall/routes.js';
import { paymentRoutes } from './modules/payment/routes.js';
import { regularisationRoutes } from './modules/regularisation/routes.js';
import { bankRoutes } from './modules/bank/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { accountingRoutes } from './modules/accounting/routes.js';
import { meRoutes } from './modules/me/routes.js';
import { noticeRoutes } from './modules/notice/routes.js';

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
  await app.register(fastifyJwt, { secret: config.jwtSecret });

  // Garde d'accès : /health et /api/auth/login sont publics ; /api/auth/register
  // est ouvert uniquement pour amorcer le tout premier compte (BUREAU). Tout le
  // reste exige un jeton valide, et toute écriture exige le rôle BUREAU.
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0] ?? '';
    if (url === '/health' || url === '/api/auth/login') return;
    if (url === '/api/auth/register' && (await countUsers()) === 0) return;

    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Authentification requise.' });
    }

    const isWrite = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS';
    if (isWrite && request.user.role !== 'BUREAU') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Action réservée au bureau.' });
    }

    // Cloisonnement par copropriété : un copropriétaire ne peut consulter que
    // les copropriétés où il possède un lot. Le bureau accède à tout. Toutes
    // les routes métier sont préfixées /api/coproperties/{copId}/… : on borne
    // ici l'accès en amont, de façon uniforme, quel que soit l'endpoint.
    if (request.user.role !== 'BUREAU') {
      const m = url.match(/^\/api\/coproperties\/([0-9a-fA-F-]{36})(?:\/|$)/);
      if (m?.[1] && !(await canAccessCoproperty(request.user, m[1]))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Accès non autorisé à cette copropriété.' });
      }
    }
  });

  // Erreurs de validation zod -> 400 lisible.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      // Tracer les erreurs de validation : sinon un 400 reste invisible côté serveur.
      request.log.warn({ url: request.url, issues }, 'Requête rejetée (validation)');
      return reply.code(400).send({ error: 'ValidationError', issues });
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

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(copropertyRoutes, { prefix: '/api' });
  await app.register(personRoutes, { prefix: '/api' });
  await app.register(buildingRoutes, { prefix: '/api' });
  await app.register(lotRoutes, { prefix: '/api' });
  await app.register(exerciseRoutes, { prefix: '/api' });
  await app.register(supplierRoutes, { prefix: '/api' });
  await app.register(invoiceRoutes, { prefix: '/api' });
  await app.register(chargesRoutes, { prefix: '/api' });
  await app.register(budgetRoutes, { prefix: '/api' });
  await app.register(fundCallRoutes, { prefix: '/api' });
  await app.register(paymentRoutes, { prefix: '/api' });
  await app.register(regularisationRoutes, { prefix: '/api' });
  await app.register(bankRoutes, { prefix: '/api' });
  await app.register(dashboardRoutes, { prefix: '/api' });
  await app.register(accountingRoutes, { prefix: '/api' });
  await app.register(meRoutes, { prefix: '/api' });
  await app.register(noticeRoutes, { prefix: '/api' });

  return app;
}
