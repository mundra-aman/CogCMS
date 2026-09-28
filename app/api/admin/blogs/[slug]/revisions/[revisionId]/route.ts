import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { withAdmin } from '@/lib/http/admin-handler';
import { diffFields, diffText, htmlToText } from '@/lib/blog-revisions/diff';
import { findBlogForSite, findRevisionForBlog } from '@/lib/blog-revisions/lookup';
import { pickSnapshot, RESTORABLE_FIELDS } from '@/lib/blog-revisions/snapshot';
import { serializeRevisionSummary, userNames } from '@/lib/blog-revisions/store';

export const dynamic = 'force-dynamic';

/**
 * One version in full, plus a preview of what restoring it would change: field changes
 * and a word diff from the *current* post to this version.
 */
export const GET = withAdmin<{ slug: string; revisionId: string }>(
  async (_req, { params, site }) => {
    const { slug, revisionId } = await params;
    await connectToDatabase();
    const blog = await findBlogForSite(slug, site.id);
    const revision = await findRevisionForBlog(blog, site.id, revisionId);

    const current = pickSnapshot(blog);
    const version = pickSnapshot(revision.snapshot);
    const names = await userNames([revision.savedBy, revision.replacedBy]);
    const contentDiff =
      current.content === version.content
        ? null
        : diffText(htmlToText(current.content), htmlToText(version.content));

    return NextResponse.json({
      revision: serializeRevisionSummary(revision, names),
      snapshot: { ...version, authorId: version.authorId?.toString() ?? null },
      restoreChanges: diffFields(current, version, RESTORABLE_FIELDS),
      contentDiff,
      contentDiffTooLarge: current.content !== version.content && contentDiff === null,
    });
  },
);
