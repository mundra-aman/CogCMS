import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import FAQSubmission from '@/models/FAQSubmission';
import { withAdmin } from '@/lib/http/admin-handler';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async (_req, { site }) => {
  await connectToDatabase();
  const submissions = await FAQSubmission.find({ siteId: site.id })
    .sort({ createdAt: -1 })
    .exec();
  return NextResponse.json(submissions);
});
