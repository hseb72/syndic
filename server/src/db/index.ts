import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';
import type { Database } from './types.js';

// NUMERIC (OID 1700) : node-postgres le renvoie en string par défaut, ce qui
// est exactement ce qu'on veut pour les montants (pas de flottant). On le
// laisse tel quel — on convertit en décimal contrôlé côté domaine si besoin.

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDb(): Promise<void> {
  await db.destroy();
}
