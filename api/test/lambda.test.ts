import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handler } from '../src/lambda.js';
import { resetConfigCache } from '../src/lib/config.js';
import { disconnectDb } from '../src/lib/db.js';

/** A minimal HTTP API (payload format 2.0) event, as API Gateway sends it. */
function httpEvent(path: string, requestId = 'dYUDXhPdIAMEbHA='): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'abc123.execute-api.eu-west-1.amazonaws.com' },
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'abc123',
      domainName: 'abc123.execute-api.eu-west-1.amazonaws.com',
      domainPrefix: 'abc123',
      http: { method: 'GET', path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' },
      requestId,
      routeKey: '$default',
      stage: '$default',
      time: '04/Oct/2026:12:00:00 +0000',
      timeEpoch: 0,
    },
  };
}

const context = { awsRequestId: 'test-invocation-id' } as Context;

async function invoke(path: string) {
  return (await handler(httpEvent(path), context)) as APIGatewayProxyStructuredResultV2;
}

describe('Lambda handler', () => {
  let mongo: MongoMemoryServer;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    process.env = originalEnv;
    resetConfigCache();
    await disconnectDb();
    await mongo.stop();
  });

  it('fails a cold start with bad config, then retries on the next request', async () => {
    // Order matters: this runs before any successful cold start in this file.
    resetConfigCache();
    process.env.MONGODB_URI = mongo.getUri('listingwatch-test');
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    delete process.env.ADMIN_TOKEN;

    await expect(invoke('/health')).rejects.toThrow(/ADMIN_TOKEN/);

    process.env.ADMIN_TOKEN = 'test-admin-token-0123456789';
    const res = await invoke('/health');
    expect(res.statusCode).toBe(200);
  });

  it('serves the Express app and keeps the API Gateway request id', async () => {
    const res = await invoke('/health');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '')).toMatchObject({ status: 'ok', db: 'up' });
    expect(res.headers?.['x-request-id']).toBe('dYUDXhPdIAMEbHA=');
  });

  it('returns the standard 404 shape for unknown routes', async () => {
    const res = await invoke('/nope');

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body ?? '').error).toMatchObject({ code: 'NOT_FOUND' });
  });
});
