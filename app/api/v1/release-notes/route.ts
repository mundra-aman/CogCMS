import ReleaseNote from '@/models/ReleaseNote';
import { paginationMeta } from '@/contracts/v1/common';
import { releaseNoteListResponseSchema } from '@/contracts/v1/release-note';
import { serializeReleaseNote } from '@/lib/api/v1/serializers';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery, parsePagination } from '@/lib/http/api-query';

export const dynamic = 'force-dynamic';

export const GET = withApiKey('content:read', async (req, { auth }) => {
  assertKnownQuery(req.nextUrl.searchParams, ['page', 'limit']);
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const filter = publishedFilter(auth.siteId);
  const [notes, total] = await Promise.all([
    ReleaseNote.find(filter).sort({ releaseDate: -1, _id: -1 }).skip(skip).limit(limit).exec(),
    ReleaseNote.countDocuments(filter).exec(),
  ]);
  return apiJson(req, releaseNoteListResponseSchema, {
    data: notes.map(serializeReleaseNote),
    meta: paginationMeta(page, limit, total),
  });
});
