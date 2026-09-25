import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  verifySession: vi.fn(),
  findById: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: mocks.connect }));
vi.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE: 'cms_session',
  verifySession: mocks.verifySession,
}));
vi.mock('@/models/User', () => ({ default: { findById: mocks.findById } }));

import {
  hasSiteAccess,
  requireAdmin,
  requireSiteAccess,
  requireUser,
  type AuthenticatedUser,
} from './require';

const USER_ID = '64b64c2f9a4b12d8c4567890';
const SITE_ID = '64b64c2f9a4b12d8c4567891';
const claims = { sub: USER_ID, role: 'editor', siteIds: [SITE_ID], iat: 1, exp: 2 };

function request(): NextRequest {
  return new NextRequest('http://localhost:3003/admin/dashboard', {
    headers: { cookie: 'cms_session=token' },
  });
}

function userDocument(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(USER_ID),
    email: 'editor@example.com',
    name: 'Editor',
    role: 'editor',
    siteIds: [new Types.ObjectId(SITE_ID)],
    status: 'active',
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.connect.mockResolvedValue(undefined);
  mocks.verifySession.mockResolvedValue(claims);
  mocks.findById.mockReturnValue({ exec: vi.fn(async () => userDocument()) });
});

describe('requireUser', () => {
  it('rejects invalid sessions before touching the database', async () => {
    mocks.verifySession.mockResolvedValue(null);
    await expect(requireUser(request())).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('rejects missing and disabled database users identically', async () => {
    mocks.findById.mockReturnValueOnce({ exec: vi.fn(async () => null) });
    await expect(requireUser(request())).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    mocks.findById.mockReturnValueOnce({
      exec: vi.fn(async () => userDocument({ status: 'disabled' })),
    });
    await expect(requireUser(request())).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('returns current database fields instead of trusting stale claims', async () => {
    mocks.findById.mockReturnValue({
      exec: vi.fn(async () =>
        userDocument({ role: 'admin', siteIds: [], email: 'current@example.com' }),
      ),
    });
    await expect(requireUser(request())).resolves.toEqual({
      id: USER_ID,
      email: 'current@example.com',
      name: 'Editor',
      role: 'admin',
      siteIds: [],
    });
  });
});

describe('role and site guards', () => {
  const editor: AuthenticatedUser = {
    id: USER_ID,
    email: 'editor@example.com',
    name: 'Editor',
    role: 'editor',
    siteIds: [SITE_ID],
  };

  it('rejects an editor from admin-only work', async () => {
    await expect(requireAdmin(editor)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('allows unscoped admins everywhere and scopes everyone else', () => {
    const allSitesAdmin = { ...editor, role: 'admin' as const, siteIds: [] };
    expect(hasSiteAccess(allSitesAdmin, 'another-site')).toBe(true);
    expect(hasSiteAccess(editor, SITE_ID)).toBe(true);
    expect(hasSiteAccess(editor, 'another-site')).toBe(false);
    expect(() => requireSiteAccess(editor, 'another-site')).toThrowError(
      expect.objectContaining({ status: 403, code: 'SITE_FORBIDDEN' }),
    );
  });
});
