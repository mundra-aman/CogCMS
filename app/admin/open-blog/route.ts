import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAccess, requireUser } from '@/lib/auth/require';
import { HttpError, notFound, toErrorResponse, validationError } from '@/lib/http/errors';
import connectToDatabase from '@/lib/mongodb';
import { SITE_COOKIE, siteCookieOptions } from '@/lib/site/context';
import { slugSchema } from '@/lib/validation/common';
import Site from '@/models/Site';

export const dynamic = 'force-dynamic';

/** Authenticated, fixed-destination handoff; never edit a same-slug post on another site. */
export async function GET(req: NextRequest) {
  try {
    const siteId = req.nextUrl.searchParams.get('siteId') ?? '';
    const slug = slugSchema.safeParse(req.nextUrl.searchParams.get('slug'));
    if (!/^[a-f\d]{24}$/.test(siteId) || !slug.success)
      throw validationError(null, 'Invalid blog destination');
    let user;
    try {
      user = await requireUser(req);
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 401)) throw error;
      const login = new URL('/admin/login', req.url);
      login.searchParams.set(
        'returnTo',
        '/admin/open-blog?' + new URLSearchParams({ siteId, slug: slug.data }),
      );
      const response = NextResponse.redirect(login);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    requireSiteAccess(user, siteId);
    await connectToDatabase();
    if (!(await Site.exists({ _id: siteId, status: 'active' }))) throw notFound('Site');
    const target = new URL('/admin/dashboard/blogs/new', req.url);
    target.searchParams.set('slug', slug.data);
    const response = NextResponse.redirect(target);
    response.cookies.set(SITE_COOKIE, siteId, siteCookieOptions());
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const response = toErrorResponse(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
