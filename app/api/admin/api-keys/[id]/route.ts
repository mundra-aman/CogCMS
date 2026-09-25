import { NextResponse } from 'next/server';
import { revokeApiKey, serializeApiKey } from '@/lib/auth/api-key';
import { withAdmin } from '@/lib/http/admin-handler';

export const dynamic = 'force-dynamic';

export const DELETE = withAdmin<{ id: string }>(
  async (_req, { params }) => {
    const { id } = await params;
    const key = await revokeApiKey(id);
    return NextResponse.json(serializeApiKey(key));
  },
  { admin: true, site: false },
);
