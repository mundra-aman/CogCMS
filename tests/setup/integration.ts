import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, inject, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';

const databaseName = `cognerd_cms_test_${process.pid}`;

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.MONGODB_URI = inject('mongoUri');
  process.env.MONGODB_DB_NAME = databaseName;
  process.env.CMS_JWT_SECRET = 'integration-secret-integration-secret-1234';
  process.env.NEXT_PUBLIC_CMS_URL = 'http://localhost:3003';
  resetEnvCache();

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: databaseName,
    bufferCommands: false,
    autoIndex: true,
  });
});

beforeEach(async () => {
  const collections = (await mongoose.connection.db?.collections()) ?? [];
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  vi.unstubAllEnvs();
  resetEnvCache();
});
