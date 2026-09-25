import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Blog from '@/models/Blog';
import Site from '@/models/Site';
import User from '@/models/User';

// The integration harness already owns a temporary replica-set connection.
// Replace only connection routing; execute real models and transactions.
vi.mock('@/lib/mongodb', () => ({ default: async () => mongoose }));
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    getEnv: () => ({
      ...actual.getEnv(),
      MONGODB_URI: 'mongodb://localhost:27017/?replicaSet=rs0',
      MONGODB_DB_NAME: 'cms_public_demo',
    }),
  };
});

import { seedDemo } from '@/scripts/seed-demo';

afterEach(() => vi.restoreAllMocks());

async function createAdmin() {
  await User.create({
    name: 'Demo Admin', email: 'demo@example.test', passwordHash: 'unused-test-hash',
    role: 'admin', siteIds: [], status: 'active',
  });
}

describe('demo database seed', () => {
  it('commits both sites and all blogs, then refuses a rerun without changes', async () => {
    await createAdmin();
    await seedDemo();
    const sites = await Site.find({}).sort({ slug: 1 });
    expect(sites.map((site) => site.slug)).toEqual(['harbor-notes', 'northstar-studio']);
    expect(await Blog.countDocuments({ siteId: sites[0]._id })).toBe(18);
    expect(await Blog.countDocuments({ siteId: sites[1]._id })).toBe(30);
    await expect(seedDemo()).rejects.toThrow('nothing was changed');
    expect(await Site.countDocuments({})).toBe(2);
    expect(await Blog.countDocuments({})).toBe(48);
  });

  it('rolls back new sites if blog insertion fails', async () => {
    await createAdmin();
    vi.spyOn(Blog, 'insertMany').mockRejectedValueOnce(new Error('simulated insert failure'));
    await expect(seedDemo()).rejects.toThrow('simulated insert failure');
    expect(await Site.countDocuments({})).toBe(0);
    expect(await Blog.countDocuments({})).toBe(0);
    expect(await User.countDocuments({})).toBe(1);
  });
});
