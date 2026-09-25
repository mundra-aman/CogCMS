import { siteResponseSchema } from '@/contracts/v1/site';
import { serializePublicSite } from '@/lib/api/v1/serializers';
import { apiJson, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery } from '@/lib/http/api-query';

export const dynamic = 'force-dynamic';

export const GET = withApiKey('content:read', async (req, { site }) => {
  assertKnownQuery(req.nextUrl.searchParams, []);
  return apiJson(req, siteResponseSchema, { data: serializePublicSite(site) });
});
