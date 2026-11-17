import { NextResponse } from 'next/server';
import { revokeApiKey, serializeApiKey } from '@/lib/auth/api-key';
import { withAdmin } from '@/lib/http/admin-handler';
import { logAudit } from '@/lib/audit/logger';

export const dynamic = 'force-dynamic';

export const DELETE = withAdmin<{ id: string }>(
  async (_req, { params, user }) => {
    const { id } = await params;
    const key = await revokeApiKey(id);

    // Audit log: record API key revocation
    await logAudit({
      siteId: key.siteId,
      actor: user,
      entityType: 'api_key',
      entityId: key._id.toString(),
      entityTitle: key.name,
      action: 'revoke',
      details: { prefix: key.prefix },
    });
    return NextResponse.json(serializeApiKey(key));
  },
  { admin: true, site: false },
);
