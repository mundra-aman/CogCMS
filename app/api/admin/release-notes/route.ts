import { NextResponse } from 'next/server';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import {
  createReleaseNote,
  listReleaseNotes,
  ReleaseNoteNotFoundError,
  ReleaseNoteValidationError,
} from '@/lib/release-notes-store';
import { notifySiteWebhook } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

function translateStoreError(error: unknown): never {
  if (error instanceof ReleaseNoteValidationError) {
    throw validationError(error.details, error.message);
  }
  if (error instanceof ReleaseNoteNotFoundError) throw notFound('Release note');
  throw error;
}

export const GET = withAdmin(async (_req, { site }) => {
  try {
    return NextResponse.json(await listReleaseNotes(site.id));
  } catch (error) {
    translateStoreError(error);
  }
});

export const POST = withAdmin(async (req, { user, site }) => {
  try {
    const note = await createReleaseNote(site.id, await readJson(req), user.id);
    if (note.status === 'publish') {
      notifySiteWebhook(site.id, {
        type: 'content.published',
        contentType: 'releaseNote',
        slug: note.slug,
        id: note.id,
      });
    }
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    translateStoreError(error);
  }
});
