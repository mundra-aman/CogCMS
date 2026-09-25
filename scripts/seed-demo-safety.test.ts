import { afterEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import Site from '@/models/Site';
import Blog from '@/models/Blog';
import User from '@/models/User';
import { seedDemo } from './seed-demo';

vi.mock('@/lib/env', () => ({ getEnv: () => ({ MONGODB_URI: 'mongodb://localhost:27017/', MONGODB_DB_NAME: 'cms_public_demo' }) }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn(async () => undefined) }));
afterEach(() => vi.restoreAllMocks());

it.each(['site', 'blog', 'admin'])('does not start writes when existing %s data makes the demo unsafe', async (kind) => {
  const admin = { _id: new mongoose.Types.ObjectId() };
  vi.spyOn(User, 'find').mockReturnValue({ select: () => ({ exec: async () => kind === 'admin' ? [] : [admin] }) } as never);
  vi.spyOn(Site, 'countDocuments').mockResolvedValue(kind === 'site' ? 1 : 0);
  vi.spyOn(Blog, 'countDocuments').mockResolvedValue(kind === 'blog' ? 1 : 0);
  const transaction = vi.spyOn(mongoose.connection, 'transaction');
  await expect(seedDemo()).rejects.toThrow(/nothing was changed/);
  expect(transaction).not.toHaveBeenCalled();
});
