import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import Revision from '@/models/Revision';
import { withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

export const GET = withAdmin<{ id: string }>(
  async (_req, { params, site }) => {
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      throw validationError({ id: ['Invalid revision id'] });
    }

    await connectToDatabase();

    const revision = await Revision.findOne({
      _id: new Types.ObjectId(id),
      siteId: new Types.ObjectId(site.id),
    }).exec();

    if (!revision) {
      throw notFound('Revision');
    }

    return NextResponse.json(revision);
  },
  { site: true },
);
