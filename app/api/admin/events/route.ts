import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Event from '@/models/Event';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { eventInputSchema } from '@/lib/validation/event';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { notifySiteWebhook } from '@/lib/webhook';
import { logAudit } from '@/lib/audit/logger';
import { createRevisionSnapshot, runInTransaction } from '@/lib/revisions/engine';
import type { EventRevisionSnapshot } from '@/models/Revision';
import type { IEvent } from '@/models/Event';

export const dynamic = 'force-dynamic';
export const GET = withAdmin(async (_req, { site }) => {
  await connectToDatabase();
  return NextResponse.json(
    await Event.find({ siteId: site.id }).sort({ startAt: 1, _id: 1 }).exec(),
  );
});
export const POST = withAdmin(async (req, { site, user }) => {
  const parsed = eventInputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid event');
  await connectToDatabase();

  let event!: IEvent;

  // Execute database writes and revision recording within an atomic transaction.
  await runInTransaction(async (session) => {
    const eventDoc = new Event({
      ...parsed.data,
      content: sanitizeBlogHtml(parsed.data.content),
      siteId: site.id,
      publishedAt: parsed.data.status === 'publish' ? new Date() : null,
      createdBy: user.id,
      updatedBy: user.id,
    });
    event = await eventDoc.save({ session });

    await logAudit({
      siteId: site.id,
      actor: user,
      entityType: 'event',
      entityId: event._id.toString(),
      entityTitle: event.title,
      action: event.status === 'publish' ? 'publish' : 'create',
      details: { slug: event.slug, status: event.status },
      session,
    });

    await createRevisionSnapshot({
      siteId: site.id,
      entityType: 'event',
      entityId: event._id,
      author: user,
      snapshot: event.toObject() as unknown as EventRevisionSnapshot,
      trigger: event.status === 'publish' ? 'publish' : 'create',
      summary: event.status === 'publish' ? 'Initial published event' : 'Initial draft created',
      session,
    });
  });

  // External webhook executes only after successful commit.
  if (event.status === 'publish')
    notifySiteWebhook(site.id, {
      type: 'content.published',
      contentType: 'event',
      slug: event.slug,
      id: event._id.toString(),
    });

  return NextResponse.json(event, { status: 201 });
});
