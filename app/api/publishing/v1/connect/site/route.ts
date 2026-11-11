import { NextResponse } from 'next/server';
import { withConnectionKey } from '@/lib/publishing/connect';
import { publishingSiteData } from '@/lib/publishing/site';
export const dynamic = 'force-dynamic';
export const GET = withConnectionKey(async (_req, { auth, site }) =>
  NextResponse.json({ data: await publishingSiteData(site, auth.siteId) }),
);
