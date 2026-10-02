import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { createApp } from '../src/app.js';
import { parseConfig } from '../src/lib/config.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';

export const ADMIN_TOKEN = 'test-admin-token-0123456789';
export const authHeader = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/**
 * Start an in-memory MongoDB for the test file and return a getter for an app
 * wired to it. Collections are emptied after each test.
 */
export function useTestApp() {
  let mongo: MongoMemoryServer;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const config = parseConfig({
      NODE_ENV: 'test',
      MONGODB_URI: mongo.getUri('listingwatch-test'),
      ADMIN_TOKEN,
      // Never used for real calls: tests inject a fake AI reviewer.
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      LOG_LEVEL: 'silent',
    });
    await connectDb(config.MONGODB_URI);
    // Build indexes up front so unique-index behaviour is deterministic.
    await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
    app = createApp(config);
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db?.collections();
    await Promise.all((collections ?? []).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectDb();
    await mongo.stop();
  });

  return () => app;
}
