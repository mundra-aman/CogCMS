import { NextResponse } from 'next/server';
import { signMediaUpload } from '@/lib/aws-s3';
import { readJson, withAdmin } from '@/lib/http/admin-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const POST = withAdmin(async (req, { site, user }) => {
  const grant = await signMediaUpload(await readJson(req), {
    siteId: site.id,
    userId: user.id,
    prefix: site.mediaPrefix,
  });
  return NextResponse.json(grant, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
