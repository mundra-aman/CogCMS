import { NextResponse } from 'next/server';
import { completeMediaUpload } from '@/lib/aws-s3';
import { readJson, withAdmin } from '@/lib/http/admin-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = withAdmin(async (req, { site, user }) => {
  const result = await completeMediaUpload(await readJson(req), {
    siteId: site.id,
    userId: user.id,
    prefix: site.mediaPrefix,
  });
  return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
