import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Tag from '@/models/Tag';
import { tagInputSchema } from '@/lib/validation/tag';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { notifySiteWebhook } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async (_req, { site }) => {
  await connectToDatabase();
  const tags = await Tag.find({ siteId: site.id }).sort({ name: 1 }).exec();
  return NextResponse.json(tags);
});

export const POST = withAdmin(async (req, { user, site }) => {
  const parsed = tagInputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid tag payload');
  const data = parsed.data;
  const status = data.status ?? 'publish';
  await connectToDatabase();
  const tag = await Tag.create({
    name: data.name,
    slug: data.slug,
    description: data.description ?? '',
    color: data.color ?? '#FF751F',
    status,
    publishedAt: status === 'publish' ? new Date() : null,
    siteId: site.id,
    createdBy: user.id,
    updatedBy: user.id,
  });
  if (tag.status === 'publish') {
    notifySiteWebhook(site.id, {
      type: 'content.published',
      contentType: 'tag',
      slug: tag.slug,
      id: tag._id.toString(),
    });
  }
  return NextResponse.json(tag, { status: 201 });
});
