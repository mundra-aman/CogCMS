import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import Site from '@/models/Site';

export const dynamic = 'force-dynamic';

export const POST = withAdmin<{ siteId: string }>(
  async (_req, { params }) => {
    const { siteId } = await params;
    if (!/^[a-f\d]{24}$/i.test(siteId) || !Types.ObjectId.isValid(siteId)) {
      throw validationError({ siteId: ['Invalid site id'] });
    }
    await connectToDatabase();
    const site = await Site.findById(siteId).select('+webhookSecret').exec();
    if (!site) throw notFound('Site');
    const secret = randomBytes(32).toString('base64url');
    site.webhookSecret = secret;
    await site.save();
    return NextResponse.json({ secret }, { status: 201 });
  },
  { admin: true, site: false },
);
