import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';

/**
 * Runner de migrations minimaliste.
 * - Les migrations sont des fichiers SQL versionnés dans db/migrations/,
 *   nommés `NNNN_libelle.sql` (ordre lexicographique = ordre d'application).
 * - Chaque migration non encore appliquée est exécutée dans UNE transaction.
 * - La table schema_migrations garde la trace de ce qui a été appliqué.
 *
 * schema.sql n'existe plus séparément : la migration 0001_init.sql EST le
 * schéma de référence.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '../../../db/migrations');

async function run(): Promise<void> {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await pool.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(
        (r) => r.version,
      ),
    );

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (applied.has(version)) continue;

      const sql = await readFile(join(migrationsDir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`✓ migration appliquée : ${version}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✗ échec de la migration ${version} — rollback`);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(count === 0 ? 'Base à jour, aucune migration à appliquer.' : `${count} migration(s) appliquée(s).`);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
