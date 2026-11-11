/** Content Studio's server-to-server site lookup: yes/no only, behind a shared token. */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as lookup } from '@/app/api/publishing/v1/lookup/route';
import { siteHost } from '@/lib/publishing/lookup';
import { resetEnvCache } from '@/lib/env';
import { createTestSite } from '@/tests/setup/factories';

const token = 'l'.repeat(40);
const ask = (domain: string, auth: string | null = token) =>
  lookup(
    new NextRequest(
      'http://localhost:3003/api/publishing/v1/lookup?domain=' + encodeURIComponent(domain),
      { headers: auth === null ? {} : { authorization: `Bearer ${auth}` } },
    ),
  );

beforeEach(() => {
  process.env.CMS_STUDIO_LOOKUP_TOKEN = token;
  resetEnvCache();
});
afterEach(() => {
  delete process.env.CMS_STUDIO_LOOKUP_TOKEN;
  resetEnvCache();
});

describe('siteHost', () => {
  it('ignores scheme, case, path, trailing slash and a leading www', () => {
    expect(siteHost('https://www.Anthea.in/')).toBe('anthea.in');
    expect(siteHost('http://anthea.in/blogs')).toBe('anthea.in');
    expect(siteHost('anthea.in')).toBe('anthea.in');
  });
  it('keeps a non-default port and drops a default one', () => {
    expect(siteHost('https://www.example.com:8443/')).toBe('example.com:8443');
    expect(siteHost('example.com:8443')).toBe('example.com:8443');
    expect(siteHost('https://example.com:443')).toBe('example.com');
    expect(siteHost('http://example.com:80')).toBe('example.com');
  });
  it('keeps other subdomains distinct and rejects junk', () => {
    expect(siteHost('https://blog.anthea.in')).toBe('blog.anthea.in');
    expect(siteHost('ftp://anthea.in')).toBeNull();
    expect(siteHost('')).toBeNull();
  });
});

describe('GET /api/publishing/v1/lookup', () => {
  it('says yes only for an active site with the same host', async () => {
    await createTestSite({ primaryDomain: 'https://www.lookup-yes.example' });
    await createTestSite({ primaryDomain: 'https://lookup-archived.example', status: 'archived' });
    const yes = await ask('https://lookup-yes.example/');
    expect(yes.status).toBe(200);
    expect(yes.headers.get('cache-control')).toBe('no-store');
    expect(await yes.json()).toEqual({ available: true });
    expect(await (await ask('lookup-archived.example')).json()).toEqual({ available: false });
    expect(await (await ask('https://blog.lookup-yes.example')).json()).toEqual({
      available: false,
    });
  });
  it('does not match a site on another port', async () => {
    await createTestSite({ primaryDomain: 'https://lookup-port.example:8443' });
    expect(await (await ask('lookup-port.example:8443')).json()).toEqual({ available: true });
    expect(await (await ask('lookup-port.example:9443')).json()).toEqual({ available: false });
    expect(await (await ask('https://lookup-port.example')).json()).toEqual({ available: false });
  });
  it('refuses a missing or wrong token and a bad domain', async () => {
    expect((await ask('x.example', null)).status).toBe(401);
    expect((await ask('x.example', 'w'.repeat(40))).status).toBe(401);
    expect((await ask('ftp://x.example')).status).toBe(400);
  });
  it('is off when no token is configured', async () => {
    delete process.env.CMS_STUDIO_LOOKUP_TOKEN;
    resetEnvCache();
    expect((await ask('x.example')).status).toBe(404);
  });
});
