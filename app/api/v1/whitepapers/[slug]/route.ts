import Whitepaper from '@/models/Whitepaper';
import { whitepaperResponseSchema } from '@/contracts/v1/whitepaper';
import { serializeWhitepaper } from '@/lib/api/v1/serializers';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery } from '@/lib/http/api-query';
import { notFound } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

export const GET = withApiKey<{ slug: string }>('content:read', async (req, { auth, params }) => {
  assertKnownQuery(req.nextUrl.searchParams, []);
  const { slug } = await params;
  const paper = await Whitepaper.findOne({ ...publishedFilter(auth.siteId), slug }).exec();
  if (!paper) throw notFound('Whitepaper');
  return apiJson(req, whitepaperResponseSchema, { data: serializeWhitepaper(paper) });
});
