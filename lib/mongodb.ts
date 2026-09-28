import dns from 'node:dns';
import mongoose from 'mongoose';
import { getEnv } from '@/lib/env';

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

// One connection per process, surviving Next's dev-mode module reloads.
const globalWithMongoose = globalThis as typeof globalThis & { __cmsMongoose?: Cached };
const cached: Cached = globalWithMongoose.__cmsMongoose ?? { conn: null, promise: null };
globalWithMongoose.__cmsMongoose = cached;

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Fall back to default resolver
}

async function getEffectiveUri(uri: string): Promise<string> {
  if (!uri.startsWith('mongodb+srv://')) return uri;
  try {
    const dnsPromises = await import('node:dns/promises');
    dnsPromises.setServers(['8.8.8.8', '1.1.1.1']);
    const match = uri.match(/^mongodb\+srv:\/\/([^:]+:[^@]+)@([^/?]+)(\/.*)?$/);
    if (!match) return uri;
    const [, auth, host, pathAndQuery = ''] = match;
    const [records, txtRecords] = await Promise.all([
      dnsPromises.resolveSrv(`_mongodb._tcp.${host}`),
      dnsPromises.resolveTxt(host).catch(() => []),
    ]);
    if (!records.length) return uri;
    const hosts = records.map((r) => `${r.name}:${r.port}`).join(',');
    const txtParams = txtRecords.flat().join('&');
    const separator = pathAndQuery.includes('?') ? '&' : '?';
    const params = [txtParams, 'ssl=true'].filter(Boolean).join('&');
    const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
    return `mongodb://${auth}@${hosts}${path}${separator}${params}`;
  } catch {
    return uri;
  }
}

export default async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const env = getEnv();
    cached.promise = (async () => {
      const uri = await getEffectiveUri(env.MONGODB_URI);
      return mongoose.connect(uri, {
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
    })();
  }
  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    const msg = error instanceof Error ? error.message.replace(/:([^:@]+)@/, ':***@') : String(error);
    console.error('[cms:db-error]', msg);
    throw new Error('Database connection failed');
  }
  return cached.conn;
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
