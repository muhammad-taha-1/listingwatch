import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import serverless from 'serverless-http';
import { createApp } from './app.js';
import { cachedSetup } from './lib/coldStart.js';
import { loadConfig } from './lib/config.js';
import { connectDb } from './lib/db.js';
import { loadSecretsFromSsm } from './lib/ssm.js';

// Runs once per cold start; warm requests reuse the same Express app and Mongo pool.
const setup = cachedSetup(async () => {
  await loadSecretsFromSsm();
  const config = loadConfig();
  await connectDb(config.MONGODB_URI);
  // serverless-http turns the API Gateway event into a Node request for
  // Express, and Express's response back into the shape API Gateway expects.
  return serverless(createApp(config));
});

/** Lambda entry for ApiFunction (HTTP API, payload format 2.0). */
export async function handler(event: APIGatewayProxyEventV2, context: Context) {
  const handle = await setup(context.awsRequestId);
  return handle(event, context);
}
