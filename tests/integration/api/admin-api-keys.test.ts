import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { compare } from 'bcryptjs';
import {
  GET as listApiKeys,
  POST as createApiKey,
} from '@/app/api/admin/sites/[siteId]/api-keys/route';
import { DELETE as deleteApiKey } from '@/app/api/admin/api-keys/[id]/route';
import { POST as rotateApiKeyRoute } from '@/app/api/admin/api-keys/[id]/rotate/route';
import { authenticateApiKey, clearApiKeyCache } from '@/lib/auth/api-key';
import ApiKey from '@/models/ApiKey';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';

describe('admin API-key lifecycle', () => {
  it('issues plaintext once, stores bcrypt, lists metadata, and authenticates scope', async () => {
    const admin = await createTestUser();
    const site = await createTestSite();
    const context = { params: Promise.resolve({ siteId: site._id.toString() }) };
    const issueRequest = await authenticatedRequest(
      `http://localhost:3003/api/admin/sites/${site._id}/api-keys`,
      {
        user: admin,
        method: 'POST',
        json: { name: 'Website', scopes: ['content:read'] },
      },
    );

    const issued = await createApiKey(issueRequest, context);
    expect(issued.status).toBe(201);
    const body = await issued.json();
    expect(body.plaintext).toMatch(/^cms_[a-f\d]{8}_[A-Za-z\d_-]{32}$/);
    expect(body.key).toMatchObject({ name: 'Website', scopes: ['content:read'] });
    expect(body.key).not.toHaveProperty('keyHash');

    const stored = await ApiKey.findById(body.key.id).select('+keyHash').exec();
    expect(stored).not.toBeNull();
    expect(stored?.keyHash).not.toBe(body.plaintext);
    expect(await compare(body.plaintext, stored!.keyHash)).toBe(true);

    clearApiKeyCache();
    const auth = await authenticateApiKey(
      new NextRequest('http://localhost:3003/api/v1/posts', {
        headers: { authorization: `Bearer ${body.plaintext}` },
      }),
      'content:read',
    );
    expect(auth.siteId).toBe(site._id.toString());
    expect(auth.keyId).toBe(body.key.id);

    const listed = await listApiKeys(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${site._id}/api-keys`, {
        user: admin,
      }),
      context,
    );
    const listBody = await listed.json();
    expect(listBody).toHaveLength(1);
    expect(listBody[0]).not.toHaveProperty('plaintext');
    expect(listBody[0]).not.toHaveProperty('keyHash');
  });

  it('rejects invalid inputs and editor access', async () => {
    const site = await createTestSite();
    const admin = await createTestUser();
    const editor = await createTestUser({ role: 'editor', siteIds: [site._id.toString()] });
    const context = { params: Promise.resolve({ siteId: site._id.toString() }) };
    const invalid = await createApiKey(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${site._id}/api-keys`, {
        user: admin,
        method: 'POST',
        json: { name: '', scopes: ['root'] },
      }),
      context,
    );
    expect(invalid.status).toBe(400);

    const forbidden = await listApiKeys(
      await authenticatedRequest(`http://localhost:3003/api/admin/sites/${site._id}/api-keys`, {
        user: editor,
      }),
      context,
    );
    expect(forbidden.status).toBe(403);
  });

  it('rotates with a 24-hour grace window and revokes immediately in-process', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-09-03T09:00:00.000Z');
      vi.setSystemTime(now);
      const admin = await createTestUser();
      const site = await createTestSite();
      const siteContext = { params: Promise.resolve({ siteId: site._id.toString() }) };
      const issued = await createApiKey(
        await authenticatedRequest(`http://localhost:3003/api/admin/sites/${site._id}/api-keys`, {
          user: admin,
          method: 'POST',
          json: { name: 'Deploy', scopes: ['content:read', 'intake:write'] },
        }),
        siteContext,
      );
      const original = await issued.json();
      const keyContext = { params: Promise.resolve({ id: original.key.id }) };

      const rotated = await rotateApiKeyRoute(
        await authenticatedRequest(
          `http://localhost:3003/api/admin/api-keys/${original.key.id}/rotate`,
          { user: admin, method: 'POST', json: {} },
        ),
        keyContext,
      );
      expect(rotated.status).toBe(201);
      const replacement = await rotated.json();
      expect(replacement.plaintext).not.toBe(original.plaintext);
      expect(replacement.key.rotatedFrom).toBe(original.key.id);

      const old = await ApiKey.findById(original.key.id).exec();
      expect(old?.expiresAt?.toISOString()).toBe('2026-09-04T09:00:00.000Z');
      await expect(
        authenticateApiKey(
          new NextRequest('http://localhost:3003/api/v1/posts', {
            headers: { authorization: `Bearer ${original.plaintext}` },
          }),
          'content:read',
        ),
      ).resolves.toMatchObject({ keyId: original.key.id });

      const revoked = await deleteApiKey(
        await authenticatedRequest(`http://localhost:3003/api/admin/api-keys/${original.key.id}`, {
          user: admin,
          method: 'DELETE',
          json: {},
        }),
        keyContext,
      );
      expect(revoked.status).toBe(200);
      await expect(
        authenticateApiKey(
          new NextRequest('http://localhost:3003/api/v1/posts', {
            headers: { authorization: `Bearer ${original.plaintext}` },
          }),
          'content:read',
        ),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      vi.useRealTimers();
      clearApiKeyCache();
    }
  });
});
