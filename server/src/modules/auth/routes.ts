import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { countUsers, createUser, findByEmail } from './service.js';
import { verifyPassword } from './password.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().nullish(),
  role: z.enum(['BUREAU', 'COPROPRIETAIRE']).optional(),
  copropertyId: z.string().uuid().nullish(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Inscription. Le tout premier compte est forcément BUREAU (amorçage, ouvert).
  // Ensuite, l'onRequest hook impose un jeton BUREAU pour créer d'autres comptes.
  app.post('/auth/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const bootstrap = (await countUsers()) === 0;
    if (await findByEmail(input.email)) {
      return reply.code(409).send({ error: 'Conflict', message: 'E-mail déjà utilisé.' });
    }
    const role = bootstrap ? 'BUREAU' : (input.role ?? 'COPROPRIETAIRE');
    const user = await createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName ?? null,
      role,
      copropertyId: input.copropertyId ?? null,
    });
    return reply.code(201).send({ user });
  });

  app.post('/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await findByEmail(input.email);
    if (!user || !verifyPassword(input.password, user.password_hash)) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Identifiants invalides.' });
    }
    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role }, { expiresIn: '7d' });
    return {
      token,
      user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role, coproperty_id: user.coproperty_id },
    };
  });

  app.get('/auth/me', async (request) => {
    return { user: request.user };
  });
}
