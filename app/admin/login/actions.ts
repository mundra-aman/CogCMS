'use server';

import { cookies, headers } from 'next/headers';
import { verifyPassword } from '@/lib/auth/password';
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  getClientIp,
  normalizeLoginEmail,
  recordLoginFailure,
} from '@/lib/auth/rate-limit';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/auth/session';
import { SITE_COOKIE, siteCookieOptions } from '@/lib/site/context';
import { loginSchema } from '@/lib/validation/login';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const INVALID_CREDENTIALS = 'Invalid email or password.' as const;
const RATE_LIMIT_MESSAGE = 'Too many login attempts.' as const;

export type LoginActionResult =
  | { success: true }
  | { error: typeof INVALID_CREDENTIALS }
  | { error: typeof RATE_LIMIT_MESSAGE; code: 'RATE_LIMITED'; retryAfter: number };

export async function loginAction(formData: FormData): Promise<LoginActionResult> {
  const rawEmail = String(formData.get('email') ?? '');
  const rawPassword = String(formData.get('password') ?? '');
  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: rawPassword,
    rememberMe: formData.get('rememberMe') === 'true',
  });
  const email = normalizeLoginEmail(rawEmail);
  const clientIp = getClientIp(await headers());

  await connectToDatabase();
  const limit = await checkLoginRateLimit(email, clientIp);
  if (limit.limited) {
    return {
      error: RATE_LIMIT_MESSAGE,
      code: 'RATE_LIMITED',
      retryAfter: limit.retryAfter,
    };
  }

  const user = parsed.success
    ? await User.findOne({ email: parsed.data.email }).select('+passwordHash').exec()
    : null;
  const activeHash = user?.status === 'active' ? user.passwordHash : null;
  const passwordMatches = await verifyPassword(rawPassword, activeHash);
  if (!parsed.success || !user || user.status !== 'active' || !passwordMatches) {
    const postFailureLimit = await recordLoginFailure(email, clientIp);
    if (postFailureLimit.limited) {
      return {
        error: RATE_LIMIT_MESSAGE,
        code: 'RATE_LIMITED',
        retryAfter: postFailureLimit.retryAfter,
      };
    }
    return { error: INVALID_CREDENTIALS };
  }

  const rememberMe = parsed.data.rememberMe;
  const jwt = await signSession(
    {
      sub: user._id.toString(),
      role: user.role,
      siteIds: user.siteIds.map((siteId) => siteId.toString()),
    },
    rememberMe,
  );
  const now = new Date();
  await Promise.all([
    clearLoginAttempts(email, clientIp),
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } }).exec(),
  ]);
  const cookieStore = await cookies();
  cookieStore.set(SITE_COOKIE, '', { ...siteCookieOptions(), maxAge: 0 });
  cookieStore.set(SESSION_COOKIE, jwt, sessionCookieOptions(rememberMe));
  return { success: true };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', { ...sessionCookieOptions(false), maxAge: 0 });
  cookieStore.set(SITE_COOKIE, '', { ...siteCookieOptions(), maxAge: 0 });
  return { success: true };
}
