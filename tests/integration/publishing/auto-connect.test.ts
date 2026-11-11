/** Test-first automatic-connection contract; real Mongo, CMS session and API routes. */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as approve } from '@/app/api/admin/content-studio/authorize/route';
import { POST as exchange } from '@/app/api/publishing/v1/connect/exchange/route';
import { POST as activate } from '@/app/api/publishing/v1/connect/activate/route';
import { POST as revoke } from '@/app/api/publishing/v1/connect/revoke/route';
import { GET as connectSite } from '@/app/api/publishing/v1/connect/site/route';
import { GET as publishingSite } from '@/app/api/publishing/v1/site/route';
import { safeStudioReturnPath } from '@/lib/publishing/connect-return';
import * as apiKeys from '@/lib/auth/api-key';
import { resetEnvCache } from '@/lib/env';
import ApiKey from '@/models/ApiKey';
import Site from '@/models/Site';
import User from '@/models/User';
import StudioConnectionGrant from '@/models/StudioConnectionGrant';
import { authenticatedRequest, createTestSite, createTestUser } from '@/tests/setup/factories';
const ctx = { params: Promise.resolve({}) };
const appOrigin = 'https://app.example.test';
const verifier = 'v'.repeat(43);
const parameters = {
  redirectUri: appOrigin + '/dashboard/cms/connect',
  state: '1'.repeat(64),
  codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
  brandLabel: 'Fixture brand',
};
const json = (path: string, body: unknown) =>
  new NextRequest('http://localhost:3003' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3003' },
    body: JSON.stringify(body),
  });
const keyRequest = (path: string, key: string, method = 'GET') =>
  new NextRequest('http://localhost:3003' + path, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
beforeEach(() => {
  process.env.CMS_CONTENT_STUDIO_ORIGINS = appOrigin;
  resetEnvCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CMS_CONTENT_STUDIO_ORIGINS;
  resetEnvCache();
});
async function fixture() {
  const user = await createTestUser(),
    site = await createTestSite();
  const body = { ...parameters, siteId: site._id.toString() };
  const request = () =>
    authenticatedRequest('http://localhost:3003/api/admin/content-studio/authorize', {
      user,
      method: 'POST',
      json: body,
    });
  return { user, site, body, request };
}
async function approved() {
  const f = await fixture();
  const r = await approve(await f.request(), ctx);
  expect(r.status).toBe(200);
  const data = await r.json(),
    redirect = new URL(data.redirectUrl);
  expect(redirect.origin).toBe(appOrigin);
  expect(redirect.pathname).toBe('/dashboard/cms/connect');
  expect(redirect.searchParams.get('state')).toBe(parameters.state);
  expect(JSON.stringify(data)).not.toContain('cms_');
  expect(await ApiKey.countDocuments({})).toBe(0);
  const code = redirect.searchParams.get('code')!;
  return {
    ...f,
    code,
    exchangeBody: {
      code,
      verifier,
      state: parameters.state,
      redirectUri: parameters.redirectUri,
      brandLabel: parameters.brandLabel,
    },
  };
}
describe('automatic Content Studio connection', () => {
  it('approves without exposing/creating a key, then exchanges, activates and acknowledges safely', async () => {
    const f = await approved();
    const duplicate = await approve(await f.request(), ctx);
    expect((await duplicate.json()).redirectUrl).toContain(f.code);
    expect(await StudioConnectionGrant.countDocuments({})).toBe(1);
    const r = await exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx);
    expect(r.status).toBe(200);
    const key = (await r.json()).apiKey as string;
    expect(key).toMatch(/^cms_/);
    const stored = await ApiKey.findOne({}).exec();
    expect(stored!.scopes).toEqual(['publishing:connect']);
    expect(stored!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(
      (await connectSite(keyRequest('/api/publishing/v1/connect/site', key), ctx)).status,
    ).toBe(200);
    expect((await publishingSite(keyRequest('/api/publishing/v1/site', key), ctx)).status).toBe(
      403,
    );
    expect(
      (await activate(keyRequest('/api/publishing/v1/connect/activate', key, 'POST'), ctx)).status,
    ).toBe(200);
    const active = await ApiKey.findById(stored!._id).exec();
    expect(active!.expiresAt).toBeNull();
    expect(active!.scopes).toEqual(['publishing:connect', 'publishing:write']);
    expect((await publishingSite(keyRequest('/api/publishing/v1/site', key), ctx)).status).toBe(
      200,
    );
    // A lost acknowledgement retries against the kept grant, rechecking authority.
    expect(
      (await activate(keyRequest('/api/publishing/v1/connect/activate', key, 'POST'), ctx)).status,
    ).toBe(200);
    await Site.updateOne({ _id: stored!.siteId }, { $set: { status: 'inactive' } });
    expect(
      (await revoke(keyRequest('/api/publishing/v1/connect/revoke', key, 'POST'))).status,
    ).toBe(200);
    expect((await publishingSite(keyRequest('/api/publishing/v1/site', key), ctx)).status).toBe(
      401,
    );
    expect((await ApiKey.findById(stored!._id).exec())!.revokedAt).toBeTruthy();
    mkdirSync('output/cms-publishing/auto-connect', { recursive: true });
    writeFileSync(
      'output/cms-publishing/auto-connect/protocol.json',
      JSON.stringify(
        {
          passed: true,
          browserContainsKey: false,
          approvedKeyCount: 0,
          activationScopes: active!.scopes,
          acknowledgementSurvivesGrantCleanup: true,
        },
        null,
        2,
      ),
    );
  });
  it('requires authentication, admin role and current site access', async () => {
    const f = await fixture();
    expect((await approve(json('/api/admin/content-studio/authorize', f.body), ctx)).status).toBe(
      401,
    );
    const editor = await createTestUser({ role: 'editor', siteIds: [f.site._id.toString()] });
    const editorRequest = await authenticatedRequest(
      'http://localhost:3003/api/admin/content-studio/authorize',
      { user: editor, method: 'POST', json: f.body },
    );
    expect((await approve(editorRequest, ctx)).status).toBe(403);
    const other = await createTestSite();
    const restricted = await createTestUser({ role: 'admin', siteIds: [other._id.toString()] });
    const wrongSite = await authenticatedRequest(
      'http://localhost:3003/api/admin/content-studio/authorize',
      { user: restricted, method: 'POST', json: f.body },
    );
    expect((await approve(wrongSite, ctx)).status).toBe(403);
    expect(await ApiKey.countDocuments({})).toBe(0);
  });
  it.each([
    'https://evil.example/dashboard/cms/connect',
    appOrigin + '/other',
    appOrigin + '/dashboard/cms/connect?extra=1',
  ])('rejects an unregistered callback: %s', async (redirectUri) => {
    const f = await fixture();
    const r = await authenticatedRequest(
      'http://localhost:3003/api/admin/content-studio/authorize',
      { user: f.user, method: 'POST', json: { ...f.body, redirectUri } },
    );
    expect((await approve(r, ctx)).status).toBe(400);
    expect(await StudioConnectionGrant.countDocuments({})).toBe(0);
  });
  it('fails closed without operator-approved App origins', async () => {
    process.env.CMS_CONTENT_STUDIO_ORIGINS = '';
    resetEnvCache();
    const f = await fixture();
    expect((await approve(await f.request(), ctx)).status).toBe(400);
  });
  it.each(['verifier', 'state', 'redirectUri', 'brandLabel'])(
    'binds the exchanged code to %s without burning a valid code on mismatch',
    async (field) => {
      const f = await approved();
      const wrong = {
        ...f.exchangeBody,
        [field]:
          field === 'verifier'
            ? 'x'.repeat(43)
            : field === 'state'
              ? '2'.repeat(64)
              : field === 'redirectUri'
                ? appOrigin + '/dashboard/cms/connect-other'
                : 'Another brand',
      };
      expect((await exchange(json('/api/publishing/v1/connect/exchange', wrong), ctx)).status).toBe(
        400,
      );
      expect(await ApiKey.countDocuments({})).toBe(0);
      expect(
        (await exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx)).status,
      ).toBe(200);
    },
  );
  it('uses each code once even under concurrent exchange', async () => {
    const f = await approved();
    const responses = await Promise.all([
      exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx),
      exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await ApiKey.countDocuments({})).toBe(1);
  });
  it('expires codes and refuses a changed site for the same approval request', async () => {
    const f = await approved(),
      other = await createTestSite();
    const r = await authenticatedRequest(
      'http://localhost:3003/api/admin/content-studio/authorize',
      { user: f.user, method: 'POST', json: { ...f.body, siteId: other._id.toString() } },
    );
    expect((await approve(r, ctx)).status).toBe(409);
    await StudioConnectionGrant.updateMany({}, { $set: { expiresAt: new Date(0) } });
    expect(
      (await exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx)).status,
    ).toBe(400);
  });
  it.each(['disabled-user', 'editor-user', 'lost-site', 'disabled-site'])(
    'rechecks authority after approval: %s',
    async (change) => {
      const f = await approved();
      if (change === 'disabled-user')
        await User.updateOne({ _id: f.user._id }, { $set: { status: 'disabled' } });
      if (change === 'editor-user')
        await User.updateOne({ _id: f.user._id }, { $set: { role: 'editor' } });
      if (change === 'lost-site') {
        const other = await createTestSite();
        await User.updateOne({ _id: f.user._id }, { $set: { siteIds: [other._id] } });
      }
      if (change === 'disabled-site')
        await Site.updateOne({ _id: f.site._id }, { $set: { status: 'inactive' } });
      expect(
        (await exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx)).status,
      ).toBe(403);
      expect(await ApiKey.countDocuments({})).toBe(0);
    },
  );
  it('does not activate expired or rotated temporary keys', async () => {
    const f = await approved();
    const key = (
      await (
        await exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx)
      ).json()
    ).apiKey;
    const stored = await ApiKey.findOne({}).exec();
    await ApiKey.updateOne({ _id: stored!._id }, { $set: { rotatedTo: stored!._id } });
    expect(
      (await activate(keyRequest('/api/publishing/v1/connect/activate', key, 'POST'), ctx)).status,
    ).toBe(409);
    await ApiKey.updateOne({ _id: stored!._id }, { $set: { expiresAt: new Date(0) } });
    expect(
      (await activate(keyRequest('/api/publishing/v1/connect/activate', key, 'POST'), ctx)).status,
    ).toBe(401);
  });
  it('only permits the dedicated connection-page login return path', () => {
    expect(safeStudioReturnPath('/connect/content-studio?state=abc')).toBe(
      '/connect/content-studio?state=abc',
    );
    for (const path of [
      null,
      '//evil.example',
      '/admin/users',
      'https://evil.example',
      '/connect/content-studio-other',
    ])
      expect(safeStudioReturnPath(path)).toBe('/admin/dashboard');
  });
  it('accepts a brand label the App sends with surrounding spaces', async () => {
    const f = await fixture();
    const body = { ...f.body, brandLabel: '  Spaced brand ' };
    const r = await approve(
      await authenticatedRequest('http://localhost:3003/api/admin/content-studio/authorize', {
        user: f.user,
        method: 'POST',
        json: body,
      }),
      ctx,
    );
    expect(r.status).toBe(200);
    const code = new URL((await r.json()).redirectUrl).searchParams.get('code')!;
    const exchanged = await exchange(
      json('/api/publishing/v1/connect/exchange', {
        code,
        verifier,
        state: parameters.state,
        redirectUri: parameters.redirectUri,
        brandLabel: '  Spaced brand ',
      }),
      ctx,
    );
    expect(exchanged.status).toBe(200);
  });
  it('keeps a used grant so re-approval and later activation stay guarded', async () => {
    const f = await approved();
    const key = (
      await (
        await exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx)
      ).json()
    ).apiKey;
    const grant = await StudioConnectionGrant.findOne({}).lean().exec();
    expect(grant!.expiresAt ?? null).toBeNull();
    expect(grant!.keyExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect((await approve(await f.request(), ctx)).status).toBe(409);
    expect(
      (await activate(keyRequest('/api/publishing/v1/connect/activate', key, 'POST'), ctx)).status,
    ).toBe(200);
    await User.updateOne({ _id: f.user._id }, { $set: { role: 'editor' } });
    expect(
      (await activate(keyRequest('/api/publishing/v1/connect/activate', key, 'POST'), ctx)).status,
    ).toBe(403);
    await StudioConnectionGrant.deleteMany({});
    await User.updateOne({ _id: f.user._id }, { $set: { role: 'admin' } });
    expect(
      (await activate(keyRequest('/api/publishing/v1/connect/activate', key, 'POST'), ctx)).status,
    ).toBe(400);
    expect(await ApiKey.countDocuments({})).toBe(1);
  });
  it('lets Studio retry the same code after key creation fails', async () => {
    const f = await approved();
    vi.spyOn(apiKeys, 'issueApiKey').mockRejectedValueOnce(new Error('transient Mongo error'));
    expect(
      (await exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx)).status,
    ).toBe(500);
    expect((await StudioConnectionGrant.findOne({}).exec())!.status).toBe('approved');
    expect(
      (await exchange(json('/api/publishing/v1/connect/exchange', f.exchangeBody), ctx)).status,
    ).toBe(200);
    expect(await ApiKey.countDocuments({})).toBe(1);
  });
});
