import { NextResponse } from 'next/server';
import { rotateApiKey, serializeApiKey } from '@/lib/auth/api-key';
import { withAdmin } from '@/lib/http/admin-handler';
import { logAudit } from '@/lib/audit/logger';

export const dynamic = 'force-dynamic';

export const POST = withAdmin<{ id: string }>(
  async (_req, { params, user }) => {
    const { id } = await params;
    const replacement = await rotateApiKey(id, user.id);
    // Audit log: record API key rotation and link to replaced key
    await logAudit({
      siteId: replacement.key.siteId,
      actor: user,
      entityType: 'api_key',
      entityId: replacement.key._id.toString(),
      entityTitle: replacement.key.name,
      action: 'rotate',
      details: {
        newPrefix: replacement.key.prefix,
        rotatedFromId: id,
      },
    });
    return NextResponse.json(
      { key: serializeApiKey(replacement.key), plaintext: replacement.plaintext },
      { status: 201 },
    );
  },
  { admin: true, site: false },
);
