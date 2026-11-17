import { GET as getAuditLogs } from '@/app/api/admin/audit-logs/route';
import { logAudit } from '@/lib/audit/logger';
import {
  authenticatedRequest,
  createTestSite,
  createTestUser,
} from '@/tests/setup/factories';
import { describe, expect, it } from 'vitest';

describe('Admin Audit Logs API', () => {
  // Verify: An admin can query the logs, and the response matches our { data, meta } contract in reverse-chronological order.
  it('allows admins to fetch logs with pagination and metadata', async () => {
    // Insert a real test Site and a real test User with role 'admin' into the temporary test database.
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    // Seed audit entries: Uses our logAudit helper to insert two real audit entries into the database
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

    // Simulating the Authenticated HTTP Request
    const req = await authenticatedRequest(
      `http://localhost:3003/api/admin/audit-logs?page=1&limit=10`,
      {
        user: admin,
        siteId: site._id.toString(),
      },
    );

    // Directly invokes our GET function from @app/api/admin/audit-logs/route.ts
    const response = await getAuditLogs(req, {
      params: Promise.resolve({}),
    });

    // Assertion: Proves that HTTP status is 200 OK.
    expect(response.status).toBe(200);
    const body = await response.json();

    // Assertion: Proves that exactly 2 records are returned.
    expect(body.data).toHaveLength(2);

    // Assertion: Proves that Metadata is calculated correctly..
    expect(body.meta).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    });

    // Assertion: Proves that HTTP status is 200 OK.
    expect(body.data[0].action).toBe('publish');

    // Assertion: Proves that Reverse-chronological ordering (sort: { createdAt: -1 }) placed the later 'publish' event before 'create'.
    expect(body.data[1].action).toBe('create');
  });

  // Test 2 — Role-Based Access Control (RBAC)
  it('strictly forbids editors from reading audit logs', async () => {
    const site = await createTestSite();
    // Create a user with role: 'editor'
    const editor = await createTestUser({ role: 'editor', siteIds: [site._id.toString()] });

    // Attempt to call getAuditLogs: withAdmin(..., { admin: true }) catches the editor role and halts execution before any data is queried;
    const req = await authenticatedRequest(
      `http://localhost:3003/api/admin/audit-logs`,
      {
        user: editor,
        siteId: site._id.toString(),
      },
    );

    const response = await getAuditLogs(req, {
      params: Promise.resolve({}),
    });

    // assert that the editor is completely blocked.
    expect(response.status).toBe(403);
  });

  // Test 3 — Multi-Tenant Site Isolation: A user active on Site A can NEVER see audit records from Site B;
  it('enforces tenant site isolation between different sites', async () => {
    // Create two separate sites: siteA and siteB
    const siteA = await createTestSite();
    const siteB = await createTestSite();

    // Create an admin assigned to both sites
    const admin = await createTestUser({
      role: 'admin',
      siteIds: [siteA._id.toString(), siteB._id.toString()],
    });

    // Create log for Site A: Insert an audit log for SiteAlpha (belonging to siteA._id).
    await logAudit({
      siteId: siteA._id,
      actor: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [siteA._id.toString()],
      },
      entityType: 'site',
      entityId: siteA._id.toString(),
      entityTitle: 'Site Alpha',
      action: 'update',
    });

    // Create log for Site B: Insert an audit log for SiteBeta (belonging to siteB._id).
    await logAudit({
      siteId: siteB._id,
      actor: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        siteIds: [siteB._id.toString()],
      },
      entityType: 'site',
      entityId: siteB._id.toString(),
      entityTitle: 'Site Beta',
      action: 'update',
    });

    // Request while active on Site A: Make a request with active context set to siteA:
    const reqA = await authenticatedRequest(
      `http://localhost:3003/api/admin/audit-logs`,
      {
        user: admin,
        siteId: siteA._id.toString(),
      },
    );

    const resA = await getAuditLogs(reqA, {
      params: Promise.resolve({}),
    });
    const bodyA = await resA.json();

    // Assert that even though the database contains logs for both sites, the API only returned Site Alpha, mathematically proving zero tenant cross-contamination!
    expect(bodyA.data).toHaveLength(1);
    expect(bodyA.data[0].entityTitle).toBe('Site Alpha');
  });

  // Test 4 — Filter & Literal Substring Search: Verify: Filtering by entityType works; Search is a literal substring search and resists regex injection (e.g. searching for [2026]).
  it('filters safely by entityType and literal substring search', async () => {
    const site = await createTestSite();
    const admin = await createTestUser({ role: 'admin', siteIds: [site._id.toString()] });

    // Create two logs: Event titled: "Product Launch [2026]"; Blog titled: "Unrelated Blog";
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

    // 1. Filter by entityType=event
    const reqFilter = await authenticatedRequest(
      `http://localhost:3003/api/admin/audit-logs?entityType=event`,
      { user: admin, siteId: site._id.toString() },
    );
    const resFilter = await getAuditLogs(reqFilter, { params: Promise.resolve({}) });
    const bodyFilter = await resFilter.json();
    expect(bodyFilter.data).toHaveLength(1);
    expect(bodyFilter.data[0].entityType).toBe('event');

    // 2. Filter by literal search with brackets '[2026]' (tests regex escaping)
    const reqSearch = await authenticatedRequest(
      `http://localhost:3003/api/admin/audit-logs?search=[2026]`,
      { user: admin, siteId: site._id.toString() },
    );
    const resSearch = await getAuditLogs(reqSearch, { params: Promise.resolve({}) });
    const bodySearch = await resSearch.json();
    expect(bodySearch.data).toHaveLength(1);
    expect(bodySearch.data[0].entityTitle).toBe('Product Launch [2026]');
  });
});
