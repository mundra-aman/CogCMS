import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  resolveSite: vi.fn(),
}));

vi.mock('@/lib/auth/csrf', () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock('@/lib/auth/require', () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
}));
vi.mock('@/lib/site/context', () => ({ resolveSite: mocks.resolveSite }));

import { readJson, withAdmin } from './admin-handler';
import { notFound, unauthorized } from './errors';

const user = {
  id: '64b64c2f9a4b12d8c4567890',
  email: 'editor@example.com',
  name: 'Editor',
  role: 'editor' as const,
  siteIds: ['64b64c2f9a4b12d8c4567891'],
};
const site = {
  id: '64b64c2f9a4b12d8c4567891',
  name: 'Example',
  slug: 'example',
  primaryDomain: 'https://example.com',
  publicPaths: {
    blogs: '/blogs',
    whitepapers: '/whitepapers',
    faq: '/faq',
    releaseNotes: '/release-notes',
  },
  publisher: { name: 'Example', url: 'https://example.com', logoUrl: '' },
  defaultLocale: 'en',
  mediaPrefix: 'example',
};
const ctx = { params: Promise.resolve({}) };

function request(method = 'GET'): NextRequest {
  return new NextRequest('http://localhost:3003/api/admin/blogs', { method });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireUser.mockResolvedValue(user);
  mocks.requireAdmin.mockResolvedValue(user);
  mocks.resolveSite.mockResolvedValue(site);
});

describe('withAdmin', () => {
  it('returns canonical 401 without calling the callback', async () => {
    mocks.requireUser.mockRejectedValue(unauthorized());
    const callback = vi.fn(async () => NextResponse.json({ ok: true }));
    const response = await withAdmin(callback)(request(), ctx);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      details: null,
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('applies mutation check → user → site → callback with the stable context', async () => {
    const order: string[] = [];
    mocks.assertSameOrigin.mockImplementation(() => order.push('csrf'));
    mocks.requireUser.mockImplementation(async () => {
      order.push('user');
      return user;
    });
    mocks.resolveSite.mockImplementation(async () => {
      order.push('site');
      return site;
    });
    const handler = withAdmin(async (_request, context) => {
      order.push('handler');
      expect(context).toEqual({ ...ctx, user, site });
      return NextResponse.json({ ok: true });
    });
    const response = await handler(request('POST'), ctx);
    expect(response.status).toBe(200);
    expect(order).toEqual(['csrf', 'user', 'site', 'handler']);
    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(expect.any(NextRequest), 'json');
  });

  it('checks admin after the authenticated user and supports site:false', async () => {
    const order: string[] = [];
    mocks.requireUser.mockImplementation(async () => {
      order.push('user');
      return user;
    });
    mocks.requireAdmin.mockImplementation(async () => {
      order.push('admin');
      return user;
    });
    const handler = withAdmin(
      async (_request, context) => {
        order.push('handler');
        expect(context.site).toBeNull();
        return NextResponse.json({ ok: true });
      },
      { admin: true, site: false },
    );
    await handler(request(), ctx);
    expect(order).toEqual(['user', 'admin', 'handler']);
    expect(mocks.resolveSite).not.toHaveBeenCalled();
  });

  it('passes only the selected multipart exception into the mutation check', async () => {
    const handler = withAdmin(async () => NextResponse.json({ ok: true }), {
      contentType: 'multipart',
    });
    await handler(request('POST'), ctx);
    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(expect.any(NextRequest), 'multipart');
  });

  it('stops before authentication when the mutation check rejects', async () => {
    mocks.assertSameOrigin.mockImplementation(() => {
      throw new Error('blocked');
    });
    const response = await withAdmin(async () => NextResponse.json({ ok: true }))(
      request('POST'),
      ctx,
    );
    expect(response.status).toBe(500);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it('maps callback errors through the canonical envelope', async () => {
    const response = await withAdmin(async () => {
      throw notFound('Blog');
    })(request(), ctx);
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('NOT_FOUND');
  });
});

describe('readJson', () => {
  it('returns parsed JSON and maps malformed JSON to VALIDATION_ERROR', async () => {
    const good = new NextRequest('http://localhost/api/admin/test', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });
    expect(await readJson(good)).toEqual({ a: 1 });
    const bad = new NextRequest('http://localhost/api/admin/test', {
      method: 'POST',
      body: '{not json',
    });
    await expect(readJson(bad)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});
