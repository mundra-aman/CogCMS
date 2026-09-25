import { afterEach, expect, it, vi } from 'vitest';
import { getClientIp, getIntakeClientIp } from './rate-limit';
afterEach(() => vi.unstubAllEnvs());
it('uses only Vercel-owned visitor identity on Vercel', () => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('NODE_ENV', 'production');
  expect(
    getClientIp(
      new Headers({
        'x-vercel-forwarded-for': '203.0.113.8',
        'x-real-ip': '1.1.1.1',
        'x-forwarded-for': '2.2.2.2',
      }),
    ),
  ).toBe('203.0.113.8');
  for (const value of ['', 'unknown', '1.1.1.1, 2.2.2.2', 'fe80::1%eth0']) {
    expect(() =>
      getClientIp(new Headers({ 'x-vercel-forwarded-for': value, 'x-real-ip': '1.1.1.1' })),
    ).toThrow();
  }
});
it('requires an explicit trusted nginx deployment off Vercel in production', () => {
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('NODE_ENV', 'production');
  expect(() => getClientIp(new Headers({ 'x-real-ip': '203.0.113.8' }))).toThrow();
  vi.stubEnv('CMS_TRUST_PROXY', 'nginx');
  expect(getClientIp(new Headers({ 'x-real-ip': '203.0.113.8' }))).toBe('203.0.113.8');
});
it('authenticated intake uses its dedicated single visitor header and rejects spoofable alternatives', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(
    getIntakeClientIp(
      new Headers({ 'x-cms-visitor-ip': '2001:0db8:0:0::1', 'x-forwarded-for': '1.1.1.1' }),
    ),
  ).toBe('2001:db8::1');
  expect(() => getIntakeClientIp(new Headers({ 'x-forwarded-for': '1.1.1.1' }))).toThrow();
  expect(() =>
    getIntakeClientIp(new Headers({ 'x-cms-visitor-ip': '1.1.1.1, 2.2.2.2' })),
  ).toThrow();
});
