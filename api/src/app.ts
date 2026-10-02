import express from 'express';
import type { Config } from './lib/config.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { cors, requestLogger } from './lib/http.js';
import { checksRouter } from './routes/checks.js';
import { healthRouter } from './routes/health.js';
import { restaurantsRouter } from './routes/restaurants.js';
import { createAiReviewer, createAnthropicClient, type AiReviewer } from './services/aiReviewer.js';

/** Dependencies tests can replace with fakes. */
export interface AppDeps {
  aiReviewer?: AiReviewer;
}

/**
 * Build the Express app without calling listen(), so the same app runs under
 * the local server (server.ts), on Lambda (lambda.ts, Phase 5) and in tests.
 */
export function createApp(config: Config, deps: AppDeps = {}) {
  const aiReviewer =
    deps.aiReviewer ?? createAiReviewer(createAnthropicClient(config.ANTHROPIC_API_KEY));
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(cors(config.CORS_ORIGIN));
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);
  app.use('/restaurants', restaurantsRouter(config.ADMIN_TOKEN, aiReviewer));
  app.use('/checks', checksRouter(config.ADMIN_TOKEN));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
