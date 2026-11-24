import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { restoreRevision } from '@/lib/revisions/engine';

export const dynamic = 'force-dynamic';

// Restores a snapshot as an unpublished draft without publishing live as a side effect.
export const POST = withAdmin<{ id: string }>(
  async (_req, { params, site, user }) => {
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      throw validationError({ id: ['Invalid revision id'] });
    }

    const result = await restoreRevision(id, site.id, user);
    return NextResponse.json(result);
  },
  { site: true },
);
