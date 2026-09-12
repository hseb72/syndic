import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  // URL de connexion PostgreSQL, ex. postgres://user:pass@localhost:5432/syndic
  databaseUrl: required('DATABASE_URL', 'postgres://syndic:syndic@localhost:5432/syndic'),
  // Origines autorisées pour le front (CORS), séparées par des virgules.
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(',').map((s) => s.trim()),
} as const;
