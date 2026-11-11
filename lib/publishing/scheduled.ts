/**
 * Content Studio's calls for posts scheduled in the CMS editor: read one post,
 * publish it when its time comes, and move or clear its schedule.
 */
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import Blog from '@/models/Blog';
import { HttpError, notFound, validationError } from '@/lib/http/errors';
import type { ApiHandler } from '@/lib/http/api-handler';
import { readJson } from '@/lib/http/admin-handler';
import { assertBlogAuthorIsUsable } from '@/lib/admin/blog-author';
import { invalidateRelatedPosts } from '@/lib/blog-content/related-index';
import { notifySiteWebhook } from '@/lib/webhook';
import { publishingPost } from '@/lib/publishing/posts';
import { scheduleUpdate } from '@/lib/publishing/schedule';

type Params = { id: string };

function postId(raw: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(raw)) throw notFound('Post');
  return new Types.ObjectId(raw);
}

const summary = (post: Parameters<typeof publishingPost>[0], site: Parameters<typeof publishingPost>[1]) => {
  const { content: _content, renderedHtml: _html, ...rest } = publishingPost(post, site);
  return rest;
};

export const getPublishingPost: ApiHandler<Params> = async (_req, { params, auth, site }) => {
  const id = postId((await params).id);
  const post = await Blog.findOne({ _id: id, siteId: auth.siteId }).exec();
  if (!post) throw notFound('Post');
  return NextResponse.json({ data: summary(post, site) });
};

const publishSchema = z.object({
  /** The schedule Content Studio saw; a moved or cleared schedule refuses the publish. */
  scheduledAt: z.string().datetime({ offset: true }),
});

export const publishScheduledPost: ApiHandler<Params> = async (req, { params, auth, site }) => {
  const id = postId((await params).id);
  const parsed = publishSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid publish request');
  const expected = new Date(parsed.data.scheduledAt);
  const current = await Blog.findOne({ _id: id, siteId: auth.siteId }).exec();
  if (!current) throw notFound('Post');
  // A retry after a lost response finds the post already live.
  if (current.status === 'publish')
    return NextResponse.json({ data: summary(current, site), replayed: true });
  if (current.scheduledAt?.getTime() !== expected.getTime())
    throw new HttpError(
      409,
      'CONFLICT',
      'The schedule changed in the CMS. Sync before publishing.',
    );
  await assertBlogAuthorIsUsable({
    authorId: current.authorId?.toString() ?? null,
    siteId: auth.siteId,
    blogStatus: 'publish',
  });
  const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
  // A Studio post not edited in the CMS since its delivery stays "not edited": this
  // publication is Studio's own action, so the delivery marker moves with updatedAt.
  const untouched =
    current.studioDeliveredAt != null &&
    current.updatedAt.getTime() <= current.studioDeliveredAt.getTime();
  const post = await Blog.findOneAndUpdate(
    { _id: id, siteId: auth.siteId, status: 'draft', scheduledAt: expected, updatedAt: current.updatedAt },
    {
      $set: {
        status: 'publish',
        publishedAt: current.publishedAt ?? now,
        scheduledAt: null,
        scheduleTimezone: null,
        updatedBy: null,
        updatedAt: now,
        ...(untouched ? { studioDeliveredAt: now } : {}),
      },
    },
    { returnDocument: 'after', runValidators: true, timestamps: false },
  ).exec();
  if (!post)
    throw new HttpError(409, 'CONFLICT', 'The CMS post changed during publication. Sync and retry.');
  invalidateRelatedPosts(auth.siteId);
  notifySiteWebhook(auth.siteId, {
    type: 'content.published',
    contentType: 'post',
    slug: post.slug,
    id: post._id.toString(),
  });
  return NextResponse.json({ data: summary(post, site), replayed: false });
};

const scheduleSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  scheduleTimezone: z.string().max(64).nullable().optional(),
});

export const reschedulePost: ApiHandler<Params> = async (req, { params, auth, site }) => {
  const id = postId((await params).id);
  const parsed = scheduleSchema.safeParse(await readJson(req));
  if (!parsed.success) throw validationError(parsed.error.flatten(), 'Invalid schedule');
  const current = await Blog.findOne({ _id: id, siteId: auth.siteId }).exec();
  if (!current) throw notFound('Post');
  if (current.status === 'publish')
    throw new HttpError(409, 'CONFLICT', 'The post is already live in the CMS.');
  const schedule = scheduleUpdate(
    {
      scheduledAt: parsed.data.scheduledAt,
      scheduleTimezone: parsed.data.scheduleTimezone ?? current.scheduleTimezone,
    },
    'draft',
  )!;
  const post = await Blog.findOneAndUpdate(
    { _id: id, siteId: auth.siteId, status: 'draft' },
    // Keep updatedAt: a schedule move is not a content edit.
    { $set: schedule },
    { returnDocument: 'after', runValidators: true, timestamps: false },
  ).exec();
  if (!post) throw new HttpError(409, 'CONFLICT', 'The post is already live in the CMS.');
  return NextResponse.json({ data: summary(post, site) });
};
