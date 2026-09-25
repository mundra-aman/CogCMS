import { NextResponse } from 'next/server';
import { rotateApiKey, serializeApiKey } from '@/lib/auth/api-key';
import { withAdmin } from '@/lib/http/admin-handler';

export const dynamic = 'force-dynamic';

export const POST = withAdmin<{ id: string }>(
  async (_req, { params, user }) => {
    const { id } = await params;
    const replacement = await rotateApiKey(id, user.id);
    return NextResponse.json(
      { key: serializeApiKey(replacement.key), plaintext: replacement.plaintext },
      { status: 201 },
    );
  },
  { admin: true, site: false },
);
