import { describe, expect, it } from 'vitest';
import { GET as getAuditLogs } from '@/app/api/admin/audit-logs/route';
import { POST as createBlog } from '@/app/api/admin/blogs/route';
import { PUT as updateBlog, DELETE as deleteBlog } from '@/app/api/admin/blogs/[slug]/route';
import { POST as createEvent } from '@/app/api/admin/events/route';
import { PUT as updateEvent, DELETE as deleteEvent } from '@/app/api/admin/events/[slug]/route';
import { POST as createUser } from '@/app/api/admin/users/route';
import { PUT as updateUser } from '@/app/api/admin/users/[userId]/route';
import { POST as createSite } from '@/app/api/admin/sites/route';
import { PUT as updateSite } from '@/app/api/admin/sites/[siteId]/route';
import { POST as rotateWebhookSecret } from '@/app/api/admin/sites/[siteId]/webhook-secret/route';
import { POST as issueApiKey } from '@/app/api/admin/sites/[siteId]/api-keys/route';
import { POST as rotateApiKey } from '@/app/api/admin/api-keys/[id]/rotate/route';
import { DELETE as revokeApiKey } from '@/app/api/admin/api-keys/[id]/route';
import { logAudit } from '@/lib/audit/logger';
import AuditLog from '@/models/AuditLog';
import {
  authenticatedRequest,
  createTestSite,
  createTestUser,
} from '@/tests/setup/factories';

const rootContext = { params: Promise.resolve({}) };

describe('Admin Audit Logs API', () => {
  it('allows admins to fetch logs with pagination and metadata', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    await logAudit({
      siteId: site._id,
      actor: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      entityType: 'blog',
      entityId: 'blog-1',
      entityTitle: 'First Blog Post',
      action: 'create',
    });

    await logAudit({
      siteId: site._id,
      actor: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      entityType: 'blog',
      entityId: 'blog-1',
      entityTitle: 'First Blog Post',
      action: 'publish',
    });

    const req = await authenticatedRequest(
      'http://localhost:3003/api/admin/audit-logs?page=1&limit=10',
      { user: admin, siteId: site._id.toString() },
    );

    const response = await getAuditLogs(req, rootContext);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    });
    expect(body.data[0].action).toBe('publish');
    expect(body.data[1].action).toBe('create');
  });

  it('strictly forbids editors from reading audit logs', async () => {
    const site = await createTestSite();
    const editor = await createTestUser({ role: 'editor', siteIds: [site._id.toString()] });

    const req = await authenticatedRequest('http://localhost:3003/api/admin/audit-logs', {
      user: editor,
      siteId: site._id.toString(),
    });

    const response = await getAuditLogs(req, rootContext);
    expect(response.status).toBe(403);
  });

  it('enforces tenant site isolation while exposing global user and site entries to admins', async () => {
    const siteA = await createTestSite();
    const siteB = await createTestSite();
    const admin = await createTestUser({
      role: 'admin',
      siteIds: [siteA._id.toString(), siteB._id.toString()],
    });

    await logAudit({
      siteId: siteA._id,
      actor: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [siteA._id.toString()],
      },
      entityType: 'blog',
      entityId: 'blog-a',
      entityTitle: 'Site Alpha Post',
      action: 'create',
    });

    await logAudit({
      siteId: siteB._id,
      actor: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [siteB._id.toString()],
      },
      entityType: 'blog',
      entityId: 'blog-b',
      entityTitle: 'Site Beta Post',
      action: 'create',
    });

    await logAudit({
      siteId: null,
      actor: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [],
      },
      entityType: 'user',
      entityId: 'user-global',
      entityTitle: 'Global User Entry',
      action: 'create',
    });

    const reqA = await authenticatedRequest('http://localhost:3003/api/admin/audit-logs', {
      user: admin,
      siteId: siteA._id.toString(),
    });
    const resA = await getAuditLogs(reqA, rootContext);
    const bodyA = await resA.json();

    expect(bodyA.data).toHaveLength(2);
    const titles = bodyA.data.map((entry: { entityTitle: string }) => entry.entityTitle);
    expect(titles).toContain('Site Alpha Post');
    expect(titles).toContain('Global User Entry');
    expect(titles).not.toContain('Site Beta Post');
  });

  it('filters safely by entityType and literal substring search', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    await logAudit({
      siteId: site._id,
      actor: {
        id: admin._id.toString(),
        name: 'Alice Johnson',
        email: 'alice@example.com',
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      entityType: 'event',
      entityId: 'evt-1',
      entityTitle: 'Product Launch [2026]',
      action: 'create',
    });

    await logAudit({
      siteId: site._id,
      actor: {
        id: admin._id.toString(),
        name: 'Bob Smith',
        email: 'bob@example.com',
        role: admin.role,
        siteIds: [site._id.toString()],
      },
      entityType: 'blog',
      entityId: 'blog-2',
      entityTitle: 'Unrelated Blog',
      action: 'create',
    });

    const reqFilter = await authenticatedRequest(
      'http://localhost:3003/api/admin/audit-logs?entityType=event',
      { user: admin, siteId: site._id.toString() },
    );
    const resFilter = await getAuditLogs(reqFilter, rootContext);
    const bodyFilter = await resFilter.json();
    expect(bodyFilter.data).toHaveLength(1);
    expect(bodyFilter.data[0].entityType).toBe('event');

    const reqSearch = await authenticatedRequest(
      'http://localhost:3003/api/admin/audit-logs?search=[2026]',
      { user: admin, siteId: site._id.toString() },
    );
    const resSearch = await getAuditLogs(reqSearch, rootContext);
    const bodySearch = await resSearch.json();
    expect(bodySearch.data).toHaveLength(1);
    expect(bodySearch.data[0].entityTitle).toBe('Product Launch [2026]');
  });

  it('writes audit entries when real blog create, publish, unpublish, and delete routes are called', async () => {
    const site = await createTestSite();
    const editor = await createTestUser({ role: 'editor', siteIds: [site._id.toString()] });
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const createRes = await createBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
        user: editor,
        siteId: site._id.toString(),
        method: 'POST',
        json: {
          title: 'Audit Wired Post',
          slug: 'audit-wired-post',
          content: '<p>Hello world</p>',
          status: 'draft',
        },
      }),
      rootContext,
    );
    expect(createRes.status).toBe(201);

    const editRes = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/audit-wired-post', {
        user: editor,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { title: 'Audit Wired Post Updated' },
      }),
      { params: Promise.resolve({ slug: 'audit-wired-post' }) },
    );
    expect(editRes.status).toBe(200);

    const publishRes = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/audit-wired-post', {
        user: editor,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'publish' },
      }),
      { params: Promise.resolve({ slug: 'audit-wired-post' }) },
    );
    expect(publishRes.status).toBe(200);

    const unpublishRes = await updateBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/audit-wired-post', {
        user: editor,
        siteId: site._id.toString(),
        method: 'PUT',
        json: { status: 'draft' },
      }),
      { params: Promise.resolve({ slug: 'audit-wired-post' }) },
    );
    expect(unpublishRes.status).toBe(200);

    const deleteRes = await deleteBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs/audit-wired-post', {
        user: editor,
        siteId: site._id.toString(),
        method: 'DELETE',
      }),
      { params: Promise.resolve({ slug: 'audit-wired-post' }) },
    );
    expect(deleteRes.status).toBe(200);

    const logs = await AuditLog.find({ siteId: site._id, entityType: 'blog' })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    expect(logs.map((l) => l.action)).toEqual(['create', 'update', 'publish', 'unpublish', 'delete']);
    expect(logs[0].entityTitle).toBe('Audit Wired Post');
    expect(logs[0].actor.id.toString()).toBe(editor._id.toString());
    expect(logs[2].details).toMatchObject({
      slug: 'audit-wired-post',
      status: 'publish',
      previousStatus: 'draft',
    });

    const listRes = await getAuditLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/audit-logs?entityType=blog', {
        user: admin,
        siteId: site._id.toString(),
      }),
      rootContext,
    );
    expect(listRes.status).toBe(200);
    expect((await listRes.json()).data).toHaveLength(5);
  });

  it('writes audit entries when real event create, publish, and delete routes are called', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    const createRes = await createEvent(
      await authenticatedRequest('http://localhost:3003/api/admin/events', {
        user: admin,
        siteId: site._id.toString(),
        method: 'POST',
        json: {
          title: 'Audit Wired Event',
          slug: 'audit-wired-event',
          content: '<p>Keynote session</p>',
          startAt: '2026-12-01T10:00:00.000Z',
          endAt: '2026-12-01T12:00:00.000Z',
          timeZone: 'UTC',
          format: 'online',
          onlineUrl: 'https://meet.example.com/keynote',
          status: 'draft',
        },
      }),
      rootContext,
    );
    expect(createRes.status).toBe(201);

    const publishRes = await updateEvent(
      await authenticatedRequest('http://localhost:3003/api/admin/events/audit-wired-event', {
        user: admin,
        siteId: site._id.toString(),
        method: 'PUT',
        json: {
          title: 'Audit Wired Event',
          slug: 'audit-wired-event',
          content: '<p>Keynote session</p>',
          startAt: '2026-12-01T10:00:00.000Z',
          endAt: '2026-12-01T12:00:00.000Z',
          timeZone: 'UTC',
          format: 'online',
          onlineUrl: 'https://meet.example.com/keynote',
          status: 'publish',
        },
      }),
      { params: Promise.resolve({ slug: 'audit-wired-event' }) },
    );
    expect(publishRes.status).toBe(200);

    const deleteRes = await deleteEvent(
      await authenticatedRequest('http://localhost:3003/api/admin/events/audit-wired-event', {
        user: admin,
        siteId: site._id.toString(),
        method: 'DELETE',
      }),
      { params: Promise.resolve({ slug: 'audit-wired-event' }) },
    );
    expect(deleteRes.status).toBe(200);

    const logs = await AuditLog.find({ siteId: site._id, entityType: 'event' })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    expect(logs.map((l) => l.action)).toEqual(['create', 'publish', 'delete']);
    expect(logs[1].details).toMatchObject({
      slug: 'audit-wired-event',
      status: 'publish',
      previousStatus: 'draft',
    });
  });

  it('logs global user creation and records previous/next diffs plus passwordChanged flag without leaking secrets', async () => {
    const siteA = await createTestSite();
    const siteB = await createTestSite();
    // Both actor admin and created admin have empty siteIds, which userAssignmentSchema allows.
    const rootAdmin = await createTestUser({ role: 'admin', siteIds: [] });

    const createUserRes = await createUser(
      await authenticatedRequest('http://localhost:3003/api/admin/users', {
        user: rootAdmin,
        method: 'POST',
        json: {
          email: 'second-admin@example.com',
          name: 'Second Admin',
          role: 'admin',
          siteIds: [],
          password: 'super-secret-initial-pass',
        },
      }),
      rootContext,
    );
    expect(createUserRes.status).toBe(201);
    const createdUser = await createUserRes.json();

    const targetEditor = await createTestUser({
      role: 'editor',
      siteIds: [siteA._id.toString()],
      status: 'active',
    });

    const targetEditorId = targetEditor._id.toString();
    const newSecretPassword = 'brand-new-secure-password-123';
    const updateUserRes = await updateUser(
      await authenticatedRequest(`http://localhost:3003/api/admin/users/${targetEditorId}`, {
        user: rootAdmin,
        method: 'PUT',
        json: {
          role: 'admin',
          status: 'disabled',
          siteIds: [siteA._id.toString(), siteB._id.toString()],
          password: newSecretPassword,
        },
      }),
      { params: Promise.resolve({ userId: targetEditorId }) },
    );
    expect(updateUserRes.status).toBe(200);

    const logs = await AuditLog.find({ entityType: 'user' })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    expect(logs).toHaveLength(2);

    expect(logs[0].siteId).toBeNull();
    expect(logs[0].action).toBe('create');
    expect(logs[0].entityId).toBe(createdUser.id);
    expect(JSON.stringify(logs[0])).not.toContain('super-secret-initial-pass');

    expect(logs[1].siteId).toBeNull();
    expect(logs[1].action).toBe('update');
    expect(logs[1].details).toMatchObject({
      email: targetEditor.email,
      role: { previous: 'editor', next: 'admin' },
      status: { previous: 'active', next: 'disabled' },
      siteIds: {
        previous: [siteA._id.toString()],
        next: [siteA._id.toString(), siteB._id.toString()],
      },
      passwordChanged: true,
    });
    const serializedUpdateLog = JSON.stringify(logs[1]);
    expect(serializedUpdateLog).not.toContain(newSecretPassword);
    expect(serializedUpdateLog).not.toContain('passwordHash');

    // Updating without a password should record passwordChanged: false.
    const nameOnlyRes = await updateUser(
      await authenticatedRequest(`http://localhost:3003/api/admin/users/${targetEditorId}`, {
        user: rootAdmin,
        method: 'PUT',
        json: { name: 'Renamed Admin' },
      }),
      { params: Promise.resolve({ userId: targetEditorId }) },
    );
    expect(nameOnlyRes.status).toBe(200);

    const updatedUserLogs = await AuditLog.find({ entityType: 'user' })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    expect(updatedUserLogs).toHaveLength(3);
    expect(updatedUserLogs[2].details).toMatchObject({
      role: { previous: 'admin', next: 'admin' },
      status: { previous: 'disabled', next: 'disabled' },
      passwordChanged: false,
    });

    // Confirm admins see these global logs when querying under an active site.
    const queryRes = await getAuditLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/audit-logs?entityType=user', {
        user: rootAdmin,
        siteId: siteA._id.toString(),
      }),
      rootContext,
    );
    expect(queryRes.status).toBe(200);
    expect((await queryRes.json()).data).toHaveLength(3);
  });

  it('logs site create/update globally and logs API key issue/rotate/revoke and webhook secret rotation per site without leaking secrets', async () => {
    const admin = await createTestUser({ role: 'admin', siteIds: [] });

    const createSiteRes = await createSite(
      await authenticatedRequest('http://localhost:3003/api/admin/sites', {
        user: admin,
        method: 'POST',
        json: {
          name: 'Audited Site',
          slug: 'audited-site',
          primaryDomain: 'https://audited.example.com',
        },
      }),
      rootContext,
    );
    expect(createSiteRes.status).toBe(201);
    const createdSite = await createSiteRes.json();

    const updateSiteRes = await updateSite(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${createdSite.id}`, {
        user: admin,
        method: 'PUT',
        json: { name: 'Audited Site Renamed' },
      }),
      { params: Promise.resolve({ siteId: createdSite.id }) },
    );
    expect(updateSiteRes.status).toBe(200);

    const webhookRes = await rotateWebhookSecret(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${createdSite.id}/webhook-secret`,
        { user: admin, method: 'POST', json: {} },
      ),
      { params: Promise.resolve({ siteId: createdSite.id }) },
    );
    expect(webhookRes.status).toBe(201);
    const { secret: webhookSecret } = await webhookRes.json();

    const issueRes = await issueApiKey(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${createdSite.id}/api-keys`,
        {
          user: admin,
          method: 'POST',
          json: { name: 'Website Reader', scopes: ['content:read'] },
        },
      ),
      { params: Promise.resolve({ siteId: createdSite.id }) },
    );
    expect(issueRes.status).toBe(201);
    const issued = await issueRes.json();

    const rotateRes = await rotateApiKey(
      await authenticatedRequest(`http://localhost:3003/api/admin/api-keys/${issued.key.id}/rotate`, {
        user: admin,
        method: 'POST',
        json: {},
      }),
      { params: Promise.resolve({ id: issued.key.id }) },
    );
    expect(rotateRes.status).toBe(201);
    const rotated = await rotateRes.json();

    const revokeRes = await revokeApiKey(
      await authenticatedRequest(`http://localhost:3003/api/admin/api-keys/${rotated.key.id}`, {
        user: admin,
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: rotated.key.id }) },
    );
    expect(revokeRes.status).toBe(200);

    const siteLogs = await AuditLog.find({ entityType: 'site' }).sort({ createdAt: 1, _id: 1 }).exec();
    expect(siteLogs.map((l) => l.action)).toEqual(['create', 'update', 'rotate']);
    expect(siteLogs[0].siteId).toBeNull();
    expect(siteLogs[1].siteId).toBeNull();
    expect(siteLogs[2].siteId?.toString()).toBe(createdSite.id);
    expect(JSON.stringify(siteLogs[2])).not.toContain(webhookSecret);

    const keyLogs = await AuditLog.find({ entityType: 'api_key', siteId: createdSite.id })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    expect(keyLogs.map((l) => l.action)).toEqual(['generate', 'rotate', 'revoke']);
    expect(keyLogs[1].details).toMatchObject({
      newPrefix: rotated.key.prefix,
      rotatedFromId: issued.key.id,
    });
    const serializedKeyLogs = JSON.stringify(keyLogs);
    expect(serializedKeyLogs).not.toContain(issued.plaintext);
    expect(serializedKeyLogs).not.toContain(rotated.plaintext);

    // Confirm two-site isolation across real route writes: siteB activity must not leak into siteA queries.
    const siteB = await createTestSite();
    await createBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
        user: admin,
        siteId: siteB._id.toString(),
        method: 'POST',
        json: {
          title: 'Site B Isolated Post',
          slug: 'site-b-isolated-post',
          content: '<p>Site B only</p>',
          status: 'draft',
        },
      }),
      rootContext,
    );
    await rotateWebhookSecret(
      await authenticatedRequest(
        `http://localhost:3003/api/admin/sites/${siteB._id}/webhook-secret`,
        { user: admin, method: 'POST', json: {} },
      ),
      { params: Promise.resolve({ siteId: siteB._id.toString() }) },
    );

    const siteAViewRes = await getAuditLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/audit-logs?limit=50', {
        user: admin,
        siteId: createdSite.id,
      }),
      rootContext,
    );
    expect(siteAViewRes.status).toBe(200);
    const siteAEntries = (await siteAViewRes.json()).data as Array<{
      siteId: string | null;
      entityTitle: string;
    }>;
    expect(siteAEntries.some((e) => e.entityTitle === 'Site B Isolated Post')).toBe(false);
    expect(siteAEntries.some((e) => e.siteId === siteB._id.toString())).toBe(false);
    expect(siteAEntries.some((e) => e.siteId === null && e.entityTitle === 'Audited Site')).toBe(
      true,
    );

    // Rejected calls should not write audit entries.
    const countBeforeRejected = await AuditLog.countDocuments({}).exec();
    const invalidBlogRes = await createBlog(
      await authenticatedRequest('http://localhost:3003/api/admin/blogs', {
        user: admin,
        siteId: createdSite.id,
        method: 'POST',
        json: { title: '' },
      }),
      rootContext,
    );
    expect(invalidBlogRes.status).toBe(400);
    expect(await AuditLog.countDocuments({}).exec()).toBe(countBeforeRejected);
  });

  it('rejects unrecognized audit actions at the schema boundary', async () => {
    const admin = await createTestUser({ role: 'admin', siteIds: [] });

    await expect(
      AuditLog.create({
        siteId: null,
        actor: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
        entityType: 'user',
        entityId: admin._id.toString(),
        entityTitle: admin.name,
        action: 'unknown_action' as never,
      }),
    ).rejects.toThrow();
  });

  it('rejects malformed or unsafe page, limit, and calculated skip parameters while preserving tenant isolation during search', async () => {
    const siteA = await createTestSite();
    const siteB = await createTestSite();
    const admin = await createTestUser({
      role: 'admin',
      siteIds: [siteA._id.toString(), siteB._id.toString()],
    });

    await logAudit({
      siteId: siteB._id,
      actor: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [siteB._id.toString()],
      },
      entityType: 'blog',
      entityId: 'blog-secret-b',
      entityTitle: 'Shared Search Match',
      action: 'create',
    });

    // Searching on siteA must still never return siteB records.
    const searchRes = await getAuditLogs(
      await authenticatedRequest('http://localhost:3003/api/admin/audit-logs?search=Shared', {
        user: admin,
        siteId: siteA._id.toString(),
      }),
      rootContext,
    );
    expect(searchRes.status).toBe(200);
    expect((await searchRes.json()).data).toHaveLength(0);

    const badQueries = [
      'page=10abc',
      'limit=20xyz',
      'page=0',
      'page=-1',
      'limit=101',
      'page=99999999999999999999',
      // Both page (1e15) and limit (20) are individually safe integers, but skip overflows MAX_SAFE_INTEGER.
      'page=1000000000000000&limit=20',
    ];

    for (const qs of badQueries) {
      const res = await getAuditLogs(
        await authenticatedRequest(`http://localhost:3003/api/admin/audit-logs?${qs}`, {
          user: admin,
          siteId: siteA._id.toString(),
        }),
        rootContext,
      );
      expect(res.status).toBe(400);
    }
  });
});
