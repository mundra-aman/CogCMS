import { describe, expect, it } from 'vitest';
import { GET as listSites, POST as createSite } from '@/app/api/admin/sites/route';
import { GET as getSite, PUT as updateSite } from '@/app/api/admin/sites/[siteId]/route';
import { GET as listUsers, POST as createUser } from '@/app/api/admin/users/route';
import { PUT as updateUser } from '@/app/api/admin/users/[userId]/route';
import { GET as getSession, PUT as changePassword } from '@/app/api/admin/session/route';
import { verifyPassword } from '@/lib/auth/password';
import { createTestSite, createTestUser, authenticatedRequest } from '@/tests/setup/factories';
import User from '@/models/User';

const rootContext = { params: Promise.resolve({}) };

describe('admin site and user APIs', () => {
  it('creates safe sites and never accepts server-owned or webhook fields', async () => {
    const admin = await createTestUser();
    const request = await authenticatedRequest('http://localhost:3003/api/admin/sites', {
      user: admin,
      method: 'POST',
      json: {
        name: 'Acme Editorial',
        slug: 'acme-editorial',
        primaryDomain: 'https://content.example.com/',
      },
    });
    const response = await createSite(request, rootContext);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      name: 'Acme Editorial',
      slug: 'acme-editorial',
      primaryDomain: 'https://content.example.com',
      mediaPrefix: 'acme-editorial',
      status: 'active',
    });
    expect(body).not.toHaveProperty('webhookSecret');
    expect(body).not.toHaveProperty('createdBy');

    const injected = await authenticatedRequest('http://localhost:3003/api/admin/sites', {
      user: admin,
      method: 'POST',
      json: {
        name: 'Injected',
        slug: 'injected',
        primaryDomain: 'https://injected.example.com',
        createdBy: admin._id.toString(),
        webhookSecret: 'not-allowed',
      },
    });
    expect((await createSite(injected, rootContext)).status).toBe(400);
  });

  it('lets admins assign an editor but rejects editor management access', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const request = await authenticatedRequest('http://localhost:3003/api/admin/users', {
      user: admin,
      method: 'POST',
      json: {
        email: 'editor@example.com',
        name: 'Site Editor',
        role: 'editor',
        siteIds: [site._id.toString()],
        status: 'active',
        password: 'editor-password-123',
      },
    });
    const response = await createUser(request, rootContext);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ role: 'editor', siteIds: [site._id.toString()] });
    expect(body).not.toHaveProperty('passwordHash');

    const editor = await User.findById(body.id).exec();
    expect(editor).not.toBeNull();
    const forbiddenRequest = await authenticatedRequest('http://localhost:3003/api/admin/users', {
      user: editor!,
    });
    const forbiddenResponse = await listUsers(forbiddenRequest, rootContext);
    expect(forbiddenResponse.status).toBe(403);
    expect((await forbiddenResponse.json()).code).toBe('FORBIDDEN');

    const listSitesResponse = await listSites(
      await authenticatedRequest('http://localhost:3003/api/admin/sites', { user: editor! }),
      rootContext,
    );
    expect(listSitesResponse.status).toBe(403);

    const createSiteResponse = await createSite(
      await authenticatedRequest('http://localhost:3003/api/admin/sites', {
        user: editor!,
        method: 'POST',
        json: {},
      }),
      rootContext,
    );
    expect(createSiteResponse.status).toBe(403);

    const siteContext = { params: Promise.resolve({ siteId: site._id.toString() }) };
    const getSiteResponse = await getSite(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${site._id}`, {
        user: editor!,
      }),
      siteContext,
    );
    expect(getSiteResponse.status).toBe(403);
    const updateSiteResponse = await updateSite(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${site._id}`, {
        user: editor!,
        method: 'PUT',
        json: {},
      }),
      siteContext,
    );
    expect(updateSiteResponse.status).toBe(403);

    const createUserResponse = await createUser(
      await authenticatedRequest('http://localhost:3003/api/admin/users', {
        user: editor!,
        method: 'POST',
        json: {},
      }),
      rootContext,
    );
    expect(createUserResponse.status).toBe(403);
    const updateUserResponse = await updateUser(
      await authenticatedRequest(`http://localhost:3003/api/admin/users/${editor!._id}`, {
        user: editor!,
        method: 'PUT',
        json: {},
      }),
      { params: Promise.resolve({ userId: editor!._id.toString() }) },
    );
    expect(updateUserResponse.status).toBe(403);
  });

  it('protects the last active admin and validates effective editor assignment', async () => {
    const admin = await createTestUser();
    const disable = await authenticatedRequest(
      `http://localhost:3003/api/admin/users/${admin._id}`,
      { user: admin, method: 'PUT', json: { status: 'disabled' } },
    );
    const disabled = await updateUser(disable, {
      params: Promise.resolve({ userId: admin._id.toString() }),
    });
    expect(disabled.status).toBe(409);
    expect((await disabled.json()).code).toBe('CONFLICT');

    const unassigned = await authenticatedRequest(
      `http://localhost:3003/api/admin/users/${admin._id}`,
      { user: admin, method: 'PUT', json: { role: 'editor', siteIds: [] } },
    );
    expect(
      (
        await updateUser(unassigned, {
          params: Promise.resolve({ userId: admin._id.toString() }),
        })
      ).status,
    ).toBe(400);

    const site = await createTestSite();
    const demote = await authenticatedRequest(
      `http://localhost:3003/api/admin/users/${admin._id}`,
      {
        user: admin,
        method: 'PUT',
        json: { role: 'editor', siteIds: [site._id.toString()] },
      },
    );
    expect(
      (
        await updateUser(demote, {
          params: Promise.resolve({ userId: admin._id.toString() }),
        })
      ).status,
    ).toBe(409);
  });

  it('archives rather than deletes sites and changes the current password', async () => {
    const admin = await createTestUser({ password: 'old-password-123' });
    const site = await createTestSite();
    const archive = await authenticatedRequest(
      `http://localhost:3003/api/admin/sites/${site._id}`,
      { user: admin, method: 'PUT', json: { status: 'archived' } },
    );
    const archiveResponse = await updateSite(archive, {
      params: Promise.resolve({ siteId: site._id.toString() }),
    });
    expect(archiveResponse.status).toBe(200);
    expect((await archiveResponse.json()).status).toBe('archived');

    const passwordRequest = await authenticatedRequest('http://localhost:3003/api/admin/session', {
      user: admin,
      method: 'PUT',
      json: { currentPassword: 'old-password-123', newPassword: 'new-password-456' },
    });
    expect((await changePassword(passwordRequest, rootContext)).status).toBe(200);
    const updated = await User.findById(admin._id).select('+passwordHash').exec();
    expect(await verifyPassword('new-password-456', updated?.passwordHash)).toBe(true);
    expect(await verifyPassword('old-password-123', updated?.passwordHash)).toBe(false);
  });

  it('returns a nullable current site when an admin has multiple choices', async () => {
    const admin = await createTestUser();
    await createTestSite();
    await createTestSite();
    const request = await authenticatedRequest('http://localhost:3003/api/admin/session', {
      user: admin,
    });
    const response = await getSession(request, rootContext);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.currentSite).toBeNull();
    expect(body.sites).toHaveLength(2);
  });
});
