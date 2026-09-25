import Author from '@/models/Author';
import { authorResponseSchema } from '@/contracts/v1/author';
import { serializeAuthor } from '@/lib/api/v1/serializers';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery } from '@/lib/http/api-query';
import { notFound } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

export const GET = withApiKey<{ slug: string }>('content:read', async (req, { auth, params }) => {
  assertKnownQuery(req.nextUrl.searchParams, []);
  const { slug } = await params;
  const author = await Author.findOne({ ...publishedFilter(auth.siteId), slug }).exec();
  if (!author) throw notFound('Author');
  return apiJson(req, authorResponseSchema, { data: serializeAuthor(author) });
});
