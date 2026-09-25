import Author from '@/models/Author';
import Blog from '@/models/Blog';
import { paginationMeta } from '@/contracts/v1/common';
import { postListResponseSchema } from '@/contracts/v1/post';
import { serializeAuthor, serializePostSummary } from '@/lib/api/v1/serializers';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery, commaList, parsePagination } from '@/lib/http/api-query';
import { validationError } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

export const GET = withApiKey('content:read', async (req, { auth }) => {
  const query = req.nextUrl.searchParams;
  assertKnownQuery(query, [
    'page',
    'limit',
    'tag',
    'category',
    'featured',
    'sort',
    'fields',
    'include',
  ]);
  const { page, limit, skip } = parsePagination(query);
  const tag = query.get('tag')?.trim();
  const category = query.get('category')?.trim();
  const featured = query.get('featured');
  if (featured !== null && featured !== 'true' && featured !== 'false') {
    throw validationError({ featured }, 'Invalid query');
  }
  const sort = query.get('sort') ?? '-publishedAt';
  if (sort !== '-publishedAt' && sort !== 'publishedAt')
    throw validationError({ sort }, 'Invalid query');
  const fields = query.get('fields') ?? 'summary';
  if (fields !== 'summary' && fields !== 'slugs')
    throw validationError({ fields }, 'Invalid query');
  const includes = commaList(query.get('include'));
  if (includes.some((value) => value !== 'author'))
    throw validationError({ include: includes }, 'Invalid query');

  const filter: Record<string, unknown> = {
    ...publishedFilter(auth.siteId),
    ...(tag ? { $or: [{ tag }, { tags: tag }] } : {}),
    ...(category ? { category } : {}),
    ...(featured !== null ? { isFeatured: featured === 'true' } : {}),
  };
  const order = sort === 'publishedAt' ? 1 : -1;
  const [posts, total] = await Promise.all([
    Blog.find(filter).sort({ publishedAt: order, _id: order }).skip(skip).limit(limit).exec(),
    Blog.countDocuments(filter).exec(),
  ]);

  if (fields === 'slugs') {
    return apiJson(req, postListResponseSchema, {
      data: posts.map((post) => ({ slug: post.slug, updatedAt: post.updatedAt.toISOString() })),
      meta: paginationMeta(page, limit, total),
    });
  }

  const authorIds = includes.includes('author')
    ? [...new Set(posts.flatMap((post) => (post.authorId ? [post.authorId.toString()] : [])))]
    : [];
  const authors = authorIds.length
    ? await Author.find({ ...publishedFilter(auth.siteId), _id: { $in: authorIds } }).exec()
    : [];
  const authorById = new Map(
    authors.map((author) => [author._id.toString(), serializeAuthor(author)]),
  );
  return apiJson(req, postListResponseSchema, {
    data: posts.map((post) =>
      serializePostSummary(
        post,
        includes.includes('author')
          ? post.authorId
            ? (authorById.get(post.authorId.toString()) ?? null)
            : null
          : undefined,
      ),
    ),
    meta: paginationMeta(page, limit, total),
  });
});
