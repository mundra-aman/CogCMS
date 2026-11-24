import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Event from '@/models/Event';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { eventInputSchema } from '@/lib/validation/event';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { deliveryEventType, notifySiteWebhook } from '@/lib/webhook';
import { logAudit } from '@/lib/audit/logger';
import { createRevisionSnapshot, runInTransaction } from '@/lib/revisions/engine';
import type { EventRevisionSnapshot } from '@/models/Revision';

export const dynamic = 'force-dynamic';
type Params = { slug: string };
export const GET = withAdmin<Params>(async (_req, { site, params }) => {
  await connectToDatabase();
  const event = await Event.findOne({ siteId: site.id, slug: (await params).slug });
  if (!event) throw notFound('Event');
  return NextResponse.json(event);
});
export const PUT = withAdmin<Params>(async (req, { site, user, params }) => {
  const parsed = eventInputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid event');
  await connectToDatabase();
  const existing = await Event.findOne({ siteId: site.id, slug: (await params).slug });
  if (!existing) throw notFound('Event');
  const before = existing.status;
  const oldSlug = existing.slug;

  let event = existing;
  let eventType: ReturnType<typeof deliveryEventType> | null = null;

  // Execute database writes and revision recording within an atomic transaction.
  await runInTransaction(async (session) => {
    event.set({ ...parsed.data, content: sanitizeBlogHtml(parsed.data.content), updatedBy: user.id });
    if (event.status === 'publish' && !event.publishedAt) event.publishedAt = new Date();
    await event.save({ session });

    eventType = deliveryEventType(before, event.status);

    await logAudit({
      siteId: site.id,
      actor: user,
      entityType: 'event',
      entityId: event.id,
      entityTitle: event.title,
      action:
        before !== event.status
          ? event.status === 'publish'
            ? 'publish'
            : 'unpublish'
          : 'update',
      details: {
        slug: event.slug,
        status: event.status,
        previousStatus: before,
      },
      session,
    });

    const trigger =
      event.status === 'publish'
        ? 'publish'
        : before === 'publish' && event.status === 'draft'
          ? 'unpublish'
          : 'update';

    await createRevisionSnapshot({
      siteId: site.id,
      entityType: 'event',
      entityId: event._id,
      author: user,
      snapshot: event.toObject() as unknown as EventRevisionSnapshot,
      trigger,
      summary:
        event.status === 'publish'
          ? before === 'publish'
            ? 'Published update'
            : 'Published event'
          : before === 'publish'
            ? 'Unpublished to draft'
            : 'Updated event content',
      session,
    });
  });

  // External webhooks execute only after successful commit.
  if (before === 'publish' && oldSlug !== event.slug) {
    notifySiteWebhook(site.id, { type: 'content.unpublished', contentType: 'event', slug: oldSlug, id: event.id });
  }
  if (eventType) {
    notifySiteWebhook(site.id, { type: eventType, contentType: 'event', slug: event.slug, id: event.id });
  }

  return NextResponse.json(event);
});

export const DELETE = withAdmin<Params>(async (_req, { site, user, params }) => {
  await connectToDatabase();
  const event = await Event.findOneAndDelete({ siteId: site.id, slug: (await params).slug });
  if (!event) throw notFound('Event');
  if (event.status === 'publish')
    notifySiteWebhook(site.id, {
      type: 'content.deleted',
      contentType: 'event',
      slug: event.slug,
      id: event.id,
    });
  await logAudit({
    siteId: site.id,
    actor: user,
    entityType: 'event',
    entityId: event.id,
    entityTitle: event.title,
    action: 'delete',
    details: { slug: event.slug },
  });
  return NextResponse.json({ message: 'Deleted successfully' });
});
