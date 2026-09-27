import { beforeEach, describe, expect, it, vi } from 'vitest';
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/webhook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/webhook')>()),
  notifySiteWebhook: notify,
}));
import { Types } from 'mongoose';
import { POST as createBlog } from '@/app/api/admin/blogs/route';
import { DELETE as deleteBlog, PUT as updateBlog } from '@/app/api/admin/blogs/[slug]/route';
import { GET as listRevisions } from '@/app/api/admin/blogs/[slug]/revisions/route';
import { GET as getRevision } from '@/app/api/admin/blogs/[slug]/revisions/[revisionId]/route';
import { POST as restoreRevision } from '@/app/api/admin/blogs/[slug]/revisions/[revisionId]/restore/route';
import Author from '@/models/Author';
import Blog from '@/models/Blog';
import BlogRevision, { BLOG_REVISION_LIMIT } from '@/models/BlogRevision';
import type { IUser } from '@/models/User';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const BASE = 'http://localhost:3003/api/admin/blogs';
const rootContext = { params: Promise.resolve({}) };
const slugContext = (slug: string) => ({ params: Promise.resolve({ slug }) });
const revisionContext = (slug: string, revisionId: string) => ({
  params: Promise.resolve({ slug, revisionId }),
});

async function create(user: IUser, siteId: string, json: Record<string, unknown>) {
  const response = await createBlog(
    await authenticatedRequest(BASE, { user, siteId, method: 'POST', json }),
    rootContext,
  );
  expect(response.status).toBe(201);
  return response.json();
}

async function update(user: IUser, siteId: string, slug: string, json: Record<string, unknown>) {
  return updateBlog(
    await authenticatedRequest(`${BASE}/${slug}`, { user, siteId, method: 'PUT', json }),
    slugContext(slug),
  );
}

async function list(user: IUser, siteId: string, slug: string) {
  return listRevisions(
    await authenticatedRequest(`${BASE}/${slug}/revisions`, { user, siteId }),
    slugContext(slug),
  );
}

async function detail(user: IUser, siteId: string, slug: string, revisionId: string) {
  return getRevision(
    await authenticatedRequest(`${BASE}/${slug}/revisions/${revisionId}`, { user, siteId }),
    revisionContext(slug, revisionId),
  );
}

async function restore(user: IUser, siteId: string, slug: string, revisionId: string) {
  return restoreRevision(
    await authenticatedRequest(`${BASE}/${slug}/revisions/${revisionId}/restore`, {
      user,
      siteId,
      method: 'POST',
      json: {},
    }),
    revisionContext(slug, revisionId),
  );
}

beforeEach(() => notify.mockReset());

describe('blog version history: recording', () => {
  it('keeps the replaced version on every real change, with who and when', async () => {
    const site = await createTestSite();
    const siteId = site._id.toString();
    const admin = await createTestUser();
    const editor = await createTestUser({ role: 'editor', siteIds: [siteId] });

    await create(admin, siteId, { title: 'First', slug: 'post', content: '<p>One</p>' });
    expect(await BlogRevision.countDocuments()).toBe(0);

    expect((await update(editor, siteId, 'post', { content: '<p>Two</p>' })).status).toBe(200);
    expect((await update(admin, siteId, 'post', { title: 'Third' })).status).toBe(200);

    const response = await list(admin, siteId, 'post');
    expect(response.status).toBe(200);
    const { items, limit } = await response.json();
    expect(limit).toBe(BLOG_REVISION_LIMIT);
    expect(items).toHaveLength(2);
    // Newest first: the version replaced by the admin's title change was saved by the editor.
    expect(items[0]).toMatchObject({
      title: 'First',
      reason: 'edit',
      savedBy: { name: editor.name },
      replacedBy: { name: admin.name },
    });
    expect(items[1]).toMatchObject({
      title: 'First',
      savedBy: { name: admin.name },
      replacedBy: { name: editor.name },
    });
    // The list never ships article bodies.
    expect(JSON.stringify(items)).not.toContain('<p>');
  });

  it('records nothing for a save that changes nothing or fails', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const siteId = site._id.toString();
    await create(admin, siteId, { title: 'A', slug: 'a', content: '<p>A</p>' });
    await create(admin, siteId, { title: 'B', slug: 'b', content: '<p>B</p>' });

    expect((await update(admin, siteId, 'a', { title: 'A' })).status).toBe(200);
    const clash = await update(admin, siteId, 'a', { slug: 'b', title: 'Changed' });
    expect(clash.status).toBe(409);
    expect(await BlogRevision.countDocuments()).toBe(0);
    expect((await Blog.findOne({ siteId, slug: 'a' }))?.title).toBe('A');
  });

  it('follows the post when its slug changes', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const siteId = site._id.toString();
    await create(admin, siteId, { title: 'Post', slug: 'old-slug', content: '<p>Body</p>' });
    await update(admin, siteId, 'old-slug', { slug: 'new-slug' });
    const { items } = await (await list(admin, siteId, 'new-slug')).json();
    expect(items).toHaveLength(1);
    expect(items[0].slug).toBe('old-slug');
  });

  it(`keeps only the newest ${BLOG_REVISION_LIMIT} versions`, async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const siteId = site._id.toString();
    const post = await create(admin, siteId, { title: 'v0', slug: 'busy', content: '<p>x</p>' });
    const snapshot = { title: 'old', slug: 'busy', content: '<p>x</p>', status: 'publish' };
    await BlogRevision.insertMany(
      Array.from({ length: BLOG_REVISION_LIMIT }, () => ({
        siteId,
        blogId: post._id,
        snapshot,
        savedAt: new Date(),
        reason: 'edit',
      })),
    );
    const oldest = await BlogRevision.findOne({ blogId: post._id }).sort({ _id: 1 });
    await update(admin, siteId, 'busy', { title: 'v1' });
    expect(await BlogRevision.countDocuments({ blogId: post._id })).toBe(BLOG_REVISION_LIMIT);
    expect(await BlogRevision.exists({ _id: oldest!._id })).toBeNull();
  });

  it('deletes the history together with the post', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const siteId = site._id.toString();
    await create(admin, siteId, { title: 'Doomed', slug: 'doomed', content: '<p>x</p>' });
    await update(admin, siteId, 'doomed', { title: 'Still doomed' });
    expect(await BlogRevision.countDocuments()).toBe(1);
    const response = await deleteBlog(
      await authenticatedRequest(`${BASE}/doomed`, { user: admin, siteId, method: 'DELETE' }),
      slugContext('doomed'),
    );
    expect(response.status).toBe(200);
    expect(await BlogRevision.countDocuments()).toBe(0);
  });
});

describe('blog version history: preview and restore', () => {
  async function setup() {
    const admin = await createTestUser();
    const site = await createTestSite();
    const siteId = site._id.toString();
    await create(admin, siteId, {
      title: 'Original title',
      slug: 'story',
      content: '<p>The quick brown fox</p>',
      tags: ['one'],
      status: 'publish',
    });
    await update(admin, siteId, 'story', {
      title: 'Edited title',
      content: '<p>The slow brown fox</p>',
      tags: ['one', 'two'],
      status: 'draft',
    });
    const { items } = await (await list(admin, siteId, 'story')).json();
    notify.mockReset();
    return { admin, siteId, revisionId: items[0].id as string };
  }

  it('previews what a restore would change, including a word diff', async () => {
    const { admin, siteId, revisionId } = await setup();
    const response = await detail(admin, siteId, 'story', revisionId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.snapshot.title).toBe('Original title');
    const fields = body.restoreChanges.map((change: { field: string }) => change.field);
    expect(fields).toEqual(expect.arrayContaining(['title', 'content', 'tags']));
    // Status differs (draft now, publish then) but restore never changes it.
    expect(fields).not.toContain('status');
    const removed = body.contentDiff.filter((s: { type: string }) => s.type === 'removed');
    const added = body.contentDiff.filter((s: { type: string }) => s.type === 'added');
    expect(removed.map((s: { text: string }) => s.text.trim())).toEqual(['slow']);
    expect(added.map((s: { text: string }) => s.text.trim())).toEqual(['quick']);
  });

  it('restores content, keeps slug and status, re-renders, and can be undone', async () => {
    const { admin, siteId, revisionId } = await setup();
    const response = await restore(admin, siteId, 'story', revisionId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.changed).toBe(true);
    expect(body.blog).toMatchObject({
      title: 'Original title',
      slug: 'story',
      status: 'draft',
      tags: ['one'],
      updatedBy: admin._id.toString(),
    });
    expect(body.blog.rendered.html).toContain('quick');
    // Draft post: consumers are not notified.
    expect(notify).not.toHaveBeenCalled();

    const { items } = await (await list(admin, siteId, 'story')).json();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Edited title',
      reason: 'restore',
      restoredFrom: revisionId,
    });

    // Undo: restore the version the restore replaced.
    const undo = await restore(admin, siteId, 'story', items[0].id);
    expect((await undo.json()).blog.title).toBe('Edited title');
  });

  it('notifies consumers when restoring a published post, and reports no-op restores', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const siteId = site._id.toString();
    await create(admin, siteId, { title: 'Live', slug: 'live', content: '<p>v1</p>' });
    await update(admin, siteId, 'live', { content: '<p>v2</p>' });
    notify.mockReset();
    const [revision] = (await (await list(admin, siteId, 'live')).json()).items;

    const first = await (await restore(admin, siteId, 'live', revision.id)).json();
    expect(first.changed).toBe(true);
    expect(notify).toHaveBeenCalledWith(siteId, {
      type: 'content.updated',
      contentType: 'post',
      slug: 'live',
      id: first.blog._id,
    });

    notify.mockReset();
    const again = await (await restore(admin, siteId, 'live', revision.id)).json();
    expect(again.changed).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('refuses to restore an author who no longer belongs to the site', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const siteId = site._id.toString();
    const author = await Author.create({ siteId, name: 'Gone', slug: 'gone', status: 'publish' });
    await create(admin, siteId, {
      title: 'Bylined',
      slug: 'bylined',
      content: '<p>x</p>',
      authorId: author._id.toString(),
    });
    await update(admin, siteId, 'bylined', { authorId: null });
    await Author.deleteOne({ _id: author._id });
    const [revision] = (await (await list(admin, siteId, 'bylined')).json()).items;
    const response = await restore(admin, siteId, 'bylined', revision.id);
    expect(response.status).toBe(400);
    expect(await BlogRevision.countDocuments()).toBe(1);
  });
});

describe('blog version history: isolation and validation', () => {
  it("never exposes or restores another post's or another site's revisions", async () => {
    const admin = await createTestUser();
    const [siteA, siteB] = await Promise.all([createTestSite(), createTestSite()]);
    const a = siteA._id.toString();
    const b = siteB._id.toString();
    for (const siteId of [a, b]) {
      await create(admin, siteId, { title: 'Shared', slug: 'shared', content: '<p>1</p>' });
      await update(admin, siteId, 'shared', { content: '<p>2</p>' });
    }
    await create(admin, a, { title: 'Other', slug: 'other', content: '<p>1</p>' });

    const siteBRevision = (await (await list(admin, b, 'shared')).json()).items[0].id;
    const siteARevision = (await (await list(admin, a, 'shared')).json()).items[0].id;

    // Same slug, other site's revision id.
    expect((await detail(admin, a, 'shared', siteBRevision)).status).toBe(404);
    expect((await restore(admin, a, 'shared', siteBRevision)).status).toBe(404);
    // Same site, but the revision belongs to a different post.
    expect((await detail(admin, a, 'other', siteARevision)).status).toBe(404);
    expect((await restore(admin, a, 'other', siteARevision)).status).toBe(404);
    expect((await Blog.findOne({ siteId: b, slug: 'shared' }))?.content).toBe('<p>2</p>');
  });

  it('rejects malformed ids, unknown posts, and users without site access', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const siteId = site._id.toString();
    await create(admin, siteId, { title: 'Post', slug: 'post', content: '<p>1</p>' });

    expect((await detail(admin, siteId, 'post', 'not-an-id')).status).toBe(400);
    expect((await restore(admin, siteId, 'post', 'not-an-id')).status).toBe(400);
    const missing = new Types.ObjectId().toString();
    expect((await detail(admin, siteId, 'post', missing)).status).toBe(404);
    expect((await list(admin, siteId, 'no-such-post')).status).toBe(404);

    const outsider = await createTestUser({ role: 'editor', siteIds: [] });
    expect((await list(outsider, siteId, 'post')).status).toBe(403);
  });
});
