import Author from '@/models/Author';
import { authorListResponseSchema } from '@/contracts/v1/author';
import { paginationMeta } from '@/contracts/v1/common';
import { serializeAuthor } from '@/lib/api/v1/serializers';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery, parsePagination } from '@/lib/http/api-query';

export const dynamic = 'force-dynamic';

export const GET = withApiKey('content:read', async (req, { auth }) => {
  assertKnownQuery(req.nextUrl.searchParams, ['page', 'limit']);
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const filter = publishedFilter(auth.siteId);
  const [authors, total] = await Promise.all([
    Author.find(filter).sort({ name: 1, slug: 1 }).skip(skip).limit(limit).exec(),
    Author.countDocuments(filter).exec(),
  ]);
  return apiJson(req, authorListResponseSchema, {
    data: authors.map(serializeAuthor),
    meta: paginationMeta(page, limit, total),
  });
});
