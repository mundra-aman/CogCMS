import { NextResponse } from 'next/server';
import { withPublishingKey } from '@/lib/publishing/posts';
import { publishingSiteData } from '@/lib/publishing/site';
export const dynamic = 'force-dynamic';
export const GET = withPublishingKey(async (_req, { auth, site }) =>
  NextResponse.json({ data: await publishingSiteData(site, auth.siteId) }),
);
