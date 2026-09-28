import { Types } from 'mongoose';
import { notFound, validationError } from '@/lib/http/errors';
import Blog, { type IBlog } from '@/models/Blog';
import BlogRevision, { type IBlogRevision } from '@/models/BlogRevision';

export async function findBlogForSite(slug: string, siteId: string): Promise<IBlog> {
  const blog = await Blog.findOne({ slug, siteId }).exec();
  if (!blog) throw notFound('Blog');
  return blog;
}

/**
 * Loads a revision only if it belongs to this blog *and* this site. A revision id from
 * another post or another site is reported as not found, never returned.
 */
export async function findRevisionForBlog(
  blog: IBlog,
  siteId: string,
  revisionId: string,
): Promise<IBlogRevision> {
  if (!/^[a-f\d]{24}$/i.test(revisionId) || !Types.ObjectId.isValid(revisionId)) {
    throw validationError({ revisionId: ['Invalid revision id'] });
  }
  const revision = await BlogRevision.findOne({
    _id: revisionId,
    siteId,
    blogId: blog._id,
  }).exec();
  if (!revision) throw notFound('Revision');
  return revision;
}
