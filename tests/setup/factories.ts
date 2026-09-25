import { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, signSession } from '@/lib/auth/session';
import Site, { type ISite } from '@/models/Site';
import User, { type IUser, type UserRole } from '@/models/User';

export async function createTestSite(overrides: Partial<ISite> = {}): Promise<ISite> {
  const suffix = Math.random().toString(16).slice(2, 10);
  return Site.create({
    name: `Site ${suffix}`,
    slug: `site-${suffix}`,
    primaryDomain: `https://${suffix}.example.com`,
    publicPaths: {
      blogs: '/blogs',
      whitepapers: '/whitepapers',
      faq: '/faq',
      releaseNotes: '/release-notes',
    },
    publisher: { name: `Publisher ${suffix}`, url: `https://${suffix}.example.com`, logoUrl: '' },
    defaultLocale: 'en',
    mediaPrefix: `site-${suffix}`,
    status: 'active',
    createdBy: null,
    ...overrides,
  });
}

export async function createTestUser(
  options: {
    role?: UserRole;
    siteIds?: string[];
    email?: string;
    status?: 'active' | 'disabled';
    password?: string;
  } = {},
): Promise<IUser> {
  const suffix = Math.random().toString(16).slice(2, 10);
  const role = options.role ?? 'admin';
  return User.create({
    email: options.email ?? `${role}-${suffix}@example.com`,
    passwordHash: await hashPassword(options.password ?? 'correct-horse-battery'),
    name: `${role} ${suffix}`,
    role,
    siteIds: options.siteIds ?? [],
    status: options.status ?? 'active',
    createdBy: null,
  });
}

export async function authenticatedRequest(
  url: string,
  options: {
    user: IUser;
    method?: string;
    siteId?: string;
    json?: unknown;
    headers?: Record<string, string>;
  },
): Promise<NextRequest> {
  const method = options.method ?? 'GET';
  const siteIds = options.user.siteIds.map(String);
  const token = await signSession(
    { sub: options.user._id.toString(), role: options.user.role, siteIds },
    false,
  );
  const headers = new Headers();
  headers.set('cookie', `${SESSION_COOKIE}=${token}`);
  if (options.siteId) headers.set('x-cms-site', options.siteId);
  if (method !== 'GET') {
    headers.set('origin', 'http://localhost:3003');
    headers.set('content-type', 'application/json');
  }
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
  return new NextRequest(url, {
    method,
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
}
