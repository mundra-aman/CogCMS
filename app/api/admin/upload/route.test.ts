import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { resetEnvCache } from '@/lib/env';
import { unauthorized } from '@/lib/http/errors';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), findSite: vi.fn(), sign: vi.fn() }));
vi.mock('@/lib/auth/require', async (original) => ({
  ...(await original<typeof import('@/lib/auth/require')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/models/Site', () => ({ default: { findById: mocks.findSite } }));
vi.mock('@/lib/aws-s3', () => ({
  isS3Configured: () => true,
  trustedImageExtension: () => '.png',
  uploadFileToS3: vi.fn(),
  signMediaUpload: mocks.sign,
}));

const siteId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const otherSite = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ctx = { params: Promise.resolve({}) };
function request(body: unknown = { contentType: 'image/png', size: 123 }, headers = {}) {
  return new NextRequest('https://cms.example/api/admin/upload', {
    method: 'POST',
    headers: {
      origin: 'https://cms.example',
      'content-type': 'application/json',
      'x-cms-site': siteId,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
  vi.stubEnv('CMS_JWT_SECRET', 'x'.repeat(32));
  resetEnvCache();
  mocks.requireUser.mockResolvedValue({
    id: 'cccccccccccccccccccccccc',
    role: 'editor',
    siteIds: [siteId],
  });
  mocks.findSite.mockImplementation((id) => ({
    exec: async () => ({
      _id: id,
      status: 'active',
      mediaPrefix: 'test',
      publicPaths: {},
      publisher: {},
    }),
  }));
  mocks.sign.mockResolvedValue({
    url: 'https://storage.example/',
    fields: { key: 'staging/test' },
    ticket: 'signed-intent',
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('direct media signing authorization', () => {
  it('accepts a small JSON signing request through the real auth/site/CSRF wrapper', async () => {
    const res = await POST(request(), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toHaveProperty('ticket', 'signed-intent');
    expect(mocks.sign).toHaveBeenCalledWith(
      { contentType: 'image/png', size: 123 },
      expect.objectContaining({ siteId, userId: 'cccccccccccccccccccccccc', prefix: 'test' }),
    );
  });
  it('rejects unauthenticated signing before storage', async () => {
    mocks.requireUser.mockRejectedValue(unauthorized());
    expect((await POST(request(), ctx)).status).toBe(401);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('rejects a different site before storage', async () => {
    expect((await POST(request(undefined, { 'x-cms-site': otherSite }), ctx)).status).toBe(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('rejects cross-origin and cross-site browser signing', async () => {
    for (const headers of [
      { origin: 'https://evil.example' },
      { 'sec-fetch-site': 'cross-site' },
    ]) {
      expect((await POST(request(undefined, headers), ctx)).status).toBe(403);
    }
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('removes the multipart bypass', async () => {
    expect(
      (
        await POST(
          request(undefined, { 'content-type': 'multipart/form-data; boundary=test' }),
          ctx,
        )
      ).status,
    ).toBe(400);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
