import { createApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { connectDb, disconnectDb } from './lib/db.js';
import { logger } from './lib/logger.js';

async function main() {
  const config = loadConfig();
  await connectDb(config.MONGODB_URI);

  const server = createApp(config).listen(config.PORT, () => {
    logger.info({ port: config.PORT }, `API listening on http://localhost:${config.PORT}`);
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
