import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Whitepaper from '@/models/Whitepaper';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { estimateWhitepaperReadTime, whitepaperInputSchema } from '@/lib/validation/whitepaper';
import { notifySiteWebhook } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async (_req, { site }) => {
  await connectToDatabase();
  const whitepapers = await Whitepaper.find({ siteId: site.id })
    .sort({ createdAt: -1, _id: -1 })
    .exec();
  return NextResponse.json(whitepapers);
});

export const POST = withAdmin(async (req, { user, site }) => {
  const parsed = whitepaperInputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid whitepaper payload');
  const { status = 'publish', ...data } = parsed.data;
  const readTime = data.readTime || estimateWhitepaperReadTime(data.content);
  await connectToDatabase();
  const whitepaper = await Whitepaper.create({
    ...data,
    readTime,
    status,
    publishedAt: status === 'publish' ? new Date() : null,
    siteId: site.id,
    createdBy: user.id,
    updatedBy: user.id,
  });
  if (whitepaper.status === 'publish') {
    notifySiteWebhook(site.id, {
      type: 'content.published',
      contentType: 'whitepaper',
      slug: whitepaper.slug,
      id: whitepaper._id.toString(),
    });
  }
  return NextResponse.json(whitepaper, { status: 201 });
});
