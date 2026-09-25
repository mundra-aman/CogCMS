import { createHash } from 'crypto';
import connectToDatabase from '@/lib/mongodb';
import LoginAttempt from '@/models/LoginAttempt';
import { platformVisitorIp, requireVisitorIp } from './visitor-ip';
import { consumeIntakeTokens, type IntakeRateLimit } from './intake-rate-limit';
export { INTAKE_IP_CAPACITY, INTAKE_KEY_CAPACITY, type IntakeRateLimit } from './intake-rate-limit';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_ATTEMPT_LIMIT = 10;

type AttemptKind = 'email' | 'ip';

export type LoginRateLimit = { limited: false } | { limited: true; retryAfter: number };

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function opaqueAttemptKey(kind: AttemptKind, value: string): string {
  const normalized = kind === 'email' ? normalizeLoginEmail(value) : value.trim().toLowerCase();
  return `${kind}:${createHash('sha256').update(normalized).digest('hex')}`;
}

export function loginAttemptKeys(email: string, ip: string): [string, string] {
  return [opaqueAttemptKey('email', email), opaqueAttemptKey('ip', ip)];
}

export function getClientIp(requestHeaders: Pick<Headers, 'get'>): string {
  return platformVisitorIp(requestHeaders);
}

export async function checkLoginRateLimit(
  email: string,
  ip: string,
  now = new Date(),
): Promise<LoginRateLimit> {
  await connectToDatabase();
  const keys = loginAttemptKeys(email, ip);
  const attempts = await LoginAttempt.find({
    key: { $in: keys },
    lockedUntil: { $gt: now },
  }).exec();
  const latestLock = attempts.reduce<number>(
    (latest, attempt) => Math.max(latest, attempt.lockedUntil?.getTime() ?? 0),
    0,
  );
  if (latestLock <= now.getTime()) return { limited: false };
  return {
    limited: true,
    retryAfter: Math.max(1, Math.ceil((latestLock - now.getTime()) / 1000)),
  };
}

function duplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

function expiryAfter(now: Date): Date {
  return new Date(now.getTime() + LOGIN_WINDOW_MS * 2);
}

function limitedUntil(lockedUntil: Date, now: Date): LoginRateLimit {
  return {
    limited: true,
    retryAfter: Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000)),
  };
}

async function recordKeyFailure(key: string, now: Date, retries = 20): Promise<LoginRateLimit> {
  if (retries <= 0) throw new Error('Could not update login attempt counter');

  const attempt = await LoginAttempt.findOne({ key }).exec();
  if (!attempt) {
    try {
      await LoginAttempt.create({
        key,
        count: 1,
        windowStartedAt: now,
        lockedUntil: null,
        expiresAt: expiryAfter(now),
      });
      return { limited: false };
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      return recordKeyFailure(key, now, retries - 1);
    }
  }

  if (attempt.lockedUntil && attempt.lockedUntil.getTime() > now.getTime()) {
    return limitedUntil(attempt.lockedUntil, now);
  }

  const windowExpired = attempt.windowStartedAt.getTime() + LOGIN_WINDOW_MS <= now.getTime();
  const nextCount = windowExpired ? 1 : attempt.count + 1;
  const lockedUntil =
    !windowExpired && nextCount >= LOGIN_ATTEMPT_LIMIT
      ? new Date(now.getTime() + LOGIN_WINDOW_MS)
      : null;
  const result = await LoginAttempt.updateOne(
    {
      _id: attempt._id,
      count: attempt.count,
      windowStartedAt: attempt.windowStartedAt,
      lockedUntil: attempt.lockedUntil,
    },
    {
      $set: {
        count: nextCount,
        windowStartedAt: windowExpired ? now : attempt.windowStartedAt,
        lockedUntil,
        expiresAt: expiryAfter(now),
      },
    },
  ).exec();
  if (result.modifiedCount === 0) return recordKeyFailure(key, now, retries - 1);
  // The failure that reaches ten remains generic. A later request observes the lock.
  return { limited: false };
}

/** Record both opaque counters. The caller still returns a generic failure on attempt ten. */
export async function recordLoginFailure(
  email: string,
  ip: string,
  now = new Date(),
): Promise<LoginRateLimit> {
  await connectToDatabase();
  const results = await Promise.all(
    loginAttemptKeys(email, ip).map((key) => recordKeyFailure(key, now)),
  );
  const retryAfter = results.reduce(
    (latest, result) => (result.limited ? Math.max(latest, result.retryAfter) : latest),
    0,
  );
  return retryAfter > 0 ? { limited: true, retryAfter } : { limited: false };
}

export async function clearLoginAttempts(email: string, ip: string): Promise<void> {
  await connectToDatabase();
  await LoginAttempt.deleteMany({ key: { $in: loginAttemptKeys(email, ip) } }).exec();
}

export function getIntakeClientIp(requestHeaders: Pick<Headers, 'get'>): string {
  // Only call after intake:write authentication. The credential holder attests this IP.
  const value = requestHeaders.get('x-cms-visitor-ip');
  if (value !== null || process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    return requireVisitorIp(value);
  }
  return 'unknown';
}

export async function checkIntakeRateLimit(
  requestHeaders: Pick<Headers, 'get'>,
  keyId: string,
  now = Date.now(),
): Promise<IntakeRateLimit> {
  return consumeIntakeTokens(getIntakeClientIp(requestHeaders), keyId, now);
}
