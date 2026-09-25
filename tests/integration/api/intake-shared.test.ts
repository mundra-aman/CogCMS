import mongoose from 'mongoose';
import { expect, it, vi } from 'vitest';
import { checkIntakeRateLimit } from '@/lib/auth/rate-limit';
import IntakeRateLimit from '@/models/IntakeRateLimit';

const visitor = (ip: string) => new Headers({ 'x-cms-visitor-ip': ip });

it('the operator provisions a TTL index which eventually removes expired buckets', async () => {
  await IntakeRateLimit.createIndexes();
  const collection = mongoose.connection.db!.collection('intake_rate_limits');
  expect(
    (await collection.indexes()).find((index) => index.key.expiresAt === 1)?.expireAfterSeconds,
  ).toBe(0);
  await mongoose.connection.db!.admin().command({ setParameter: 1, ttlMonitorSleepSecs: 1 });
  try {
    await IntakeRateLimit.create({
      _id: 'expired-test',
      tokens: 0,
      updatedAt: new Date(0),
      expiresAt: new Date(1),
    });
    await expect
      .poll(() => collection.countDocuments({}), { timeout: 10000, interval: 200 })
      .toBe(0);
  } finally {
    await mongoose.connection.db!.admin().command({ setParameter: 1, ttlMonitorSleepSecs: 60 });
  }
});

it('shares the 30-token IP ceiling across independent module instances and concurrent first callers', async () => {
  vi.resetModules();
  const other = await import('@/lib/auth/rate-limit');
  const now = Date.now();
  const results = await Promise.all(
    Array.from({ length: 45 }, (_, index) =>
      (index % 2 ? other.checkIntakeRateLimit : checkIntakeRateLimit)(
        visitor('203.0.113.8'),
        'shared',
        now,
      ),
    ),
  );
  expect(results.filter((result) => !result.limited)).toHaveLength(30);
  expect(results.filter((result) => result.limited)).toHaveLength(15);
  expect(await other.checkIntakeRateLimit(visitor('203.0.113.8'), 'shared', now + 2000)).toEqual({
    limited: false,
  });
});

it('shares 600 key tokens across IPs, never debits a rejected pair, and refills without relying on TTL deletion', async () => {
  const now = Date.now();
  for (let index = 0; index < 600; index++) {
    expect(
      await checkIntakeRateLimit(
        visitor(`198.51.${Math.floor(index / 250)}.${index % 250}`),
        'ceiling',
        now,
      ),
    ).toEqual({ limited: false });
  }
  expect(await checkIntakeRateLimit(visitor('203.0.113.10'), 'ceiling', now)).toEqual({
    limited: true,
    retryAfter: 1,
  });
  // A key rejection must leave this new visitor's full burst available on another key.
  for (let index = 0; index < 30; index++) {
    expect(await checkIntakeRateLimit(visitor('203.0.113.10'), 'fresh-key', now)).toEqual({
      limited: false,
    });
  }
  expect(await checkIntakeRateLimit(visitor('203.0.113.10'), 'fresh-key', now)).toEqual({
    limited: true,
    retryAfter: 2,
  });
  expect(await checkIntakeRateLimit(visitor('203.0.113.10'), 'ceiling', now + 60_000)).toEqual({
    limited: false,
  });
  const rows = await mongoose.connection.db!.collection('intake_rate_limits').find({}).toArray();
  expect(rows.length).toBeGreaterThan(0);
  expect(JSON.stringify(rows)).not.toContain('203.0.113.10');
  expect(rows.every((row) => row.expiresAt instanceof Date)).toBe(true);
});
