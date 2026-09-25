import Whitepaper from '@/models/Whitepaper';
import { paginationMeta } from '@/contracts/v1/common';
import { whitepaperListResponseSchema } from '@/contracts/v1/whitepaper';
import { serializeWhitepaperSummary } from '@/lib/api/v1/serializers';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery, parsePagination } from '@/lib/http/api-query';

export const dynamic = 'force-dynamic';

export const GET = withApiKey('content:read', async (req, { auth }) => {
  assertKnownQuery(req.nextUrl.searchParams, ['page', 'limit', 'tag']);
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const tag = req.nextUrl.searchParams.get('tag')?.trim();
  const filter = {
    ...publishedFilter(auth.siteId),
    ...(tag ? { $or: [{ tag }, { tags: tag }] } : {}),
  };
  const [papers, total] = await Promise.all([
    Whitepaper.find(filter).sort({ publishedAt: -1, _id: -1 }).skip(skip).limit(limit).exec(),
    Whitepaper.countDocuments(filter).exec(),
  ]);
  return apiJson(req, whitepaperListResponseSchema, {
    data: papers.map(serializeWhitepaperSummary),
    meta: paginationMeta(page, limit, total),
  });
});
