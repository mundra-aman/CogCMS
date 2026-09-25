import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({ find: vi.fn(), findById: vi.fn() }));
vi.mock('@/models/Site', () => ({ default: model }));

import { getAccessibleSites, getCurrentSite, resolveSite } from './context';
import type { AuthenticatedUser } from '@/lib/auth/require';

function siteDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(id),
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
    status: 'active',
    webhookSecret: 'must-never-leak',
    ...overrides,
  };
}

function query<T>(value: T) {
  const result = {
    sort: vi.fn(),
    exec: vi.fn(async () => value),
  };
  result.sort.mockReturnValue(result);
  return result;
}

const SITE_A = '64b64c2f9a4b12d8c4567891';
const SITE_B = '64b64c2f9a4b12d8c4567892';
const admin: AuthenticatedUser = {
  id: '64b64c2f9a4b12d8c4567890',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  siteIds: [],
};
const editor: AuthenticatedUser = { ...admin, role: 'editor', siteIds: [SITE_A] };

function request(options: { header?: string; cookie?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.header !== undefined) headers['x-cms-site'] = options.header;
  if (options.cookie !== undefined) headers.cookie = `cms_site=${options.cookie}`;
  return new NextRequest('http://localhost:3003/api/admin/blogs', { headers });
}

beforeEach(() => {
  model.find.mockReset();
  model.findById.mockReset();
});

describe('site context', () => {
  it('loads every active site for an unscoped admin and assigned sites for an editor', async () => {
    model.find.mockReturnValueOnce(query([siteDocument(SITE_A)]));
    await getAccessibleSites(admin);
    expect(model.find).toHaveBeenNthCalledWith(1, { status: 'active' });

    model.find.mockReturnValueOnce(query([siteDocument(SITE_A)]));
    await getAccessibleSites(editor);
    expect(model.find).toHaveBeenNthCalledWith(2, {
      status: 'active',
      _id: { $in: [SITE_A] },
    });
  });

  it('uses header before cookie and returns a secret-free structural site', async () => {
    model.findById.mockReturnValue(query(siteDocument(SITE_A)));
    const site = await resolveSite(request({ header: SITE_A, cookie: SITE_B }), editor);
    expect(model.findById).toHaveBeenCalledWith(SITE_A);
    expect(site.id).toBe(SITE_A);
    expect(site).not.toHaveProperty('webhookSecret');
  });

  it('rejects invalid IDs with 400 and inaccessible or archived sites with 403', async () => {
    await expect(resolveSite(request({ header: 'invalid' }), editor)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    model.findById.mockReturnValueOnce(query(siteDocument(SITE_B)));
    await expect(resolveSite(request({ header: SITE_B }), editor)).rejects.toMatchObject({
      status: 403,
      code: 'SITE_FORBIDDEN',
    });
    model.findById.mockReturnValueOnce(query(siteDocument(SITE_A, { status: 'archived' })));
    await expect(resolveSite(request({ header: SITE_A }), editor)).rejects.toMatchObject({
      status: 403,
      code: 'SITE_FORBIDDEN',
    });
  });

  it('falls back only to a sole accessible site', async () => {
    model.find.mockReturnValueOnce(query([siteDocument(SITE_A)]));
    await expect(resolveSite(request(), editor)).resolves.toMatchObject({ id: SITE_A });

    model.find.mockReturnValueOnce(query([siteDocument(SITE_A), siteDocument(SITE_B)]));
    await expect(resolveSite(request(), admin)).rejects.toMatchObject({
      status: 400,
      code: 'NO_SITE_SELECTED',
    });
  });

  it('returns null for no choice or a stale UI/session cookie', async () => {
    model.find.mockReturnValueOnce(query([]));
    await expect(getCurrentSite(admin, request())).resolves.toBeNull();

    model.findById.mockReturnValueOnce(query(siteDocument(SITE_B)));
    await expect(getCurrentSite(editor, request({ cookie: SITE_B }))).resolves.toBeNull();
    await expect(getCurrentSite(editor, request({ cookie: 'invalid' }))).resolves.toBeNull();
  });
});
