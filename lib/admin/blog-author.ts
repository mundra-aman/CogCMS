import { validationError } from '@/lib/http/errors';
import type { PublicationStatus } from '@/models/Blog';
import Author from '@/models/Author';

export async function assertBlogAuthorIsUsable({
  authorId,
  siteId,
  blogStatus,
}: {
  authorId: string | null | undefined;
  siteId: string;
  blogStatus: PublicationStatus;
}): Promise<void> {
  if (!authorId) return;

  const author = await Author.findOne({ _id: authorId, siteId }).select('status').lean().exec();
  if (!author) {
    throw validationError(
      { fieldErrors: { authorId: ['Author must belong to the selected site'] } },
      'Invalid blog payload',
    );
  }
  if (blogStatus === 'publish' && author.status !== 'publish') {
    throw validationError(
      { fieldErrors: { authorId: ['Author must be published before the blog'] } },
      'Invalid blog payload',
    );
  }
}
