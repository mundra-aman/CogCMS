import { z } from 'zod';
import { dataEnvelopeSchema, listEnvelopeSchema } from '@/contracts/v1/common';

export const authorViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    role: z.string(),
    bio: z.string(),
    avatarUrl: z.string(),
    socials: z.object({ x: z.string(), linkedin: z.string(), website: z.string() }).strict(),
  })
  .strict();
export const authorResponseSchema = dataEnvelopeSchema(authorViewSchema);
export const authorListResponseSchema = listEnvelopeSchema(authorViewSchema);
export type AuthorView = z.infer<typeof authorViewSchema>;
