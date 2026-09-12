import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createPerson, listPersons } from './service.js';

const createSchema = z.object({
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  companyName: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  phone: z.string().nullish(),
});

export async function personRoutes(app: FastifyInstance): Promise<void> {
  app.get('/persons', async () => listPersons());

  app.post('/persons', async (request, reply) => {
    const input = createSchema.parse(request.body);
    const created = await createPerson({
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      companyName: input.companyName ?? null,
      email: input.email || null,
      phone: input.phone ?? null,
    });
    return reply.code(201).send(created);
  });
}
