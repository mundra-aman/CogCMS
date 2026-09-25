import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { verifyPassword } from '@/lib/auth/password';
import { seedAdmin } from '@/scripts/seed-admin';
import User from '@/models/User';

const original = {
  email: process.env.CMS_SEED_ADMIN_EMAIL,
  password: process.env.CMS_SEED_ADMIN_PASSWORD,
  name: process.env.CMS_SEED_ADMIN_NAME,
};

beforeEach(() => {
  process.env.CMS_SEED_ADMIN_EMAIL = 'seed-admin@example.com';
  process.env.CMS_SEED_ADMIN_PASSWORD = 'initial-password-123';
  process.env.CMS_SEED_ADMIN_NAME = 'Seed Admin';
  resetEnvCache();
});

afterEach(() => {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore('CMS_SEED_ADMIN_EMAIL', original.email);
  restore('CMS_SEED_ADMIN_PASSWORD', original.password);
  restore('CMS_SEED_ADMIN_NAME', original.name);
  resetEnvCache();
});

describe('seed admin', () => {
  it('is idempotent and never replaces the existing password', async () => {
    const first = await seedAdmin();
    expect(first.created).toBe(true);
    const seeded = await User.findById(first.userId).select('+passwordHash').exec();
    expect(await verifyPassword('initial-password-123', seeded?.passwordHash)).toBe(true);

    process.env.CMS_SEED_ADMIN_PASSWORD = 'replacement-password-456';
    resetEnvCache();
    const second = await seedAdmin();
    expect(second).toEqual({ created: false, userId: first.userId });

    const unchanged = await User.findById(first.userId).select('+passwordHash').exec();
    expect(await verifyPassword('initial-password-123', unchanged?.passwordHash)).toBe(true);
    expect(await verifyPassword('replacement-password-456', unchanged?.passwordHash)).toBe(false);
    expect(await User.countDocuments({ role: 'admin' })).toBe(1);
  });
});
