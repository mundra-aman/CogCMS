import { HttpError } from '@/lib/http/errors';
import Blog from '@/models/Blog';

export async function assertAuthorNotUsedByPublishedBlogs(
  siteId: string,
  authorId: string,
): Promise<void> {
  const publishedBlogCount = await Blog.countDocuments({
    siteId,
    authorId,
    status: 'publish',
  });
  if (publishedBlogCount > 0) {
    throw new HttpError(
      409,
      'CONFLICT',
      'Author is assigned to published blogs. Reassign or unpublish them first.',
      { publishedBlogCount },
    );
  }
}
