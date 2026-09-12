import { buildApp } from './app.js';
import { config } from './config.js';
import { closeDb } from './db/index.js';

const app = await buildApp();

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Signal ${signal} reçu, arrêt en cours…`);
  await app.close();
  await closeDb();
  process.exit(0);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void shutdown(sig));
}
