import type { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import ReleaseNote, { type IReleaseNote } from '@/models/ReleaseNote';
import { parseDateInput, toDateInput } from '@/lib/release-notes-parser';
import {
  releaseNoteInputSchema,
  releaseNoteUpdateSchema,
  type ReleaseNoteInput,
  type ReleaseNoteUpdate,
} from '@/lib/validation/release-note';

type Id = string | Types.ObjectId;

export class ReleaseNoteValidationError extends Error {
  constructor(
    public readonly details: unknown,
    message = 'Invalid release note payload',
  ) {
    super(message);
    this.name = 'ReleaseNoteValidationError';
  }
}

export class ReleaseNoteNotFoundError extends Error {
  constructor() {
    super('Release note not found');
    this.name = 'ReleaseNoteNotFoundError';
  }
}

function dateFromInput(value: string): Date {
  const date = parseDateInput(value);
  if (!date) throw new ReleaseNoteValidationError({ date: value }, 'Invalid release note date');
  return date;
}

function baseSlug(version: string): string {
  return `v${version.replace(/\./g, '-')}`;
}

async function availableSlug(siteId: Id, version: string, exceptId?: Id): Promise<string> {
  const base = baseSlug(version);
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    const query: Record<string, unknown> = { siteId, slug };
    if (exceptId) query._id = { $ne: exceptId };
    if (!(await ReleaseNote.exists(query))) return slug;
  }
  throw new ReleaseNoteValidationError({ version }, 'Could not allocate a release note slug');
}

function view(note: IReleaseNote) {
  const object = note.toObject();
  return { ...object, id: note._id.toString(), dateInput: toDateInput(note.releaseDate) };
}

function parsedInput(input: unknown): ReleaseNoteInput {
  const result = releaseNoteInputSchema.safeParse(input);
  if (!result.success) throw new ReleaseNoteValidationError(result.error.flatten());
  return result.data;
}

function parsedUpdate(input: unknown): ReleaseNoteUpdate {
  const result = releaseNoteUpdateSchema.safeParse(input);
  if (!result.success) throw new ReleaseNoteValidationError(result.error.flatten());
  return result.data;
}

export async function listReleaseNotes(siteId: Id) {
  await connectToDatabase();
  const notes = await ReleaseNote.find({ siteId }).sort({ releaseDate: -1, _id: -1 }).exec();
  return notes.map(view);
}

export async function getReleaseNoteForEditing(siteId: Id, slug: string) {
  await connectToDatabase();
  const note = await ReleaseNote.findOne({ siteId, slug }).exec();
  if (!note) throw new ReleaseNoteNotFoundError();
  return view(note);
}

export async function createReleaseNote(siteId: Id, input: unknown, actorId: Id) {
  const data = parsedInput(input);
  await connectToDatabase();
  const status = data.status ?? 'publish';
  const note = await ReleaseNote.create({
    siteId,
    version: data.version,
    slug: await availableSlug(siteId, data.version),
    releaseDate: dateFromInput(data.date),
    bodyMarkdown: data.bodyMarkdown,
    status,
    publishedAt: status === 'publish' ? new Date() : null,
    createdBy: actorId,
    updatedBy: actorId,
  });
  return view(note);
}

export async function updateReleaseNote(siteId: Id, slug: string, input: unknown, actorId: Id) {
  const data = parsedUpdate(input);
  await connectToDatabase();
  const note = await ReleaseNote.findOne({ siteId, slug }).exec();
  if (!note) throw new ReleaseNoteNotFoundError();
  if (data.version !== undefined) {
    note.version = data.version;
    note.slug = await availableSlug(siteId, data.version, note._id);
  }
  if (data.date !== undefined) note.releaseDate = dateFromInput(data.date);
  if (data.bodyMarkdown !== undefined) note.bodyMarkdown = data.bodyMarkdown;
  if (data.status !== undefined) note.status = data.status;
  note.updatedBy = actorId as Types.ObjectId;
  await note.save();
  return view(note);
}

export async function deleteReleaseNote(siteId: Id, slug: string) {
  await connectToDatabase();
  const note = await ReleaseNote.findOneAndDelete({ siteId, slug }).exec();
  if (!note) throw new ReleaseNoteNotFoundError();
  return { ok: true };
}
