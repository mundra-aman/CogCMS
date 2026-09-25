import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import type { UserRole } from '@/models/User';

export const SESSION_COOKIE = 'cms_session';

const objectIdString = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Expected a MongoDB ObjectId')
  .transform((value) => value.toLowerCase());

const sessionClaimsSchema = z
  .object({
    sub: objectIdString,
    role: z.enum(['admin', 'editor']),
    siteIds: z.array(objectIdString),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict()
  .refine((claims) => claims.exp > claims.iat, {
    message: 'Session expiry must follow issue time',
  });

export interface SessionIdentity {
  sub: string;
  role: UserRole;
  siteIds: string[];
}

export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

function signingKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function durationSeconds(remember: boolean): number {
  const env = getEnv();
  return remember ? env.CMS_SESSION_REMEMBER_DAYS * 24 * 60 * 60 : env.CMS_SESSION_HOURS * 60 * 60;
}

export function sessionCookieOptions(remember: boolean): SessionCookieOptions {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: durationSeconds(remember),
  };
}

export async function signSession(identity: SessionIdentity, remember = false): Promise<string> {
  const env = getEnv();
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: identity.role, siteIds: identity.siteIds })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.sub)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + durationSeconds(remember))
    .sign(signingKey(env.CMS_JWT_SECRET));
}

/** Returns null for every invalid, expired, malformed, or wrongly signed token. */
export async function verifySession(
  token: string | undefined,
  secret?: string,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, signingKey(secret ?? getEnv().CMS_JWT_SECRET), {
      algorithms: ['HS256'],
    });
    const parsed = sessionClaimsSchema.safeParse(verified.payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
