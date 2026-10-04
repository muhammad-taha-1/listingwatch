import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import serverless from 'serverless-http';
import { createApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { loadSecretsFromSsm } from './lib/ssm.js';

type HttpHandler = serverless.Handler;

// Module scope survives between warm invocations of the same Lambda container,
// so the setup below (SSM fetch, config, Mongo pool, Express app) runs once per
// cold start and every later request reuses it.
let ready: Promise<HttpHandler> | undefined;

async function init(requestId: string): Promise<HttpHandler> {
  const started = Date.now();
  await loadSecretsFromSsm();
  const config = loadConfig();
  await connectDb(config.MONGODB_URI);
  const app = createApp(config);
  logger.info({ requestId, initMs: Date.now() - started }, 'cold start complete');
  // serverless-http turns the API Gateway event into a Node request for
  // Express, and Express's response back into the shape API Gateway expects.
  return serverless(app);
}

/** Lambda entry for ApiFunction (HTTP API, payload format 2.0). */
export async function handler(event: APIGatewayProxyEventV2, context: Context) {
  ready ??= init(context.awsRequestId).catch((err: unknown) => {
    logger.error({ requestId: context.awsRequestId, err }, 'cold start failed');
    // Don't cache a failed start (e.g. Atlas unreachable); the next request retries.
    ready = undefined;
    throw err;
  });
  const handle = await ready;
  return handle(event, context);
}
