import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import connectToDatabase from '@/lib/mongodb';
import {
  extractReleaseNoteBody,
  normalizeReleaseNotes,
  parseReleaseNoteFile,
} from '@/lib/release-notes-parser';
import ReleaseNote from '@/models/ReleaseNote';
import Site from '@/models/Site';
import { releaseNoteInputSchema } from '@/lib/validation/release-note';

export interface ImportReleaseNotesOptions {
  siteSlug: string;
  directory: string;
}

export interface ImportReleaseNotesResult {
  files: number;
  created: number;
  updated: number;
  total: number;
}

export async function importReleaseNotes(
  options: ImportReleaseNotesOptions,
): Promise<ImportReleaseNotesResult> {
  const siteSlug = options.siteSlug.trim().toLowerCase();
  const directory = path.resolve(options.directory);
  if (!siteSlug) throw new Error('--site must name an existing site slug');

  const stat = await fs.stat(directory).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Release-note directory not found: ${directory}`);

  await connectToDatabase();
  const site = await Site.findOne({ slug: siteSlug }).exec();
  if (!site) throw new Error(`Site not found: ${siteSlug}`);

  const filenames = (await fs.readdir(directory))
    .filter((filename) => filename.trimEnd().toLowerCase().endsWith('.md'))
    .sort();
  const parsed = await Promise.all(
    filenames.map(async (filename) => {
      const content = await fs.readFile(path.join(directory, filename), 'utf8');
      return { content, note: parseReleaseNoteFile(content, filename) };
    }),
  );
  const normalized = normalizeReleaseNotes(parsed.map(({ note }) => note));
  const contentByFilename = new Map(parsed.map(({ content, note }) => [note.filename, content]));

  const prepared = normalized.map((note) => {
    const releaseDate = new Date(note.dateIso);
    const bodyMarkdown = extractReleaseNoteBody(contentByFilename.get(note.filename) ?? '');
    if (!bodyMarkdown) throw new Error(`Release note body is empty: ${note.filename}`);
    const releaseTime = releaseDate.getTime();
    const input = releaseNoteInputSchema.safeParse({
      version: note.version,
      date: note.dateIso.slice(0, 10),
      bodyMarkdown,
    });
    if (!Number.isFinite(releaseTime) || releaseTime === 0 || !input.success) {
      throw new Error(`Release note is missing a valid version or date: ${note.filename}`);
    }
    return { ...note, releaseDate, bodyMarkdown };
  });

  let created = 0;
  let updated = 0;
  for (const note of prepared) {
    const existing = await ReleaseNote.findOne({ siteId: site._id, slug: note.slug }).exec();
    if (existing) {
      existing.version = note.version;
      existing.releaseDate = note.releaseDate;
      existing.bodyMarkdown = note.bodyMarkdown;
      existing.status = 'publish';
      if (!existing.publishedAt) existing.publishedAt = note.releaseDate;
      existing.updatedBy = null;
      await existing.save();
      updated += 1;
    } else {
      await ReleaseNote.create({
        siteId: site._id,
        version: note.version,
        slug: note.slug,
        releaseDate: note.releaseDate,
        bodyMarkdown: note.bodyMarkdown,
        status: 'publish',
        publishedAt: note.releaseDate,
        createdBy: null,
        updatedBy: null,
      });
      created += 1;
    }
  }

  return {
    files: filenames.length,
    created,
    updated,
    total: await ReleaseNote.countDocuments({ siteId: site._id }),
  };
}

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const siteSlug = option(args, '--site');
  const directory = option(args, '--dir');
  if (!siteSlug || !directory) {
    throw new Error('Usage: import-release-notes --site <slug> --dir <path>');
  }
  try {
    const result = await importReleaseNotes({ siteSlug, directory });
    console.log(
      `Imported ${result.files} files: ${result.created} created, ${result.updated} updated, ${result.total} total.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
