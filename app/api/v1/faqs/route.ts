import FAQ from '@/models/FAQ';
import { paginationMeta } from '@/contracts/v1/common';
import { faqListResponseSchema } from '@/contracts/v1/faq';
import { serializeFaq } from '@/lib/api/v1/serializers';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery, parsePagination } from '@/lib/http/api-query';

export const dynamic = 'force-dynamic';

export const GET = withApiKey('content:read', async (req, { auth }) => {
  assertKnownQuery(req.nextUrl.searchParams, ['page', 'limit', 'category']);
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const category = req.nextUrl.searchParams.get('category')?.trim();
  const filter = { ...publishedFilter(auth.siteId), ...(category ? { category } : {}) };
  const [faqs, total] = await Promise.all([
    FAQ.find(filter).sort({ order: 1, createdAt: 1, _id: 1 }).skip(skip).limit(limit).exec(),
    FAQ.countDocuments(filter).exec(),
  ]);
  return apiJson(req, faqListResponseSchema, {
    data: faqs.map(serializeFaq),
    meta: paginationMeta(page, limit, total),
  });
});
