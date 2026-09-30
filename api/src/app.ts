import express from 'express';
import type { Config } from './lib/config.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { cors, requestLogger } from './lib/http.js';
import { healthRouter } from './routes/health.js';

/**
 * Build the Express app without calling listen(), so the same app runs under
 * the local server (server.ts), on Lambda (lambda.ts, Phase 5) and in tests.
 */
export function createApp(config: Config) {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(cors(config.CORS_ORIGIN));
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
