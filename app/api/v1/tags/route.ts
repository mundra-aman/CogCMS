import Tag from '@/models/Tag';
import { paginationMeta } from '@/contracts/v1/common';
import { tagListResponseSchema } from '@/contracts/v1/tag';
import { serializeTag } from '@/lib/api/v1/serializers';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery, parsePagination } from '@/lib/http/api-query';

export const dynamic = 'force-dynamic';

export const GET = withApiKey('content:read', async (req, { auth }) => {
  assertKnownQuery(req.nextUrl.searchParams, ['page', 'limit']);
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const filter = publishedFilter(auth.siteId);
  const [tags, total] = await Promise.all([
    Tag.find(filter).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).exec(),
    Tag.countDocuments(filter).exec(),
  ]);
  return apiJson(req, tagListResponseSchema, {
    data: tags.map(serializeTag),
    meta: paginationMeta(page, limit, total),
  });
});
