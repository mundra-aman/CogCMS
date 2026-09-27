import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  deleteOne: vi.fn(),
  deleteMany: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock('@/models/BlogRevision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/models/BlogRevision')>()),
  default: {
    create: mocks.create,
    deleteOne: mocks.deleteOne,
    deleteMany: mocks.deleteMany,
    find: mocks.find,
  },
}));
vi.mock('@/models/Blog', () => ({ default: { findOneAndUpdate: mocks.findOneAndUpdate } }));

import { updateBlogWithRevision } from '@/lib/blog-revisions/store';

const exec = <T>(value: T | Error) => ({
  exec: () => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)),
});
const chain = <T>(value: T) => {
  const query = {
    sort: () => query,
    skip: () => query,
    select: () => query,
    lean: () => query,
    exec: () => Promise.resolve(value),
  };
  return query;
};

const siteId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const editorId = new Types.ObjectId();
const revisionId = new Types.ObjectId();
const existing = {
  _id: new Types.ObjectId(),
  title: 'Before',
  slug: 'post',
  content: '<p>Old</p>',
  status: 'publish',
  updatedAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedBy: editorId,
  createdBy: null,
} as never;

beforeEach(() => {
  calls.length = 0;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.create.mockImplementation(async () => {
    calls.push('create');
    return { _id: revisionId };
  });
  mocks.deleteOne.mockImplementation(() => {
    calls.push('discard');
    return exec({ deletedCount: 1 });
  });
  mocks.find.mockImplementation(() => {
    calls.push('prune');
    return chain([]);
  });
});

function updateReturns(value: object | null | Error) {
  mocks.findOneAndUpdate.mockImplementation(() => {
    calls.push('update');
    return exec(value);
  });
}

const run = () =>
  updateBlogWithRevision({
    existing,
    siteId,
    update: { title: 'After' },
    userId,
    reason: 'edit',
  });

describe('updateBlogWithRevision', () => {
  it('saves the old version before updating, then prunes', async () => {
    updateReturns({ ...(existing as object), title: 'After' });
    const result = await run();
    expect(calls).toEqual(['create', 'update', 'prune']);
    expect(result.revisionId).toBe(revisionId.toString());
    const saved = mocks.create.mock.calls[0][0];
    expect(saved.snapshot.title).toBe('Before');
    expect(saved.savedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));
    expect(saved.savedBy).toBe(editorId);
    expect(saved.replacedBy.toString()).toBe(userId);
    expect(saved.reason).toBe('edit');
  });

  it('discards the revision and rethrows when the update fails', async () => {
    updateReturns(new Error('duplicate slug'));
    await expect(run()).rejects.toThrow('duplicate slug');
    expect(calls).toEqual(['create', 'update', 'discard']);
  });

  it('discards the revision when the save changed nothing', async () => {
    updateReturns({ ...(existing as object) });
    const result = await run();
    expect(calls).toEqual(['create', 'update', 'discard']);
    expect(result.revisionId).toBeNull();
  });

  it('discards the revision when the blog disappeared mid-save', async () => {
    updateReturns(null);
    expect(await run()).toEqual({ blog: null, revisionId: null });
    expect(calls).toEqual(['create', 'update', 'discard']);
  });

  it('refuses the save when history cannot be written', async () => {
    mocks.create.mockRejectedValue(new Error('mongo down'));
    await expect(run()).rejects.toThrow('mongo down');
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('prunes only revisions beyond the limit', async () => {
    const stale = [{ _id: new Types.ObjectId() }];
    mocks.find.mockImplementation(() => chain(stale));
    mocks.deleteMany.mockImplementation(() => exec({ deletedCount: 1 }));
    updateReturns({ ...(existing as object), title: 'After' });
    await run();
    expect(mocks.deleteMany).toHaveBeenCalledWith({ _id: { $in: [stale[0]._id] } });
  });
});
