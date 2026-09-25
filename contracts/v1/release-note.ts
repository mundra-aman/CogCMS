import { z } from 'zod';
import { dataEnvelopeSchema, isoDateSchema, listEnvelopeSchema } from '@/contracts/v1/common';

const releaseNoteItemSchema = z
  .object({ type: z.enum(['paragraph', 'bullet', 'numbered', 'subheading']), text: z.string() })
  .strict();
const releaseNoteSectionSchema = z
  .object({ title: z.string(), items: z.array(releaseNoteItemSchema) })
  .strict();
export const releaseNoteViewSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    slug: z.string(),
    releaseDate: isoDateSchema,
    dateLabel: z.string(),
    intro: z.array(z.string()),
    sections: z.array(releaseNoteSectionSchema),
  })
  .strict();
export const releaseNoteFullSchema = releaseNoteViewSchema
  .extend({ bodyMarkdown: z.string() })
  .strict();
export const releaseNoteResponseSchema = dataEnvelopeSchema(releaseNoteFullSchema);
export const releaseNoteListResponseSchema = listEnvelopeSchema(releaseNoteViewSchema);
export type ReleaseNoteView = z.infer<typeof releaseNoteViewSchema>;
