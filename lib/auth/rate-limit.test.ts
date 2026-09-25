import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getClientIp,
  getIntakeClientIp,
  loginAttemptKeys,
  normalizeLoginEmail,
  opaqueAttemptKey,
} from './rate-limit';
afterEach(() => vi.unstubAllEnvs());

describe('login attempt identity', () => {
  it('normalises emails and emits only opaque SHA-256 keys', () => {
    expect(normalizeLoginEmail(' Admin@Example.COM ')).toBe('admin@example.com');
    const [emailKey, ipKey] = loginAttemptKeys(' Admin@Example.COM ', '203.0.113.4');
    expect(emailKey).toMatch(/^email:[a-f0-9]{64}$/);
    expect(ipKey).toMatch(/^ip:[a-f0-9]{64}$/);
    expect(`${emailKey}${ipKey}`).not.toContain('example.com');
    expect(emailKey).toBe(opaqueAttemptKey('email', 'admin@example.com'));
  });

  it('uses the proxy-overwritten X-Real-IP and ignores spoofable forwarding chains', () => {
    vi.stubEnv('CMS_TRUST_PROXY', 'nginx');
    expect(
      getClientIp(new Headers({ 'x-real-ip': '203.0.113.8', 'x-forwarded-for': '1.1.1.1' })),
    ).toBe('203.0.113.8');
    expect(() =>
      getClientIp(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })),
    ).toThrow();
    vi.stubEnv('CMS_TRUST_PROXY', '');
    expect(getClientIp(new Headers())).toBe('unknown');
  });
});

describe('intake token buckets', () => {
  it('uses only the dedicated authenticated forwarding header for intake identity', () => {
    expect(getIntakeClientIp(new Headers({ 'x-cms-visitor-ip': '203.0.113.9' }))).toBe(
      '203.0.113.9',
    );
    expect(getIntakeClientIp(new Headers())).toBe('unknown');
  });
});
