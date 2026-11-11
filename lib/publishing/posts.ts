import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import Blog, { type IBlog } from '@/models/Blog';
import StudioPublicationReceipt from '@/models/StudioPublicationReceipt';
import type { ISite } from '@/models/Site';
import { blogInputSchema } from '@/lib/validation/blog';
import { HttpError, validationError } from '@/lib/http/errors';
import { withApiKey, type ApiHandler } from '@/lib/http/api-handler';
import { readJson } from '@/lib/http/admin-handler';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { renderBlogSnapshot } from '@/lib/render/blog';
import { assertBlogAuthorIsUsable } from '@/lib/admin/blog-author';
import { invalidateRelatedPosts } from '@/lib/blog-content/related-index';
import { deliveryEventType, notifySiteWebhook } from '@/lib/webhook';
import { publicUrlFor } from '@/lib/site/urls';

// A Studio delivery never moves a CMS schedule; the schedule endpoint does.
const inputSchema = blogInputSchema.omit({ scheduledAt: true, scheduleTimezone: true }).extend({
  sourceId: z.string().min(1).max(200),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
  content: z.string().min(1).max(400_000),
  title: z.string().min(1).max(300),
  status: z.enum(['draft', 'publish']).default('draft'),
});

/** Private publishing responses never enter the public read cache. */
export function withPublishingKey<P = Record<string, string>>(handler: ApiHandler<P>) {
  const authenticated = withApiKey<P>('publishing:write', handler);
  return async (req: NextRequest, ctx: Parameters<typeof authenticated>[1]) => {
    const response = await authenticated(req, ctx);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
}

export function publishingPost(post: IBlog, site: ISite) {
  return {
    id: post._id.toString(),
    title: post.title,
    slug: post.slug,
    content: post.content,
    renderedHtml: post.rendered.html,
    excerpt: post.excerpt,
    imageUrl: post.imageUrl,
    authorId: post.authorId?.toString() ?? null,
    status: post.status,
    tags: post.tags,
    category: post.category,
    metaTitle: post.metaTitle ?? '',
    metaDescription: post.metaDescription ?? '',
    keywords: post.keywords ?? '',
    faqs: post.faqs,
    keyTakeaways: post.keyTakeaways,
    sourceId: post.studioSourceId ?? null,
    sourceRevision: post.studioRevision ?? null,
    editedInCms: Boolean(
      post.studioDeliveredAt && post.updatedAt.getTime() > post.studioDeliveredAt.getTime(),
    ),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    publishedAt: post.publishedAt?.toISOString() ?? null,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    scheduleTimezone: post.scheduleTimezone ?? null,
    canonicalUrl: publicUrlFor(site, 'blogs', post.slug),
  };
}

export const listPublishingPosts: ApiHandler = async (req, { auth, site }) => {
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  if (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) throw validationError(null, 'Invalid cursor');
  const rawSnapshot = url.searchParams.get('snapshotAt');
  const snapshotAt = rawSnapshot ? new Date(rawSnapshot) : new Date();
  if (!Number.isFinite(snapshotAt.getTime()) || snapshotAt.getTime() > Date.now() + 60_000)
    throw validationError(null, 'Invalid snapshot time');
  // ?scheduled=1 lists only drafts waiting for a go-live time.
  const scheduledOnly = url.searchParams.get('scheduled') === '1';
  const posts = await Blog.find({
    siteId: auth.siteId,
    ...(scheduledOnly ? { status: 'draft', scheduledAt: { $ne: null } } : {}),
    createdAt: { $lte: snapshotAt },
    ...(cursor ? { _id: { $gt: new Types.ObjectId(cursor) } } : {}),
  })
    .sort({ _id: 1 })
    .limit(101)
    .exec();
  const page = posts.slice(0, 100);
  return NextResponse.json({
    data: page.map((post) => {
      const { content: _content, renderedHtml: _html, ...summary } = publishingPost(post, site);
      return summary;
    }),
    nextCursor: posts.length > 100 ? page[99]._id.toString() : null,
    snapshotAt: snapshotAt.toISOString(),
    siteId: auth.siteId,
  });
};

export const savePublishingPost: ApiHandler = async (req, { auth, site }) => {
  const parsed = inputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid publishing payload');
  const { sourceId, revision, expectedUpdatedAt, createdAt: _ignored, ...data } = parsed.data;
  const id = new Types.ObjectId(
    createHash('sha256').update(`${auth.siteId}:${sourceId}`).digest('hex').slice(0, 24),
  );
  const receiptId = createHash('sha256')
    .update(JSON.stringify([auth.siteId, sourceId, revision]))
    .digest('hex');
  const outcome = await mongoose.connection.transaction(async (session) => {
    const current = await Blog.findOne({ _id: id, siteId: auth.siteId }).session(session).exec();
    const receipt = await StudioPublicationReceipt.findById(receiptId).session(session).exec();
    // A previously accepted revision cannot recreate a deleted copy or roll back
    // a later publication. A new reviewed intent has its own revision/receipt.
    if (current?.studioSourceId === sourceId && current.studioRevision === revision) {
      await StudioPublicationReceipt.updateOne(
        { _id: receiptId },
        { $setOnInsert: { siteId: auth.siteId, sourceId, revision } },
        { upsert: true, session },
      ).exec();
      return { post: current, current, replayed: true };
    }
    if (receipt)
      throw new HttpError(
        409,
        'CONFLICT',
        'This publication was already accepted. Sync and review before restoring or replacing it.',
      );
    if (
      current &&
      (current.studioSourceId !== sourceId ||
        !expectedUpdatedAt ||
        current.updatedAt.toISOString() !== expectedUpdatedAt)
    )
      throw new HttpError(
        409,
        'CONFLICT',
        'The CMS post changed. Sync and review it before publishing again.',
      );
    if (!current && expectedUpdatedAt)
      throw new HttpError(
        409,
        'CONFLICT',
        'The CMS post was removed. Sync and review before restoring it.',
      );
    await assertBlogAuthorIsUsable({
      authorId: data.authorId === undefined ? current?.authorId?.toString() : data.authorId,
      siteId: auth.siteId,
      blogStatus: data.status,
    });
    const content = sanitizeBlogHtml(data.content);
    const rendered = await renderBlogSnapshot(content);
    if (!rendered.wordCount) throw validationError(null, 'The article has no readable content');
    // Delivery stamps updatedAt itself so a later CMS editor save is detectable.
    const deliveredAt = new Date(Math.max(Date.now(), (current?.updatedAt.getTime() ?? 0) + 1));
    const fields = {
      ...data,
      content,
      rendered,
      studioSourceId: sourceId,
      studioRevision: revision,
      studioDeliveredAt: deliveredAt,
      ...(data.status === 'publish' ? { scheduledAt: null, scheduleTimezone: null } : {}),
      publishedAt: current?.publishedAt ?? (data.status === 'publish' ? new Date() : null),
      updatedBy: null,
    };
    let post: IBlog | null;
    if (current) {
      post = await Blog.findOneAndUpdate(
        { _id: id, siteId: auth.siteId, updatedAt: current.updatedAt },
        { $set: { ...fields, updatedAt: deliveredAt } },
        { returnDocument: 'after', runValidators: true, timestamps: false, session },
      ).exec();
      if (!post)
        throw new HttpError(
          409,
          'CONFLICT',
          'The CMS post changed during publication. Sync and retry.',
        );
    } else {
      [post] = await Blog.create(
        [
          {
            _id: id,
            siteId: auth.siteId,
            ...fields,
            createdBy: null,
            createdAt: deliveredAt,
            updatedAt: deliveredAt,
          },
        ],
        { session, timestamps: false },
      );
    }
    await StudioPublicationReceipt.create(
      [{ _id: receiptId, siteId: auth.siteId, sourceId, revision }],
      { session },
    );
    return { post, current, replayed: false };
  });
  const { post, current, replayed } = outcome;
  if (replayed) return NextResponse.json({ data: publishingPost(post, site), replayed: true });
  invalidateRelatedPosts(auth.siteId);
  const event = deliveryEventType(current?.status ?? 'draft', post.status);
  if (event)
    notifySiteWebhook(auth.siteId, {
      type: event,
      contentType: 'post',
      slug: post.slug,
      id: post._id.toString(),
    });
  if (current?.status === 'publish' && current.slug !== post.slug)
    notifySiteWebhook(auth.siteId, {
      type: 'content.deleted',
      contentType: 'post',
      slug: current.slug,
      id: post._id.toString(),
    });
  return NextResponse.json(
    { data: publishingPost(post, site), replayed: false },
    { status: current ? 200 : 201 },
  );
};
