import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Tag from '@/models/Tag';
import { tagUpdateSchema } from '@/lib/validation/tag';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { deliveryEventType, notifySiteWebhook } from '@/lib/webhook';

export const dynamic = 'force-dynamic';
type Params = { id: string };

function validId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

function tagUpdate(raw: unknown): Record<string, unknown> {
  const parsed = tagUpdateSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid tag payload');
  return parsed.data;
}

export const GET = withAdmin<Params>(async (_req, { params, site }) => {
  const { id } = await params;
  if (!validId(id)) throw notFound('Tag');
  await connectToDatabase();
  const tag = await Tag.findOne({ _id: id, siteId: site.id }).exec();
  if (!tag) throw notFound('Tag');
  return NextResponse.json(tag);
});

export const PUT = withAdmin<Params>(async (req, { params, user, site }) => {
  const { id } = await params;
  if (!validId(id)) throw notFound('Tag');
  const update = tagUpdate(await readJson(req));
  await connectToDatabase();
  const existing = await Tag.findOne({ _id: id, siteId: site.id }).exec();
  if (!existing) throw notFound('Tag');
  update.updatedBy = user.id;
  if (update.status === 'publish' && !existing.publishedAt) update.publishedAt = new Date();
  const tag = await Tag.findOneAndUpdate(
    { _id: id, siteId: site.id },
    { $set: update },
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!tag) throw notFound('Tag');
  const eventType = deliveryEventType(existing.status, tag.status);
  if (eventType) {
    notifySiteWebhook(site.id, {
      type: eventType,
      contentType: 'tag',
      slug: tag.slug,
      id: tag._id.toString(),
    });
  }
  return NextResponse.json(tag);
});

export const DELETE = withAdmin<Params>(async (_req, { params, site }) => {
  const { id } = await params;
  if (!validId(id)) throw notFound('Tag');
  await connectToDatabase();
  const tag = await Tag.findOneAndDelete({ _id: id, siteId: site.id }).exec();
  if (!tag) throw notFound('Tag');
  if (tag.status === 'publish') {
    notifySiteWebhook(site.id, {
      type: 'content.deleted',
      contentType: 'tag',
      slug: tag.slug,
      id: tag._id.toString(),
    });
  }
  return NextResponse.json({ message: 'Deleted successfully' });
});
