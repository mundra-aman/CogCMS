import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import Blog from '@/models/Blog';
import BlogVersion, { recordBlogVersion } from '@/models/BlogVersion';
import { withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import { invalidateRelatedPosts } from '@/lib/blog-content/related-index';
import { notifySiteWebhook, deliveryEventType } from '@/lib/webhook';
import { assertBlogAuthorIsUsable } from '@/lib/admin/blog-author';

export const dynamic = 'force-dynamic';

type Params = { slug: string; version: string };

export const POST = withAdmin<Params>(async (_req, { params, user, site }) => {
  const { slug, version: rawVersion } = await params;
  const version = Number(rawVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw validationError({ version: ['Version must be a positive integer'] }, 'Invalid version');
  }

  await connectToDatabase();

  const blog = await Blog.findOne({ slug, siteId: site.id }).exec();
  if (!blog) throw notFound('Blog');

  const target = await BlogVersion.findOne({
    blogId: blog._id,
    siteId: site.id,
    version,
  })
    .lean()
    .exec();
  if (!target) throw notFound('Blog version');

  const conflictingBlog = await Blog.findOne({
    siteId: site.id,
    slug: target.snapshot.slug,
    _id: { $ne: blog._id },
  })
    .select({ _id: 1 })
    .lean()
    .exec();
  if (conflictingBlog) {
    throw validationError(
      { slug: ['Another blog already uses this slug'] },
      'Cannot restore this version because its slug is already in use',
    );
  }

  await assertBlogAuthorIsUsable({
    authorId: target.snapshot.authorId?.toString() ?? null,
    siteId: site.id,
    blogStatus: target.snapshot.status,
  });

  const previousStatus = blog.status;
  const previousSlug = blog.slug;

  blog.set({
    title: target.snapshot.title,
    slug: target.snapshot.slug,
    excerpt: target.snapshot.excerpt,
    content: target.snapshot.content,
    imageUrl: target.snapshot.imageUrl,
    tag: target.snapshot.tag,
    authorId: target.snapshot.authorId,
    category: target.snapshot.category,
    tags: target.snapshot.tags,
    faqs: target.snapshot.faqs,
    keyTakeaways: target.snapshot.keyTakeaways,
    relatedSlugs: target.snapshot.relatedSlugs,
    tocOverrides: target.snapshot.tocOverrides,
    status: target.snapshot.status,
    publishedAt: target.snapshot.publishedAt,
    metaTitle: target.snapshot.metaTitle,
    metaDescription: target.snapshot.metaDescription,
    keywords: target.snapshot.keywords,
    isFeatured: target.snapshot.isFeatured,
    rendered: target.snapshot.rendered,
    updatedBy: new Types.ObjectId(user.id),
  });
  await blog.save();

  await recordBlogVersion(blog, new Types.ObjectId(user.id), 'restore');
  invalidateRelatedPosts(site.id);

  const eventType = deliveryEventType(previousStatus, blog.status);
  if (eventType) {
    notifySiteWebhook(site.id, {
      type: eventType,
      contentType: 'post',
      slug: blog.slug,
      id: blog._id.toString(),
    });
  } else if (previousStatus === 'publish' && previousSlug !== blog.slug) {
    notifySiteWebhook(site.id, {
      type: 'content.updated',
      contentType: 'post',
      slug: blog.slug,
      id: blog._id.toString(),
    });
  }

  return NextResponse.json(blog);
});
