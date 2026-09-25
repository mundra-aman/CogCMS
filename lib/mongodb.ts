import mongoose from 'mongoose';
import { getEnv } from '@/lib/env';

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

// One connection per process, surviving Next's dev-mode module reloads.
const globalWithMongoose = globalThis as typeof globalThis & { __cmsMongoose?: Cached };
const cached: Cached = globalWithMongoose.__cmsMongoose ?? { conn: null, promise: null };
globalWithMongoose.__cmsMongoose = cached;

export default async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const env = getEnv();
    cached.promise = mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      bufferCommands: false,
      autoIndex: false,
      autoCreate: false,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      waitQueueTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch {
    cached.promise = null;
    throw new Error('Database connection failed');
  }
  return cached.conn;
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
