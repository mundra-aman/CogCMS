import ReleaseNote from '@/models/ReleaseNote';
import { releaseNoteResponseSchema } from '@/contracts/v1/release-note';
import { serializeReleaseNote } from '@/lib/api/v1/serializers';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery } from '@/lib/http/api-query';
import { notFound } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

export const GET = withApiKey<{ slug: string }>('content:read', async (req, { auth, params }) => {
  assertKnownQuery(req.nextUrl.searchParams, []);
  const { slug } = await params;
  const note = await ReleaseNote.findOne({ ...publishedFilter(auth.siteId), slug }).exec();
  if (!note) throw notFound('Release note');
  return apiJson(req, releaseNoteResponseSchema, {
    data: { ...serializeReleaseNote(note), bodyMarkdown: note.bodyMarkdown },
  });
});
