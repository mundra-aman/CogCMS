import { describe, expect, it } from 'vitest';
import { GET as getActivityLogs } from '@/app/api/admin/activity-logs/route';
import { POST as createBlog } from '@/app/api/admin/blogs/route';
import { PUT as updateBlog, DELETE as deleteBlog } from '@/app/api/admin/blogs/[slug]/route';
import { POST as createAuthor } from '@/app/api/admin/authors/route';
import { PUT as updateAuthor, DELETE as deleteAuthor } from '@/app/api/admin/authors/[slug]/route';
import { POST as createFaq } from '@/app/api/admin/faqs/route';
import ActivityLog from '@/models/ActivityLog';
import { recordActivity } from '@/lib/admin/activity-log';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

const rootContext = { params: Promise.resolve({}) };

describe('Activity Log / Audit Trail end-to-end integration', () => {
  it('creates an activity record when a supported operation succeeds', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    const response = await createBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
        json: {
          title: 'Audit Trail Launch',
          slug: 'audit-trail-launch',
          content: '<p>Testing audit logging</p>',
          status: 'draft',
        },
      }),
      rootContext,
    );

    expect(response.status).toBe(201);

    const log = await ActivityLog.findOne({
      siteId: site._id,
      entitySlug: 'audit-trail-launch',
    }).exec();

    expect(log).not.toBeNull();
    expect(log?.action).toBe('create');
    expect(log?.entityType).toBe('blog');
    expect(log?.entityTitle).toBe('Audit Trail Launch');
    expect(log?.actor.name).toBe(admin.name);
    expect(log?.actor.email).toBe(admin.email);
    expect(log?.actor.id.toString()).toBe(admin._id.toString());
    expect(log?.metadata).toMatchObject({ status: 'draft' });
  });

  it('does NOT create an activity record when the primary operation fails validation', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    const initialCount = await ActivityLog.countDocuments({ siteId: site._id });

    // Invalid blog payload: missing required title
    const response = await createBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
        json: {
          slug: 'invalid-post',
          content: '<p>Missing title</p>',
        },
      }),
      rootContext,
    );

    expect(response.status).toBe(400);

    const finalCount = await ActivityLog.countDocuments({ siteId: site._id });
    expect(finalCount).toBe(initialCount);
  });

  it('records publish and unpublish transitions during content updates', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    // 1. Create a draft blog
    await createBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
        json: {
          title: 'Transition Post',
          slug: 'transition-post',
          content: '<p>Initial draft</p>',
          status: 'draft',
        },
      }),
      rootContext,
    );

    // 2. Publish the blog (draft -> publish)
    const publishResponse = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/transition-post', {
        user: admin,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'publish' },
      }),
      { params: Promise.resolve({ slug: 'transition-post' }) },
    );
    expect(publishResponse.status).toBe(200);

    const publishLog = await ActivityLog.findOne({
      siteId: site._id,
      entitySlug: 'transition-post',
      action: 'publish',
    }).exec();
    expect(publishLog).not.toBeNull();
    expect(publishLog?.metadata).toMatchObject({
      previousStatus: 'draft',
      status: 'publish',
    });

    // 3. Unpublish the blog (publish -> draft)
    const unpublishResponse = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/transition-post', {
        user: admin,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'draft' },
      }),
      { params: Promise.resolve({ slug: 'transition-post' }) },
    );
    expect(unpublishResponse.status).toBe(200);

    const unpublishLog = await ActivityLog.findOne({
      siteId: site._id,
      entitySlug: 'transition-post',
      action: 'unpublish',
    }).exec();
    expect(unpublishLog).not.toBeNull();
    expect(unpublishLog?.metadata).toMatchObject({
      previousStatus: 'publish',
      status: 'draft',
    });
  });

  it('records deletion and preserves historical title snapshot after document is removed', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    // Create author
    await createAuthor(
      await authenticatedRequest('http://localhost:3003/api/admin/authors', {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
        json: { name: 'Temporary Author', slug: 'temp-author', status: 'draft' },
      }),
      rootContext,
    );

    // Delete author
    const deleteResponse = await deleteAuthor(
      await authenticatedRequest('http://localhost:3003/api/admin/authors/temp-author', {
        user: admin,
        siteId: site._id.toString(),
        method: 'DELETE',
      }),
      { params: Promise.resolve({ slug: 'temp-author' }) },
    );
    expect(deleteResponse.status).toBe(200);

    const deleteLog = await ActivityLog.findOne({
      siteId: site._id,
      entitySlug: 'temp-author',
      action: 'delete',
    }).exec();

    expect(deleteLog).not.toBeNull();
    expect(deleteLog?.entityTitle).toBe('Temporary Author');
    expect(deleteLog?.entityType).toBe('author');
    expect(deleteLog?.actor.email).toBe(admin.email);
  });

  it('enforces active site isolation so site A activity is never visible on site B', async () => {
    const admin = await createTestUser();
    const [siteA, siteB] = await Promise.all([createTestSite(), createTestSite()]);

    await createFaq(
      await authenticatedRequest('http://localhost:3003/api/admin/faqs', {
        user: admin,
        siteId: siteA._id.toString(),
        method: 'POST',
        json: { question: 'Site A Question?', answer: 'Site A Answer' },
      }),
      rootContext,
    );

    // Query activity logs for site B
    const siteBResponse = await getActivityLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/activity-logs', {
        user: admin,
        siteId: siteB._id.toString(),
        method: 'GET',
      }),
      rootContext,
    );

    expect(siteBResponse.status).toBe(200);
    const siteBData = await siteBResponse.json();
    expect(siteBData.items).toEqual([]);
    expect(siteBData.pagination.total).toBe(0);

    // Query activity logs for site A
    const siteAResponse = await getActivityLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/activity-logs', {
        user: admin,
        siteId: siteA._id.toString(),
        method: 'GET',
      }),
      rootContext,
    );

    expect(siteAResponse.status).toBe(200);
    const siteAData = await siteAResponse.json();
    expect(siteAData.items.length).toBe(1);
    expect(siteAData.items[0].entityTitle).toBe('Site A Question?');
  });

  it('filters activity logs by action, entityType, and search keywords', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    // Create 3 varied records
    await recordActivity({
      siteId: site._id,
      user: admin,
      action: 'create',
      entityType: 'blog',
      entityId: 'id-1',
      entityTitle: 'Special Guide',
      entitySlug: 'special-guide',
    });

    await recordActivity({
      siteId: site._id,
      user: admin,
      action: 'publish',
      entityType: 'whitepaper',
      entityId: 'id-2',
      entityTitle: 'Quarterly Report',
      entitySlug: 'quarterly-report',
    });

    await recordActivity({
      siteId: site._id,
      user: admin,
      action: 'delete',
      entityType: 'faq',
      entityId: 'id-3',
      entityTitle: 'Old Question',
    });

    // 1. Filter by action=publish
    const actionResponse = await getActivityLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/activity-logs?action=publish', {
        user: admin,
        siteId: site._id.toString(),
        method: 'GET',
      }),
      rootContext,
    );
    const actionData = await actionResponse.json();
    expect(actionData.items.length).toBe(1);
    expect(actionData.items[0].entityTitle).toBe('Quarterly Report');

    // 2. Filter by entityType=faq
    const entityResponse = await getActivityLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/activity-logs?entityType=faq', {
        user: admin,
        siteId: site._id.toString(),
        method: 'GET',
      }),
      rootContext,
    );
    const entityData = await entityResponse.json();
    expect(entityData.items.length).toBe(1);
    expect(entityData.items[0].entityTitle).toBe('Old Question');

    // 3. Search by title keyword
    const searchResponse = await getActivityLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/activity-logs?search=Special', {
        user: admin,
        siteId: site._id.toString(),
        method: 'GET',
      }),
      rootContext,
    );
    const searchData = await searchResponse.json();
    expect(searchData.items.length).toBe(1);
    expect(searchData.items[0].entityTitle).toBe('Special Guide');
  });

  it('paginates results deterministically with bounded limit', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    // Create 5 activity records with distinct timestamps
    for (let i = 1; i <= 5; i++) {
      await recordActivity({
        siteId: site._id,
        user: admin,
        action: 'create',
        entityType: 'blog',
        entityId: `id-${i}`,
        entityTitle: `Post Number ${i}`,
        entitySlug: `post-${i}`,
      });
    }

    // Page 1 with limit 2
    const page1Response = await getActivityLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/activity-logs?page=1&limit=2', {
        user: admin,
        siteId: site._id.toString(),
        method: 'GET',
      }),
      rootContext,
    );
    const page1 = await page1Response.json();
    expect(page1.items.length).toBe(2);
    expect(page1.pagination.page).toBe(1);
    expect(page1.pagination.limit).toBe(2);
    expect(page1.pagination.total).toBe(5);
    expect(page1.pagination.totalPages).toBe(3);

    // Newest record should be Post Number 5
    expect(page1.items[0].entityTitle).toBe('Post Number 5');
    expect(page1.items[1].entityTitle).toBe('Post Number 4');

    // Page 2 with limit 2
    const page2Response = await getActivityLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/activity-logs?page=2&limit=2', {
        user: admin,
        siteId: site._id.toString(),
        method: 'GET',
      }),
      rootContext,
    );
    const page2 = await page2Response.json();
    expect(page2.items.length).toBe(2);
    expect(page2.items[0].entityTitle).toBe('Post Number 3');
    expect(page2.items[1].entityTitle).toBe('Post Number 2');
  });

  it('strips sensitive credentials from metadata before persisting', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();

    const record = await recordActivity({
      siteId: site._id,
      user: admin,
      action: 'update',
      entityType: 'blog',
      entityId: 'safe-id',
      entityTitle: 'Security Check Post',
      metadata: {
        password: 'leak_candidate',
        apiToken: 'tok_live_xyz',
        authHeader: 'Bearer 12345',
        status: 'publish',
        safeSummary: 'Everything ok',
      },
    });

    expect(record).not.toBeNull();
    expect(record?.metadata).not.toHaveProperty('password');
    expect(record?.metadata).not.toHaveProperty('apiToken');
    expect(record?.metadata).not.toHaveProperty('authHeader');
    expect(record?.metadata).toMatchObject({
      status: 'publish',
      safeSummary: 'Everything ok',
    });
  });

  it('rejects anonymous unauthenticated requests with 401 UNAUTHORIZED', async () => {
    const site = await createTestSite();

    // Anonymous request without session token
    const headers = new Headers();
    headers.set('x-cms-site', site._id.toString());
    const req = new (await import('next/server')).NextRequest(
      'http://localhost:3003/api/admin/activity-logs',
      { method: 'GET', headers },
    );

    const response = await getActivityLogs(req, rootContext);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });
});
