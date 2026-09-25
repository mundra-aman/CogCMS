import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { getEnv } from '@/lib/env';
import { hasSiteAccess, type AuthenticatedUser } from '@/lib/auth/require';
import { HttpError, noSiteSelected, siteForbidden, validationError } from '@/lib/http/errors';
import Site, { type ISite, type SitePublicPaths, type SitePublisher } from '@/models/Site';

export const SITE_COOKIE = 'cms_site';

/** Safe request context: deliberately excludes webhook secrets and audit internals. */
export interface ResolvedSite {
  id: string;
  name: string;
  slug: string;
  primaryDomain: string;
  publicPaths: SitePublicPaths;
  publisher: SitePublisher;
  defaultLocale: string;
  mediaPrefix: string;
}

export interface SiteCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
}

export function siteCookieOptions(): SiteCookieOptions {
  return {
    httpOnly: true,
    secure: getEnv().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

function toResolvedSite(site: ISite): ResolvedSite {
  return {
    id: site._id.toString(),
    name: site.name,
    slug: site.slug,
    primaryDomain: site.primaryDomain,
    publicPaths: {
      blogs: site.publicPaths.blogs,
      whitepapers: site.publicPaths.whitepapers,
      faq: site.publicPaths.faq,
      releaseNotes: site.publicPaths.releaseNotes,
    },
    publisher: {
      name: site.publisher.name,
      url: site.publisher.url,
      logoUrl: site.publisher.logoUrl,
    },
    defaultLocale: site.defaultLocale,
    mediaPrefix: site.mediaPrefix,
  };
}

export async function getAccessibleSites(user: AuthenticatedUser): Promise<ResolvedSite[]> {
  const filter =
    user.role === 'admin' && user.siteIds.length === 0
      ? { status: 'active' as const }
      : { status: 'active' as const, _id: { $in: user.siteIds } };
  const sites = await Site.find(filter).sort({ name: 1, slug: 1 }).exec();
  return sites.map(toResolvedSite);
}

function validObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value) && Types.ObjectId.isValid(value);
}

async function selectedSite(
  user: AuthenticatedUser,
  selectedId: string | undefined,
  allowNoSelection: boolean,
): Promise<ResolvedSite | null> {
  if (selectedId !== undefined) {
    if (!validObjectId(selectedId)) {
      throw validationError({ siteId: selectedId }, 'Invalid site selection');
    }
    const canonicalId = new Types.ObjectId(selectedId).toString();
    const site = await Site.findById(canonicalId).exec();
    if (!site || site.status !== 'active' || !hasSiteAccess(user, site._id.toString())) {
      throw siteForbidden();
    }
    return toResolvedSite(site);
  }

  const accessible = await getAccessibleSites(user);
  if (accessible.length === 1) return accessible[0];
  if (allowNoSelection) return null;
  throw noSiteSelected();
}

/** Resolve an API request using header → cookie → sole accessible active site. */
export async function resolveSite(
  request: NextRequest,
  user: AuthenticatedUser,
): Promise<ResolvedSite> {
  const headerSite = request.headers.get('x-cms-site');
  const selection = headerSite !== null ? headerSite : request.cookies.get(SITE_COOKIE)?.value;
  const site = await selectedSite(user, selection, false);
  if (!site) throw noSiteSelected();
  return site;
}

/** Server-component counterpart. Multiple/zero accessible sites return null. */
export async function getCurrentSite(
  user: AuthenticatedUser,
  request?: NextRequest,
): Promise<ResolvedSite | null> {
  const selected = request
    ? request.cookies.get(SITE_COOKIE)?.value
    : (await cookies()).get(SITE_COOKIE)?.value;
  try {
    return await selectedSite(user, selected, true);
  } catch (error) {
    // UI/session callers recover from a stale cookie by offering a fresh choice.
    // API resolution remains strict through resolveSite above.
    if (
      error instanceof HttpError &&
      (error.code === 'SITE_FORBIDDEN' || error.code === 'VALIDATION_ERROR')
    ) {
      return null;
    }
    throw error;
  }
}
