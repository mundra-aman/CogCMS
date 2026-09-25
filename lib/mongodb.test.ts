import { afterEach, expect, it, vi } from 'vitest';
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('mongoose', () => ({ default: { connect, connection: { readyState: 0 } } }));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({
    MONGODB_URI: 'mongodb://sentinel:secret@invalid',
    MONGODB_DB_NAME: 'test',
    NODE_ENV: 'production',
  }),
}));
afterEach(() => {
  connect.mockReset();
  delete (globalThis as any).__cmsMongoose;
  vi.resetModules();
});
it('bounds the shared pool and never provisions indexes or collections', async () => {
  const db = await import('./mongodb');
  connect.mockResolvedValue({});
  await Promise.all([db.default(), db.default()]);
  expect(connect).toHaveBeenCalledTimes(1);
  expect(connect.mock.calls[0][1]).toMatchObject({
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 60000,
    waitQueueTimeoutMS: 5000,
    autoIndex: false,
    autoCreate: false,
  });
});
it('redacts connection errors and retries a rejected initialization', async () => {
  const db = await import('./mongodb');
  connect
    .mockRejectedValueOnce(new Error('mongodb://sentinel:secret@invalid'))
    .mockResolvedValueOnce({});
  await expect(db.default()).rejects.toThrow('Database connection failed');
  await expect(db.default()).resolves.toEqual({});
  expect(connect).toHaveBeenCalledTimes(2);
});
