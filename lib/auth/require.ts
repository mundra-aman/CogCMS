import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { cache } from 'react';
import connectToDatabase from '@/lib/mongodb';
import { forbidden, siteForbidden, unauthorized } from '@/lib/http/errors';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';
import User, { type IUser, type UserRole } from '@/models/User';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  siteIds: string[];
}

function toAuthenticatedUser(user: IUser): AuthenticatedUser {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    siteIds: user.siteIds.map((siteId) => siteId.toString()),
  };
}

async function sessionToken(request?: NextRequest): Promise<string | undefined> {
  if (request) return request.cookies.get(SESSION_COOKIE)?.value;
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

const loadSessionUser = cache(async (token: string): Promise<AuthenticatedUser> => {
  const claims = await verifySession(token);
  if (!claims) throw unauthorized();

  await connectToDatabase();
  const user = await User.findById(claims.sub).exec();
  if (!user || user.status !== 'active') throw unauthorized();
  return toAuthenticatedUser(user);
});

/** JWT validation is only the first gate; the database user is authoritative. */
export async function requireUser(request?: NextRequest): Promise<AuthenticatedUser> {
  const token = await sessionToken(request);
  if (!token) throw unauthorized();
  return loadSessionUser(token);
}

function isAuthenticatedUser(value: NextRequest | AuthenticatedUser): value is AuthenticatedUser {
  return 'role' in value && 'siteIds' in value && 'id' in value;
}

export async function requireAdmin(
  userOrRequest?: NextRequest | AuthenticatedUser,
): Promise<AuthenticatedUser> {
  const user =
    userOrRequest && isAuthenticatedUser(userOrRequest)
      ? userOrRequest
      : await requireUser(userOrRequest);
  if (user.role !== 'admin') throw forbidden();
  return user;
}

export function hasSiteAccess(user: AuthenticatedUser, siteId: string): boolean {
  if (user.role === 'admin' && user.siteIds.length === 0) return true;
  const canonicalSiteId = /^[a-f\d]{24}$/i.test(siteId) ? siteId.toLowerCase() : siteId;
  return user.siteIds.some((assigned) => assigned.toLowerCase() === canonicalSiteId);
}

export function requireSiteAccess(user: AuthenticatedUser, siteId: string): AuthenticatedUser {
  if (!hasSiteAccess(user, siteId)) throw siteForbidden();
  return user;
}
