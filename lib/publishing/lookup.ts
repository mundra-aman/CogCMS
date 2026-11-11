import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getEnv } from '@/lib/env';
import connectToDatabase from '@/lib/mongodb';
import Site from '@/models/Site';

/**
 * Host of an http(s) address: lower-cased host name without a leading `www.`, plus the port
 * when it is not the scheme's default (`example.com:8443`). Null if invalid.
 */
export function siteHost(value: string): string | null {
  try {
    if (!value.trim()) return null;
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    const name = url.hostname.toLowerCase().replace(/^www\./, '');
    // URL drops a default port (443 for https, 80 for http), so only a real one remains.
    return url.port ? `${name}:${url.port}` : name;
  } catch {
    return null;
  }
}

const digest = (s: string) => createHash('sha256').update(s).digest();
function authorized(req: NextRequest, token: string) {
  const header = req.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  return given.length > 0 && timingSafeEqual(digest(given), digest(token));
}
const noStore = { 'Cache-Control': 'no-store' };

/**
 * Content Studio asks, server to server, whether a brand's website is an active site here.
 * It answers only yes or no, so the site list is never exposed. Off when no token is set.
 */
export async function lookupSite(req: NextRequest) {
  const token = getEnv().CMS_STUDIO_LOOKUP_TOKEN;
  if (!token) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore });
  if (!authorized(req, token))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const host = siteHost(req.nextUrl.searchParams.get('domain') ?? '');
  if (!host)
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400, headers: noStore });
  await connectToDatabase();
  const sites = await Site.find({ status: 'active' }, { primaryDomain: 1 }).lean().exec();
  const available = sites.some((s) => siteHost(s.primaryDomain) === host);
  return NextResponse.json({ available }, { headers: noStore });
}
