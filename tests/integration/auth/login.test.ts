import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requestContext = vi.hoisted(() => ({
  clientIp: '203.0.113.10',
  cookieSet: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': requestContext.clientIp }),
  cookies: async () => ({ set: requestContext.cookieSet }),
}));

import { loginAction, logoutAction } from '@/app/admin/login/actions';
import { hashPassword } from '@/lib/auth/password';
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  LOGIN_WINDOW_MS,
  recordLoginFailure,
} from '@/lib/auth/rate-limit';
import { requireUser } from '@/lib/auth/require';
import { signSession } from '@/lib/auth/session';
import LoginAttempt from '@/models/LoginAttempt';
import User from '@/models/User';

function form(email: string, password: string, rememberMe = false): FormData {
  const data = new FormData();
  data.set('email', email);
  data.set('password', password);
  data.set('rememberMe', rememberMe ? 'true' : 'false');
  return data;
}

async function createUser(
  email: string,
  password: string,
  status: 'active' | 'disabled' = 'active',
) {
  return User.create({
    email,
    passwordHash: await hashPassword(password),
    name: 'Admin',
    role: 'admin',
    siteIds: [],
    status,
    createdBy: null,
  });
}

beforeEach(async () => {
  requestContext.clientIp = '203.0.113.10';
  requestContext.cookieSet.mockReset();
  await Promise.all([User.deleteMany({}), LoginAttempt.deleteMany({})]);
  await LoginAttempt.createIndexes();
});

describe('database-backed login', () => {
  it('returns the same generic failure for wrong, missing, disabled, and malformed identities', async () => {
    await createUser('active@example.com', 'correct-horse-battery');
    await createUser('disabled@example.com', 'correct-horse-battery', 'disabled');

    const wrong = await loginAction(form('active@example.com', 'wrong-password'));
    const missing = await loginAction(form('missing@example.com', 'wrong-password'));
    const disabled = await loginAction(form('disabled@example.com', 'correct-horse-battery'));
    const malformed = await loginAction(form('not-an-email', 'wrong-password'));
    expect(wrong).toEqual({ error: 'Invalid email or password.' });
    expect(missing).toEqual(wrong);
    expect(disabled).toEqual(wrong);
    expect(malformed).toEqual(wrong);
  });

  it('keeps attempts 1–10 generic and returns typed RATE_LIMITED on attempt 11', async () => {
    await createUser('admin@example.com', 'correct-horse-battery');
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await expect(loginAction(form('admin@example.com', 'wrong-password'))).resolves.toEqual({
        error: 'Invalid email or password.',
      });
    }

    const eleventh = await loginAction(form('admin@example.com', 'wrong-password'));
    expect(eleventh).toMatchObject({
      error: 'Too many login attempts.',
      code: 'RATE_LIMITED',
    });
    expect('retryAfter' in eleventh && eleventh.retryAfter).toBeGreaterThan(0);

    const attempts = await LoginAttempt.find({}).lean();
    expect(attempts).toHaveLength(2);
    for (const attempt of attempts) {
      expect(attempt.key).toMatch(/^(email|ip):[a-f0-9]{64}$/);
      expect(attempt.count).toBe(10);
      expect(attempt.lockedUntil).toBeInstanceOf(Date);
      expect(attempt).not.toHaveProperty('email');
      expect(attempt).not.toHaveProperty('ip');
    }
  }, 30_000);

  it('clears both opaque counters, updates lastLoginAt, and rotates root-scoped cookies', async () => {
    const user = await createUser('admin@example.com', 'correct-horse-battery');
    await loginAction(form('admin@example.com', 'wrong-password'));
    expect(await LoginAttempt.countDocuments()).toBe(2);

    const result = await loginAction(form('admin@example.com', 'correct-horse-battery', true));
    expect(result).toEqual({ success: true });
    expect(await LoginAttempt.countDocuments()).toBe(0);
    const reloaded = await User.findById(user._id).exec();
    expect(reloaded?.lastLoginAt).toBeInstanceOf(Date);

    const siteClear = requestContext.cookieSet.mock.calls.find(([name]) => name === 'cms_site');
    const sessionSet = requestContext.cookieSet.mock.calls.find(([name]) => name === 'cms_session');
    expect(siteClear?.[2]).toMatchObject({ path: '/', maxAge: 0 });
    expect(sessionSet?.[1]).toEqual(expect.any(String));
    expect(sessionSet?.[2]).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax' });

    requestContext.cookieSet.mockReset();
    await logoutAction();
    expect(requestContext.cookieSet).toHaveBeenCalledWith(
      'cms_session',
      '',
      expect.objectContaining({ path: '/', maxAge: 0 }),
    );
    expect(requestContext.cookieSet).toHaveBeenCalledWith(
      'cms_site',
      '',
      expect.objectContaining({ path: '/', maxAge: 0 }),
    );
  });

  it('rejects a user disabled after a token was issued', async () => {
    const user = await createUser('admin@example.com', 'correct-horse-battery');
    const token = await signSession({
      sub: user._id.toString(),
      role: 'admin',
      siteIds: [],
    });
    await User.updateOne({ _id: user._id }, { $set: { status: 'disabled' } });
    const request = new NextRequest('http://localhost:3003/admin/dashboard', {
      headers: { cookie: `cms_session=${token}` },
    });
    await expect(requireUser(request)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });
});

describe('login limiter counter semantics', () => {
  it('locks independently by email and IP and resets an expired window', async () => {
    const start = new Date();
    for (let index = 0; index < 10; index += 1) {
      await recordLoginFailure('shared@example.com', `203.0.113.${index}`, start);
    }
    await expect(
      checkLoginRateLimit('shared@example.com', '198.51.100.1', start),
    ).resolves.toMatchObject({ limited: true });

    await clearLoginAttempts('shared@example.com', '198.51.100.1');
    for (let index = 0; index < 10; index += 1) {
      await recordLoginFailure(`person${index}@example.com`, '198.51.100.2', start);
    }
    await expect(
      checkLoginRateLimit('new@example.com', '198.51.100.2', start),
    ).resolves.toMatchObject({ limited: true });

    const afterExpiry = new Date(start.getTime() + LOGIN_WINDOW_MS + 1);
    await recordLoginFailure('new@example.com', '198.51.100.2', afterExpiry);
    const ipKey = (await LoginAttempt.findOne({ key: /^ip:/ }).sort({ count: -1 }).exec())!;
    expect(ipKey.count).toBe(1);
    expect(ipKey.lockedUntil).toBeNull();
  });

  it('uses per-key compare-and-set updates under concurrent failures', async () => {
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => recordLoginFailure('race@example.com', '192.0.2.10', now)),
    );
    expect(results).toEqual(Array.from({ length: 10 }, () => ({ limited: false })));
    const counters = await LoginAttempt.find({}).sort({ key: 1 }).exec();
    expect(counters).toHaveLength(2);
    expect(counters.map((counter) => counter.count)).toEqual([10, 10]);
    expect(counters.every((counter) => counter.lockedUntil instanceof Date)).toBe(true);
  });
});
