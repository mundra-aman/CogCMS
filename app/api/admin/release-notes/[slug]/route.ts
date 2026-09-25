import { NextResponse } from 'next/server';
import { readJson, withAdmin } from '@/lib/http/admin-handler';
import { notFound, validationError } from '@/lib/http/errors';
import {
  deleteReleaseNote,
  getReleaseNoteForEditing,
  ReleaseNoteNotFoundError,
  ReleaseNoteValidationError,
  updateReleaseNote,
} from '@/lib/release-notes-store';
import { deliveryEventType, notifySiteWebhook } from '@/lib/webhook';

export const dynamic = 'force-dynamic';
type Params = { slug: string };

function translateStoreError(error: unknown): never {
  if (error instanceof ReleaseNoteValidationError) {
    throw validationError(error.details, error.message);
  }
  if (error instanceof ReleaseNoteNotFoundError) throw notFound('Release note');
  throw error;
}

export const GET = withAdmin<Params>(async (_req, { params, site }) => {
  try {
    const { slug } = await params;
    return NextResponse.json(await getReleaseNoteForEditing(site.id, slug));
  } catch (error) {
    translateStoreError(error);
  }
});

export const PUT = withAdmin<Params>(async (req, { params, user, site }) => {
  try {
    const { slug } = await params;
    const before = await getReleaseNoteForEditing(site.id, slug);
    const note = await updateReleaseNote(site.id, slug, await readJson(req), user.id);
    const eventType = deliveryEventType(before.status, note.status);
    if (eventType) {
      notifySiteWebhook(site.id, {
        type: eventType,
        contentType: 'releaseNote',
        slug: note.slug,
        id: note.id,
      });
    }
    return NextResponse.json(note);
  } catch (error) {
    translateStoreError(error);
  }
});

export const DELETE = withAdmin<Params>(async (_req, { params, site }) => {
  try {
    const { slug } = await params;
    const before = await getReleaseNoteForEditing(site.id, slug);
    const deleted = await deleteReleaseNote(site.id, slug);
    if (before.status === 'publish') {
      notifySiteWebhook(site.id, {
        type: 'content.deleted',
        contentType: 'releaseNote',
        slug: before.slug,
        id: before.id,
      });
    }
    return NextResponse.json(deleted);
  } catch (error) {
    translateStoreError(error);
  }
});
