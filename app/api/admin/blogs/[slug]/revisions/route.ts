import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { withAdmin } from '@/lib/http/admin-handler';
import { findBlogForSite } from '@/lib/blog-revisions/lookup';
import { serializeRevisionSummary, userNames } from '@/lib/blog-revisions/store';
import BlogRevision, { BLOG_REVISION_LIMIT } from '@/models/BlogRevision';

export const dynamic = 'force-dynamic';

/**
 * Lists a blog's earlier versions, newest first. Only summary fields are read: the
 * content of up to 50 versions could be large, and the list does not need it.
 */
export const GET = withAdmin<{ slug: string }>(async (_req, { params, site }) => {
  const { slug } = await params;
  await connectToDatabase();
  const blog = await findBlogForSite(slug, site.id);
  const revisions = await BlogRevision.find({ siteId: site.id, blogId: blog._id })
    .sort({ _id: -1 })
    .limit(BLOG_REVISION_LIMIT)
    .select(
      'savedAt savedBy replacedBy reason restoredFrom createdAt snapshot.title snapshot.slug snapshot.status',
    )
    .lean()
    .exec();
  const names = await userNames(
    revisions.flatMap((revision) => [revision.savedBy, revision.replacedBy]),
  );
  return NextResponse.json({
    items: revisions.map((revision) => serializeRevisionSummary(revision, names)),
    limit: BLOG_REVISION_LIMIT,
  });
});
