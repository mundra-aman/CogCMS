import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { GET as getRevisionsList } from '@/app/api/admin/revisions/route';
import { GET as getRevisionDetail } from '@/app/api/admin/revisions/[id]/route';
import { POST as restoreRevisionRoute } from '@/app/api/admin/revisions/[id]/restore/route';
import { POST as createBlog } from '@/app/api/admin/blogs/route';
import { PUT as updateBlog } from '@/app/api/admin/blogs/[slug]/route';
import { POST as createEvent } from '@/app/api/admin/events/route';
import { PUT as updateEvent } from '@/app/api/admin/events/[slug]/route';
import Revision from '@/models/Revision';
import Blog from '@/models/Blog';
import Event from '@/models/Event';
import Author from '@/models/Author';
import AuditLog from '@/models/AuditLog';
import { createRevisionSnapshot, runInTransaction } from '@/lib/revisions/engine';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const notifySiteWebhook = vi.hoisted(() => vi.fn());
vi.mock('@/lib/webhook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/webhook')>()),
  notifySiteWebhook,
}));

describe('Admin Revisions API', () => {
  it('creates versions, ignores unchanged updates, lists them, fetches details, and restores an older version', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const blog = await Blog.create({
      siteId: site._id,
      title: 'Original Title v1',
      slug: 'original-title-v1',
      content: '<p>Version 1 content</p>',
      rendered: {
        html: '<p>Version 1 content</p>',
        toc: [],
        wordCount: 3,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    const rev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: {
        title: 'Original Title v1',
        slug: 'original-title-v1',
        content: '<p>Version 1 content</p>',
      } as any,
      trigger: 'create',
      summary: 'Initial draft save',
    });

    const rev2 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: {
        title: 'Edited Title v2',
        slug: 'original-title-v1',
        content: '<p>Version 2 updated content</p>',
      } as any,
      trigger: 'update',
      summary: 'Updated content',
    });

    const revDuplicate = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: {
        title: 'Edited Title v2',
        slug: 'original-title-v1',
        content: '<p>Version 2 updated content</p>',
      } as any,
      trigger: 'update',
      summary: 'Duplicate save with no change',
    });

    expect(rev1.version).toBe('1.0');
    expect(rev2.version).toBe('1.1');
    expect(revDuplicate._id.toString()).toBe(rev2._id.toString());

    const listReq = await authenticatedRequest(
      `http://localhost:3003/api/admin/revisions?entityType=blog&entityId=${blog._id}`,
      { user: admin, siteId: site._id.toString() },
    );
    const listRes = await getRevisionsList(listReq, { params: Promise.resolve({}) });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody).toHaveLength(2);
    expect(listBody[0].version).toBe('1.1');
    expect(listBody[1].version).toBe('1.0');

    const detailReq = await authenticatedRequest(
      `http://localhost:3003/api/admin/revisions/${rev1._id}`,
      { user: admin, siteId: site._id.toString() },
    );
    const detailRes = await getRevisionDetail(detailReq, {
      params: Promise.resolve({ id: rev1._id.toString() }),
    });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.snapshot.title).toBe('Original Title v1');

    const restoreReq = await authenticatedRequest(
      `http://localhost:3003/api/admin/revisions/${rev1._id}/restore`,
      { user: admin, siteId: site._id.toString(), method: 'POST' },
    );
    const restoreRes = await restoreRevisionRoute(restoreReq, {
      params: Promise.resolve({ id: rev1._id.toString() }),
    });
    expect(restoreRes.status).toBe(200);

    const updatedBlog = await Blog.findById(blog._id).exec();
    expect(updatedBlog?.title).toBe('Original Title v1');
    expect(updatedBlog?.content).toBe('<p>Version 1 content</p>');
    // Restored historical content is saved AS A DRAFT without publishing as a side effect
    expect(updatedBlog?.status).toBe('draft');

    // Restored draft is not visible to public published filters
    const publishedBlogs = await Blog.find({ siteId: site._id, status: 'publish' }).exec();
    expect(publishedBlogs).toHaveLength(0);

    const allRevisions = await Revision.find({ entityId: blog._id })
      .sort({ majorVersion: 1, minorVersion: 1 })
      .exec();
    expect(allRevisions).toHaveLength(3);
    expect(allRevisions[2].version).toBe('2.0');
    expect(allRevisions[2].restoredFromVersion).toBe('1.0');
    expect(allRevisions[2].summary).toBe('Restored as draft from version 1.0');

    const auditEntry = await AuditLog.findOne({
      entityId: blog._id.toString(),
      action: 'restore',
    }).exec();
    expect(auditEntry).not.toBeNull();
    expect((auditEntry?.details as any)?.restoredFromVersion).toBe('1.0');
    expect((auditEntry?.details as any)?.newVersion).toBe('2.0');

    const publishAfterRestore = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { ...updatedBlog!.toObject(), status: 'publish' } as any,
      trigger: 'publish',
    });

    expect(publishAfterRestore.version).toBe('2.0');
    expect(publishAfterRestore.trigger).toBe('publish');
    expect(publishAfterRestore._id.toString()).toBe(allRevisions[2]._id.toString());
  });

  it('enforces revision immutability (revisions are append-only audit records and cannot be deleted)', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const rev = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: admin._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { title: 'Permanent Immutable Revision' } as any,
      trigger: 'create',
    });

    // Verify the revision was saved in MongoDB
    const found = await Revision.findById(rev._id).exec();
    expect(found).not.toBeNull();

    // Verify app/api/admin/revisions/[id]/route does not expose a DELETE method
    const routeExports = await import('@/app/api/admin/revisions/[id]/route');
    expect((routeExports as Record<string, unknown>).DELETE).toBeUndefined();
  });

  it('rolls back database modifications if an error occurs during the transaction', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const blog = await Blog.create({
      siteId: site._id,
      title: 'Original Pristine Title',
      slug: 'original-pristine-slug',
      content: '<p>Original content</p>',
      rendered: {
        html: '<p>Original content</p>',
        toc: [],
        wordCount: 2,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Attempt a transaction where content update is committed with session but subsequent error is thrown
    await expect(
      runInTransaction(async (session) => {
        blog.title = 'Mutated Title That Must Roll Back';
        await blog.save({ session });

        // Simulate an unexpected failure during revision snapshot generation or logging
        throw new Error('Simulated failure during revision transaction');
      }),
    ).rejects.toThrow('Simulated failure during revision transaction');

    // Reload the blog directly from the database to prove it was rolled back
    const freshlyLoaded = await Blog.findById(blog._id).exec();
    expect(freshlyLoaded?.title).toBe('Original Pristine Title');
  });

  it('strictly enforces tenant site isolation for revisions', async () => {
    const siteA = await createTestSite();
    const siteB = await createTestSite();
    const admin = await createTestUser({
      role: 'admin',
      siteIds: [siteA._id.toString(), siteB._id.toString()],
    });

    const blog = await Blog.create({
      siteId: siteA._id,
      title: 'Site A Blog',
      slug: 'site-a-blog',
      content: '<p>Site A content</p>',
      rendered: {
        html: '<p>Site A content</p>',
        toc: [],
        wordCount: 3,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    const revA = await createRevisionSnapshot({
      siteId: siteA._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [siteA._id.toString()],
      },
      snapshot: { title: 'Site A Blog', content: '...' } as any,
      trigger: 'create',
    });

    const crossSiteReq = await authenticatedRequest(
      `http://localhost:3003/api/admin/revisions/${revA._id}`,
      { user: admin, siteId: siteB._id.toString() },
    );
    const crossSiteRes = await getRevisionDetail(crossSiteReq, {
      params: Promise.resolve({ id: revA._id.toString() }),
    });
    expect(crossSiteRes.status).toBe(404);
  });

  it('correctly deduplicates zero-change saves, handles published baselines, and avoids ghost versions', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    // 1. Initial published blog
    const blog = await Blog.create({
      siteId: site._id,
      title: 'Initial Title',
      slug: 'initial-title',
      content: '<p>Initial body content</p>',
      rendered: {
        html: '<p>Initial body content</p>',
        toc: [],
        wordCount: 3,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      status: 'publish',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    const rev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'publish',
      summary: 'Initial published post',
    });

    expect(rev1.version).toBe('1.0');
    expect(rev1.trigger).toBe('publish');

    // 2. Click "Save draft" with NO changes: should deduplicate and return rev1 (no v1.1)
    const saveDraftNoChange = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { ...blog.toObject(), status: 'draft' } as any,
      trigger: 'update',
      summary: 'Draft save without changes',
    });

    expect(saveDraftNoChange._id.toString()).toBe(rev1._id.toString());
    expect(saveDraftNoChange.version).toBe('1.0');

    // 3. Edit title to "Updated Title" and click "Save draft": should create v1.1 draft
    const saveDraftWithChange = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { ...blog.toObject(), title: 'Updated Title', status: 'draft' } as any,
      trigger: 'update',
      summary: 'Edited title',
    });

    expect(saveDraftWithChange.version).toBe('1.1');
    expect(saveDraftWithChange.trigger).toBe('update');

    // 4. Restore v1.0: should create v2.0 with restored lineage
    const restoreRes = await restoreRevisionRoute(
      await authenticatedRequest(`http://localhost:3003/api/admin/revisions/${rev1._id}/restore`, {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
      }),
      { params: Promise.resolve({ id: rev1._id.toString() }) },
    );
    expect(restoreRes.status).toBe(200);

    const revsAfterRestore = await Revision.find({ entityId: blog._id }).sort({ createdAt: -1 }).exec();
    const latestRestored = revsAfterRestore[0];
    expect(latestRestored.version).toBe('2.0');
    expect(latestRestored.trigger).toBe('restore');

    // 5. Click "Save draft" on restored version with NO changes: should deduplicate and return v2.0
    const draftAfterRestoreNoChange = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { ...blog.toObject(), status: 'draft' } as any,
      trigger: 'update',
    });
    expect(draftAfterRestoreNoChange._id.toString()).toBe(latestRestored._id.toString());

    // 6. Click "Publish" on restored version with NO changes: should promote/return v2.0 (no v3.0)
    const publishAfterRestoreNoChange = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'publish',
    });
    expect(publishAfterRestoreNoChange._id.toString()).toBe(latestRestored._id.toString());
    expect(publishAfterRestoreNoChange.version).toBe('2.0');

    // 7. Delete all revisions and click Publish on an already-published blog:
    // Should create v1.0 with trigger 'publish' (Published badge, NOT Draft badge)
    await Revision.deleteMany({ entityId: blog._id }).exec();

    const baselineAfterClear = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { ...blog.toObject(), status: 'publish' } as any,
      trigger: 'publish',
    });

    expect(baselineAfterClear.version).toBe('1.0');
    expect(baselineAfterClear.trigger).toBe('publish');
  });

  it('clears publishedAt timestamp on restored draft and detects changes in authorId and relatedSlugs', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });
    const authorDoc1 = await Author.create({
      siteId: site._id,
      name: 'Author One',
      slug: 'author-one',
      status: 'publish',
    });
    const authorDoc2 = await Author.create({
      siteId: site._id,
      name: 'Author Two',
      slug: 'author-two',
      status: 'publish',
    });

    // 1. Create a published blog with a publishedAt date
    const initialDate = new Date('2024-01-01T00:00:00.000Z');
    const blog = await Blog.create({
      siteId: site._id,
      title: 'Published Blog To Restore',
      slug: 'published-blog-to-restore',
      content: '<p>Initial published version</p>',
      rendered: {
        html: '<p>Initial published version</p>',
        toc: [],
        wordCount: 3,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: initialDate,
      },
      status: 'publish',
      publishedAt: initialDate,
      createdBy: admin._id,
      updatedBy: admin._id,
      authorId: authorDoc1._id,
      relatedSlugs: ['first-post'],
    });

    const rev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'publish',
    });
    expect(rev1.version).toBe('1.0');

    // 2. Change only authorId: must create a new revision v1.1
    const rev2 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { ...blog.toObject(), authorId: authorDoc2._id, status: 'draft' } as any,
      trigger: 'update',
    });
    expect(rev2.version).toBe('1.1');

    // 3. Change only relatedSlugs: must create a new revision v1.2
    const rev3 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { ...blog.toObject(), authorId: authorDoc2._id, relatedSlugs: ['first-post', 'second-post'], status: 'draft' } as any,
      trigger: 'update',
    });
    expect(rev3.version).toBe('1.2');

    // 4. Restore rev1 (which was published with publishedAt set)
    const restoreRes = await restoreRevisionRoute(
      await authenticatedRequest(`http://localhost:3003/api/admin/revisions/${rev1._id}/restore`, {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
      }),
      { params: Promise.resolve({ id: rev1._id.toString() }) },
    );
    expect(restoreRes.status).toBe(200);

    // Verify database record has status 'draft' and publishedAt is cleared (null/falsy)
    const restoredBlog = await Blog.findById(blog._id).exec();
    expect(restoredBlog?.status).toBe('draft');
    expect(restoredBlog?.publishedAt).toBeFalsy();
  });

  it('records an unpublish revision when published content is transitioned to draft even if content is unchanged', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const blog = await Blog.create({
      siteId: site._id,
      title: 'Published Blog To Unpublish',
      slug: 'published-blog-to-unpublish',
      content: '<p>Content for unpublish</p>',
      rendered: {
        html: '<p>Content for unpublish</p>',
        toc: [],
        wordCount: 3,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      status: 'publish',
      publishedAt: new Date(),
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    const rev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'publish',
    });
    expect(rev1.version).toBe('1.0');
    expect(rev1.trigger).toBe('publish');

    // Unpublish the blog without modifying any text content
    const unpublishRev = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { ...blog.toObject(), status: 'draft' } as any,
      trigger: 'unpublish',
      summary: 'Unpublished to draft',
    });

    // An unpublish must create a minor draft version recording the lifecycle transition
    expect(unpublishRev.version).toBe('1.1');
    expect(unpublishRev.trigger).toBe('unpublish');
    expect(unpublishRev.summary).toBe('Unpublished to draft');

    // Duplicate unpublish request with no changes deduplicates cleanly
    const duplicateUnpublish = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: { ...blog.toObject(), status: 'draft' } as any,
      trigger: 'unpublish',
    });
    expect(duplicateUnpublish._id.toString()).toBe(unpublishRev._id.toString());
  });

  it('records an unpublish revision with clear summary and trigger when unpublishing while simultaneously changing content', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    // 1. Initial published blog
    const blog = await Blog.create({
      siteId: site._id,
      title: 'Published Blog To Modify And Unpublish',
      slug: 'published-blog-modify-unpublish',
      content: '<p>Published initial content</p>',
      rendered: {
        html: '<p>Published initial content</p>',
        toc: [],
        wordCount: 3,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      status: 'publish',
      publishedAt: new Date(),
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    const rev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'publish',
    });
    expect(rev1.version).toBe('1.0');

    // 2. In one save, simultaneously edit content AND switch status from 'publish' to 'draft'
    const modifiedDraftSnapshot = {
      ...blog.toObject(),
      title: 'Updated Title During Unpublish',
      content: '<p>Updated content while taking post offline</p>',
      status: 'draft',
    };

    const unpublishWithContentChangeRev = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: modifiedDraftSnapshot as any,
      trigger: 'unpublish',
    });

    // The resulting revision must clearly record the unpublish trigger and both content change and unpublish transition
    expect(unpublishWithContentChangeRev.version).toBe('1.1');
    expect(unpublishWithContentChangeRev.trigger).toBe('unpublish');
    expect(unpublishWithContentChangeRev.summary).toBe('Unpublished to draft with content changes');
    expect((unpublishWithContentChangeRev.snapshot as any).title).toBe('Updated Title During Unpublish');
  });

  it('notifies unpublish webhook using the live pre-restore slug when restoring an item with a changed slug', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    // 1. Create original published blog with slug 'original-historical-slug'
    const blog = await Blog.create({
      siteId: site._id,
      title: 'Historical Blog Title',
      slug: 'original-historical-slug',
      content: '<p>Historical version</p>',
      rendered: {
        html: '<p>Historical version</p>',
        toc: [],
        wordCount: 2,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      status: 'publish',
      publishedAt: new Date(),
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    const rev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'publish',
    });
    expect(rev1.version).toBe('1.0');

    // 2. Later, the live published blog was renamed to 'renamed-live-slug'
    blog.slug = 'renamed-live-slug';
    await blog.save();

    notifySiteWebhook.mockClear();

    // 3. Restore rev1 (which has snapshot.slug = 'original-historical-slug')
    const restoreRes = await restoreRevisionRoute(
      await authenticatedRequest(`http://localhost:3003/api/admin/revisions/${rev1._id}/restore`, {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
      }),
      { params: Promise.resolve({ id: rev1._id.toString() }) },
    );
    expect(restoreRes.status).toBe(200);

    // 4. Verify unpublish webhook was notified with the pre-restore live slug ('renamed-live-slug')
    expect(notifySiteWebhook).toHaveBeenCalledWith(
      site._id.toString(),
      expect.objectContaining({
        type: 'content.unpublished',
        contentType: 'post',
        slug: 'renamed-live-slug',
      }),
    );
  });

  it('omits recomputable rendered HTML from stored revision snapshots (bounded snapshot allowlist)', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const blog = await Blog.create({
      siteId: site._id,
      title: 'Blog With Heavy Rendered Payload',
      slug: 'blog-heavy-rendered',
      content: '<p>Source content</p>',
      rendered: {
        html: '<div class="shiki">Huge syntax-highlighted HTML block repeated</div>',
        toc: [{ id: 'sec-1', text: 'Section 1', level: 2 }],
        wordCount: 500,
        readingTime: 3,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    const rev = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'create',
    });

    // Verify stored snapshot contains clean content but omits the bulky derived rendered block
    const stored = await Revision.findById(rev._id).exec();
    expect(stored).not.toBeNull();
    expect((stored?.snapshot as any).title).toBe('Blog With Heavy Rendered Payload');
    expect((stored?.snapshot as any).content).toBe('<p>Source content</p>');
    expect((stored?.snapshot as any).rendered).toBeUndefined();
    expect((stored?.snapshot as any)._id).toBeUndefined();
    expect((stored?.snapshot as any).__v).toBeUndefined();
  });

  it('rejects restoring a revision if the referenced author does not exist on the tenant site', async () => {
    const site = await createTestSite();
    const otherSite = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    // Create an author on a foreign site
    const foreignAuthor = await Author.create({
      siteId: otherSite._id,
      name: 'Foreign Author',
      slug: 'foreign-author',
      status: 'publish',
    });

    const blog = await Blog.create({
      siteId: site._id,
      title: 'Blog with Dangling Author Risk',
      slug: 'blog-dangling-author-risk',
      content: '<p>Content</p>',
      rendered: {
        html: '<p>Content</p>',
        toc: [],
        wordCount: 1,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Create historical revision pointing to the foreign author
    const revWithForeignAuthor = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: {
        ...blog.toObject(),
        authorId: foreignAuthor._id.toString(),
      } as any,
      trigger: 'update',
    });

    // Attempt to restore: must fail with validationError
    const restoreRes = await restoreRevisionRoute(
      await authenticatedRequest(`http://localhost:3003/api/admin/revisions/${revWithForeignAuthor._id}/restore`, {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
      }),
      { params: Promise.resolve({ id: revWithForeignAuthor._id.toString() }) },
    );

    expect(restoreRes.status).toBe(400);
    const body = await restoreRes.json();
    expect(body.details.fieldErrors.authorId[0]).toContain('Author must belong to the selected site');
  });

  it('supports bounded query limit and pagination when listing revisions', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const blog = await Blog.create({
      siteId: site._id,
      title: 'Pagination Blog',
      slug: 'pagination-blog',
      content: '<p>Base</p>',
      rendered: { html: '<p>Base</p>', toc: [], wordCount: 1, readingTime: 1, pipelineVersion: 1, renderedAt: new Date() },
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Create 4 revisions
    for (let i = 1; i <= 4; i++) {
      await createRevisionSnapshot({
        siteId: site._id,
        entityType: 'blog',
        entityId: blog._id,
        author: {
          id: admin._id.toString(),
          name: admin.name,
          email: admin.email,
          role: admin.role,
          siteIds: [site._id.toString()],
        },
        snapshot: { ...blog.toObject(), title: `Pagination Blog v${i}` } as any,
        trigger: 'update',
      });
    }

    // Page 1 with limit 2
    const page1Req = await authenticatedRequest(
      `http://localhost:3003/api/admin/revisions?entityType=blog&entityId=${blog._id}&limit=2&page=1`,
      { user: admin, siteId: site._id.toString() },
    );
    const page1Res = await getRevisionsList(page1Req, { params: Promise.resolve({}) });
    expect(page1Res.status).toBe(200);
    const page1Data = await page1Res.json();
    expect(page1Data).toHaveLength(2);

    // Page 2 with limit 2
    const page2Req = await authenticatedRequest(
      `http://localhost:3003/api/admin/revisions?entityType=blog&entityId=${blog._id}&limit=2&page=2`,
      { user: admin, siteId: site._id.toString() },
    );
    const page2Res = await getRevisionsList(page2Req, { params: Promise.resolve({}) });
    expect(page2Res.status).toBe(200);
    const page2Data = await page2Res.json();
    expect(page2Data).toHaveLength(2);

    // Ensure distinct items across pages
    expect(page1Data[0]._id).not.toBe(page2Data[0]._id);
  });

  it('rejects malformed, negative, or unsafe pagination parameters with 400 Bad Request', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const blog = await Blog.create({
      siteId: site._id,
      title: 'Pagination Validation Blog',
      slug: 'pagination-validation-blog',
      content: '<p>Base</p>',
      rendered: { html: '<p>Base</p>', toc: [], wordCount: 1, readingTime: 1, pipelineVersion: 1, renderedAt: new Date() },
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Test malformed limit strings
    for (const badLimit of ['abc', '100abc', '0', '-5', '1.5']) {
      const req = await authenticatedRequest(
        `http://localhost:3003/api/admin/revisions?entityType=blog&entityId=${blog._id}&limit=${badLimit}`,
        { user: admin, siteId: site._id.toString() },
      );
      const res = await getRevisionsList(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    }

    // Test malformed or out-of-range page numbers
    for (const badPage of ['foo', '0', '-1', '1.5', '999999999999999999999999999']) {
      const req = await authenticatedRequest(
        `http://localhost:3003/api/admin/revisions?entityType=blog&entityId=${blog._id}&page=${badPage}`,
        { user: admin, siteId: site._id.toString() },
      );
      const res = await getRevisionsList(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    }

    // Reject invalid trigger enum values with 400
    const badTriggerReq = await authenticatedRequest(
      `http://localhost:3003/api/admin/revisions?entityType=blog&entityId=${blog._id}&trigger=invalid_trigger`,
      { user: admin, siteId: site._id.toString() },
    );
    const badTriggerRes = await getRevisionsList(badTriggerReq, { params: Promise.resolve({}) });
    expect(badTriggerRes.status).toBe(400);
    expect((await badTriggerRes.json()).code).toBe('VALIDATION_ERROR');
  });

  it('preserves Event speakers as a string and ticketPriceAmount without numeric formatting loss across revision snapshot and restore', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const event = await Event.create({
      siteId: site._id,
      title: 'Dev Conference 2026',
      slug: 'dev-conference-2026',
      summary: 'Tech conference',
      content: '<p>Join developers worldwide</p>',
      imageUrl: 'https://example.com/cover.jpg',
      imageAlt: 'Cover',
      startAt: new Date('2026-09-01T10:00:00.000Z'),
      endAt: new Date('2026-09-01T18:00:00.000Z'),
      timeZone: 'UTC',
      format: 'in-person',
      location: 'Auditorium A',
      onlineUrl: '',
      registrationUrl: 'https://example.com/register',
      ticketPriceType: 'paid',
      ticketPriceAmount: '25.00',
      ticketPriceCurrency: 'USD',
      organizer: 'TechCorp',
      speakers: 'Dr. Jane Doe, John Smith, Ada Lovelace',
      metaTitle: 'Dev Conference 2026',
      metaDescription: 'Event SEO',
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // 1. Create revision snapshot
    const rev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'event',
      entityId: event._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: event.toObject() as any,
      trigger: 'create',
    });

    // Verify snapshot fields: speakers must remain a string, ticketPriceAmount must preserve string decimal formatting
    const snap = rev1.snapshot as any;
    expect(typeof snap.speakers).toBe('string');
    expect(snap.speakers).toBe('Dr. Jane Doe, John Smith, Ada Lovelace');
    expect(typeof snap.ticketPriceAmount).toBe('string');
    expect(snap.ticketPriceAmount).toBe('25.00');

    // 2. Modify live event
    event.speakers = 'Single Speaker';
    event.ticketPriceAmount = '0.00';
    await event.save();

    // 3. Restore revision v1.0
    const restoreRes = await restoreRevisionRoute(
      await authenticatedRequest(`http://localhost:3003/api/admin/revisions/${rev1._id}/restore`, {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
      }),
      { params: Promise.resolve({ id: rev1._id.toString() }) },
    );
    expect(restoreRes.status).toBe(200);

    // 4. Verify live event restored in database retains speakers and ticketPriceAmount
    const restoredEvent = await Event.findById(event._id).exec();
    expect(restoredEvent).not.toBeNull();
    expect(restoredEvent?.speakers).toBe('Dr. Jane Doe, John Smith, Ada Lovelace');
    expect(restoredEvent?.ticketPriceAmount).toBe('25.00');
  });

  it('allows a blog and an event with the identical ObjectId on the same site to maintain independent revision histories without colliding', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });
    const sharedId = new Types.ObjectId();

    // 1. Create Blog and Event sharing the same _id
    const blog = await Blog.create({
      _id: sharedId,
      siteId: site._id,
      title: 'Shared ID Blog',
      slug: 'shared-id-blog',
      content: '<p>Blog content</p>',
      rendered: { html: '<p>Blog content</p>', toc: [], wordCount: 2, readingTime: 1, pipelineVersion: 1, renderedAt: new Date() },
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    const event = await Event.create({
      _id: sharedId,
      siteId: site._id,
      title: 'Shared ID Event',
      slug: 'shared-id-event',
      summary: 'Event summary',
      content: '<p>Event content</p>',
      startAt: new Date('2026-10-01T10:00:00.000Z'),
      endAt: new Date('2026-10-01T18:00:00.000Z'),
      timeZone: 'UTC',
      format: 'online',
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // 2. Create revision v1.0 for the blog
    const blogRev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'create',
    });
    expect(blogRev1.version).toBe('1.0');

    // 3. Create revision v1.0 for the event (same _id and siteId, but entityType is 'event')
    // Compound unique index ({ siteId, entityType, entityId, majorVersion, minorVersion }) must allow this without E11000 collision
    const eventRev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'event',
      entityId: event._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: event.toObject() as any,
      trigger: 'create',
    });
    expect(eventRev1.version).toBe('1.0');
    expect(eventRev1._id.toString()).not.toBe(blogRev1._id.toString());

    // 4. Update the blog to v1.1
    blog.title = 'Shared ID Blog Updated';
    await blog.save();
    const blogRev2 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'update',
    });
    expect(blogRev2.version).toBe('1.1');

    // 5. Query latest revision for the event: must still be v1.0 (not influenced by blog's v1.1)
    const latestEventRev = await Revision.findOne({
      siteId: site._id,
      entityType: 'event',
      entityId: event._id,
    }).sort({ createdAt: -1 });
    expect(latestEventRev?.version).toBe('1.0');
  });

  it('creates new versions and restores successfully when body changes consist solely of inline images and video embeds', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    // 1. Initial post with first inline image
    const initialContent = '<p>Overview</p><p><img src="https://media.cognerd.in/photo1.webp" alt="Photo 1"></p>';
    const blog = await Blog.create({
      siteId: site._id,
      title: 'Media Diff Blog',
      slug: 'media-diff-blog',
      content: initialContent,
      rendered: {
        html: initialContent,
        toc: [],
        wordCount: 2,
        readingTime: 1,
        pipelineVersion: 1,
        renderedAt: new Date(),
      },
      category: 'Insights',
      status: 'draft',
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    const rev1 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'create',
    });
    expect(rev1.version).toBe('1.0');

    // 2. Change only the inline image source: prose text is identical
    const secondContent = '<p>Overview</p><p><img src="https://media.cognerd.in/photo2.webp" alt="Photo 2"></p>';
    blog.content = secondContent;
    await blog.save();

    const rev2 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'update',
    });
    expect(rev2.version).toBe('1.1');

    // 3. Add a Vimeo video embed
    const thirdContent = '<p>Overview</p><p><img src="https://media.cognerd.in/photo2.webp" alt="Photo 2"></p><p><iframe src="https://player.vimeo.com/video/76979871"></iframe></p>';
    blog.content = thirdContent;
    await blog.save();

    const rev3 = await createRevisionSnapshot({
      siteId: site._id,
      entityType: 'blog',
      entityId: blog._id,
      author: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      snapshot: blog.toObject() as any,
      trigger: 'update',
    });
    expect(rev3.version).toBe('1.2');

    // 4. Restore rev1: restores original photo1 image
    const restoreRes = await restoreRevisionRoute(
      await authenticatedRequest(`http://localhost:3003/api/admin/revisions/${rev1._id}/restore`, {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
      }),
      { params: Promise.resolve({ id: rev1._id.toString() }) },
    );
    expect(restoreRes.status).toBe(200);

    const restoredBlog = await Blog.findById(blog._id).exec();
    expect(restoredBlog?.content).toContain('photo1.webp');
    expect(restoredBlog?.content).not.toContain('photo2.webp');
    expect(restoredBlog?.content).not.toContain('player.vimeo.com');

    // 5. Restore rev3: restores the Vimeo embed iframe and photo2 image
    const restoreRev3Res = await restoreRevisionRoute(
      await authenticatedRequest(`http://localhost:3003/api/admin/revisions/${rev3._id}/restore`, {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
      }),
      { params: Promise.resolve({ id: rev3._id.toString() }) },
    );
    expect(restoreRev3Res.status).toBe(200);

    const restoredRev3Blog = await Blog.findById(blog._id).exec();
    expect(restoredRev3Blog?.content).toContain('photo2.webp');
    expect(restoredRev3Blog?.content).toContain('src="https://player.vimeo.com/video/76979871"');
    expect(restoredRev3Blog?.content).toContain('allowfullscreen');
  });

  it('wires real blog create, update, deduplication, publish, unpublish, and restore routes end-to-end', async () => {
    const site = await createTestSite();
    const editor = await createTestUser({ role: 'editor', siteIds: [site._id.toString()] });
    const rootCtx = { params: Promise.resolve({}) };
    const slugCtx = { params: Promise.resolve({ slug: 'real-route-blog' }) };

    const createRes = await createBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
        user: editor,
        siteId: site._id.toString(),
        method: 'POST',
        json: {
          title: 'Real Route Blog',
          slug: 'real-route-blog',
          content: '<p>Initial draft body</p>',
          status: 'draft',
        },
      }),
      rootCtx,
    );
    expect(createRes.status).toBe(201);
    const createdBlog = await createRes.json();

    // Editing content + FAQs should create v1.1.
    const updateRes = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/real-route-blog', {
        user: editor,
        siteId: site._id.toString(),
        method: 'PUT',
        json: {
          content: '<p>Updated draft body</p>',
          faqs: [{ question: 'Why revisions?', answer: 'Safe rollback.' }],
        },
      }),
      slugCtx,
    );
    expect(updateRes.status).toBe(200);

    // Repeating an identical FAQ payload (without changing content) must deduplicate at v1.1.
    const dupUpdateRes = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/real-route-blog', {
        user: editor,
        siteId: site._id.toString(),
        method: 'PUT',
        json: {
          content: '<p>Updated draft body</p>',
          faqs: [{ question: 'Why revisions?', answer: 'Safe rollback.' }],
        },
      }),
      slugCtx,
    );
    expect(dupUpdateRes.status).toBe(200);

    const publishRes = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/real-route-blog', {
        user: editor,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'publish' },
      }),
      slugCtx,
    );
    expect(publishRes.status).toBe(200);

    const unpublishRes = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/real-route-blog', {
        user: editor,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'draft' },
      }),
      slugCtx,
    );
    expect(unpublishRes.status).toBe(200);

    const listRes = await getRevisionsList(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/revisions?entityType=blog&entityId=${createdBlog._id}`,
        { user: editor, siteId: site._id.toString() },
      ),
      rootCtx,
    );
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    expect(listed.map((r: { version: string }) => r.version)).toEqual(['2.1', '2.0', '1.1', '1.0']);
    expect(listed.map((r: { trigger: string }) => r.trigger)).toEqual([
      'unpublish',
      'publish',
      'update',
      'create',
    ]);

    const v1 = listed.find((r: { version: string }) => r.version === '1.0');
    const restoreRes = await restoreRevisionRoute(
      await authenticatedRequest(`http://localhost:3003/api/admin/revisions/${v1._id}/restore`, {
        user: editor,
        siteId: site._id.toString(),
        method: 'POST',
      }),
      { params: Promise.resolve({ id: v1._id }) },
    );
    expect(restoreRes.status).toBe(200);
    const restored = await restoreRes.json();
    expect(restored.restoredRevision.version).toBe('3.0');
    expect(restored.restoredRevision.trigger).toBe('restore');
    expect(restored.entity.status).toBe('draft');
    expect(restored.entity.publishedAt).toBeUndefined();
    expect(restored.entity.content).toBe('<p>Initial draft body</p>');

    // Republishing immediately after restore promotes v3.0 in-place to trigger: 'publish'.
    const republishRes = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/real-route-blog', {
        user: editor,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'publish' },
      }),
      slugCtx,
    );
    expect(republishRes.status).toBe(200);

    const latestRev = await Revision.findById(restored.restoredRevision._id).exec();
    expect(latestRev?.version).toBe('3.0');
    expect(latestRev?.trigger).toBe('publish');

    const auditLogs = await AuditLog.find({ siteId: site._id, entityType: 'blog' })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    expect(auditLogs.map((a) => a.action)).toEqual([
      'create',
      'update',
      'update',
      'publish',
      'unpublish',
      'restore',
      'publish',
    ]);
  });

  it('wires real event create, publish, deduplication, and restore routes end-to-end', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });
    const rootCtx = { params: Promise.resolve({}) };
    const slugCtx = { params: Promise.resolve({ slug: 'real-route-event' }) };

    const basePayload = {
      title: 'Real Route Event',
      slug: 'real-route-event',
      summary: 'Initial summary',
      content: '<p>Event description</p>',
      startAt: '2026-12-10T09:00:00.000Z',
      endAt: '2026-12-10T17:00:00.000Z',
      timeZone: 'UTC',
      format: 'hybrid',
      location: 'Hall A',
      onlineUrl: 'https://stream.example.com/event',
      ticketPriceType: 'paid',
      ticketPriceAmount: '49.99',
      ticketPriceCurrency: 'USD',
      speakers: 'Ada Lovelace',
    };

    const createRes = await createEvent(
      await authenticatedRequest('http://localhost:3003/api/admin/events', {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
        json: { ...basePayload, status: 'draft' },
      }),
      rootCtx,
    );
    expect(createRes.status).toBe(201);
    const createdEvent = await createRes.json();

    const publishRes = await updateEvent(
      await authenticatedRequest('http://localhost:3003/api/admin/events/real-route-event', {
        user: admin,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { ...basePayload, summary: 'Published summary', status: 'publish' },
      }),
      slugCtx,
    );
    expect(publishRes.status).toBe(200);

    // Repeating the same published payload must not create a phantom revision.
    const dupPublishRes = await updateEvent(
      await authenticatedRequest('http://localhost:3003/api/admin/events/real-route-event', {
        user: admin,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { ...basePayload, summary: 'Published summary', status: 'publish' },
      }),
      slugCtx,
    );
    expect(dupPublishRes.status).toBe(200);

    const revisions = await Revision.find({
      siteId: site._id,
      entityType: 'event',
      entityId: createdEvent._id,
    })
      .sort({ majorVersion: -1, minorVersion: -1 })
      .exec();
    expect(revisions.map((r) => r.version)).toEqual(['2.0', '1.0']);

    const v1 = revisions.find((r) => r.version === '1.0')!;
    const restoreRes = await restoreRevisionRoute(
      await authenticatedRequest(`http://localhost:3003/api/admin/revisions/${v1._id}/restore`, {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
      }),
      { params: Promise.resolve({ id: v1._id.toString() }) },
    );
    expect(restoreRes.status).toBe(200);

    const restoredEvent = await Event.findById(createdEvent._id).exec();
    expect(restoredEvent?.status).toBe('draft');
    expect(restoredEvent?.summary).toBe('Initial summary');
    expect(restoredEvent?.publishedAt).toBeNull();

    const afterRestoreRevs = await Revision.find({
      siteId: site._id,
      entityType: 'event',
      entityId: createdEvent._id,
    })
      .sort({ majorVersion: -1, minorVersion: -1 })
      .exec();
    expect(afterRestoreRevs.map((r) => `${r.version}:${r.trigger}`)).toEqual([
      '3.0:restore',
      '2.0:publish',
      '1.0:create',
    ]);
  });
});
