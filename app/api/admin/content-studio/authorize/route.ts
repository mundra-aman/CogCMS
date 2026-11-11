import { NextResponse } from 'next/server';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { authorizeConnection } from '@/lib/publishing/connect';
export const dynamic = 'force-dynamic';
export const POST = withAdmin(
  async (req, { user }) =>
    NextResponse.json(await authorizeConnection(await readJson(req), user), {
      headers: { 'Cache-Control': 'no-store' },
    }),
  { admin: true, site: false },
);
