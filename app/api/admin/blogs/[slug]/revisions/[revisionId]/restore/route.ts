import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { withAdmin } from '@/lib/http/admin-handler';
import { notFound } from '@/lib/http/errors';
import { assertBlogAuthorIsUsable } from '@/lib/admin/blog-author';
import { invalidateRelatedPosts } from '@/lib/blog-content/related-index';
import { findBlogForSite, findRevisionForBlog } from '@/lib/blog-revisions/lookup';
import { pickSnapshot, RESTORABLE_FIELDS } from '@/lib/blog-revisions/snapshot';
import { updateBlogWithRevision } from '@/lib/blog-revisions/store';
import { renderBlogSnapshot } from '@/lib/render/blog';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { notifySiteWebhook } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

/**
 * Restores an earlier version's content and metadata. The current version is kept as a
 * new revision first, so a restore can itself be undone. Slug and status stay as they
 * are now. Content goes through the same sanitizer and renderer as a normal save.
 */
export const POST = withAdmin<{ slug: string; revisionId: string }>(
  async (_req, { params, user, site }) => {
    const { slug, revisionId } = await params;
    await connectToDatabase();
    const existing = await findBlogForSite(slug, site.id);
    const revision = await findRevisionForBlog(existing, site.id, revisionId);
    const version = pickSnapshot(revision.snapshot);

    // The author saved in the old version may since have been deleted or unpublished.
    await assertBlogAuthorIsUsable({
      authorId: version.authorId?.toString() ?? null,
      siteId: site.id,
      blogStatus: existing.status,
    });

    const update: Record<string, unknown> = { updatedBy: user.id };
    for (const field of RESTORABLE_FIELDS) update[field] = version[field];
    const content = sanitizeBlogHtml(version.content);
    update.content = content;
    update.rendered = await renderBlogSnapshot(content);

    const { blog, revisionId: savedRevisionId } = await updateBlogWithRevision({
      existing,
      siteId: site.id,
      update,
      userId: user.id,
      reason: 'restore',
      restoredFrom: revision._id,
    });
    if (!blog) throw notFound('Blog');

    const changed = savedRevisionId !== null;
    if (changed) {
      invalidateRelatedPosts(site.id);
      // Status is untouched, so a published post can only have been updated.
      if (blog.status === 'publish') {
        notifySiteWebhook(site.id, {
          type: 'content.updated',
          contentType: 'post',
          slug: blog.slug,
          id: blog._id.toString(),
        });
      }
    }
    return NextResponse.json({ blog, changed });
  },
);
