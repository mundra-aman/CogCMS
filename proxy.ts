import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'cms_session';

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const secret = process.env.CMS_JWT_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!secret || !token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === '/admin/login';
  const isAdminPage = pathname.startsWith('/admin') && !isLogin;

  // A valid signature is insufficient to redirect away from login: the user may
  // have been disabled or deleted. The database-backed dashboard remains authority.
  if (isLogin || !isAdminPage) return NextResponse.next();
  if (await hasValidSession(request)) return NextResponse.next();
  const response = NextResponse.redirect(new URL('/admin/login', request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  // Route handlers authorize /api/admin. Matching them here makes authenticated
  // Next 16.3.4 Route Handler requests fall through to an HTML 404.
  matcher: ['/admin/:path*'],
};
