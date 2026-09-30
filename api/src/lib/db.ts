import mongoose from 'mongoose';
import { logger } from './logger.js';

// Cache the connection promise at module scope. On Lambda the module stays
// loaded between warm invocations, so we reuse one pool instead of opening a
// new connection per request (which would exhaust Atlas M0's connection limit).
let connection: Promise<typeof mongoose> | undefined;

export function connectDb(uri: string): Promise<typeof mongoose> {
  if (!connection) {
    connection = mongoose
      .connect(uri, {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
      })
      .then((m) => {
        logger.info({ db: m.connection.name }, 'mongo connected');
        return m;
      })
      .catch((err: unknown) => {
        // Don't cache a failed attempt; the next call should retry.
        connection = undefined;
        throw err;
      });
  }
  return connection;
}

export async function disconnectDb(): Promise<void> {
  connection = undefined;
  await mongoose.disconnect();
}

/** Round-trip to the server; used by GET /health. */
export async function pingDb(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) return false;
  try {
    await db.admin().ping();
    return true;
  } catch {
    return false;
  }
}
