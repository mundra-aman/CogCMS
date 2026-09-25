import { decodeJwt, SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySession } from './session';

const SECRET = 'test-secret-test-secret-test-secret-1234';
const OTHER_SECRET = 'other-secret-other-secret-other-secret-12';
const identity = {
  sub: '64b64c2f9a4b12d8c4567890',
  role: 'editor' as const,
  siteIds: ['64b64c2f9a4b12d8c4567891'],
};

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

beforeEach(() => {
  process.env.MONGODB_URI = 'mongodb://localhost:27017';
  process.env.CMS_JWT_SECRET = SECRET;
  process.env.CMS_SESSION_HOURS = '6';
  process.env.CMS_SESSION_REMEMBER_DAYS = '14';
  vi.stubEnv('NODE_ENV', 'test');
  resetEnvCache();
});

describe('sessions', () => {
  it('signs exact claims and uses configured normal and remembered durations', async () => {
    const normalToken = await signSession(identity, false);
    const rememberedToken = await signSession(identity, true);
    const normal = decodeJwt(normalToken);
    const remembered = decodeJwt(rememberedToken);
    expect(normal.exp! - normal.iat!).toBe(6 * 60 * 60);
    expect(remembered.exp! - remembered.iat!).toBe(14 * 24 * 60 * 60);
    await expect(verifySession(normalToken, SECRET)).resolves.toMatchObject(identity);
  });

  it('returns null for malformed, expired, wrong-secret, and wrong-algorithm tokens', async () => {
    await expect(verifySession('not-a-jwt', SECRET)).resolves.toBeNull();
    await expect(verifySession(await signSession(identity), OTHER_SECRET)).resolves.toBeNull();

    const expired = await new SignJWT({ role: 'editor', siteIds: identity.siteIds })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(identity.sub)
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(key(SECRET));
    await expect(verifySession(expired, SECRET)).resolves.toBeNull();

    const wrongAlgorithm = await new SignJWT({ role: 'editor', siteIds: identity.siteIds })
      .setProtectedHeader({ alg: 'HS384' })
      .setSubject(identity.sub)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key(SECRET));
    await expect(verifySession(wrongAlgorithm, SECRET)).resolves.toBeNull();
  });

  it('rejects malformed and additional claims', async () => {
    const extra = await new SignJWT({
      role: 'editor',
      siteIds: identity.siteIds,
      unexpected: true,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(identity.sub)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key(SECRET));
    await expect(verifySession(extra, SECRET)).resolves.toBeNull();

    const badId = await new SignJWT({ role: 'editor', siteIds: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('not-an-object-id')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key(SECRET));
    await expect(verifySession(badId, SECRET)).resolves.toBeNull();
  });

  it('provides root-scoped secure cookie options in production only', () => {
    expect(SESSION_COOKIE).toBe('cms_session');
    expect(sessionCookieOptions(false)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 6 * 60 * 60,
    });
    vi.stubEnv('NODE_ENV', 'production');
    resetEnvCache();
    expect(sessionCookieOptions(true).secure).toBe(true);
  });
});
