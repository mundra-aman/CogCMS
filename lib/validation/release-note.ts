import { z } from 'zod';
import { parseDateInput } from '@/lib/release-notes-parser';
import { publicationStatusSchema, requiredSourceTextSchema, requiredTextSchema } from './common';

const versionSchema = requiredTextSchema.regex(
  /^\d+(?:\.\d+)*$/,
  'Version must contain dot-separated numbers',
);
const dateInputSchema = z
  .string()
  .refine((value) => parseDateInput(value) !== null, 'Date must be a real YYYY-MM-DD value');

export const releaseNoteInputSchema = z
  .object({
    version: versionSchema,
    date: dateInputSchema,
    bodyMarkdown: requiredSourceTextSchema,
    status: publicationStatusSchema.optional(),
  })
  .strip();

export const releaseNoteUpdateSchema = releaseNoteInputSchema.partial();
export type ReleaseNoteInput = z.infer<typeof releaseNoteInputSchema>;
export type ReleaseNoteUpdate = z.infer<typeof releaseNoteUpdateSchema>;
