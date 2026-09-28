import { z } from 'zod';
import { listEnvelopeSchema } from '@/contracts/v1/common';

export const tagViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    color: z.string(),
  })
  .strict();
export const tagListResponseSchema = listEnvelopeSchema(tagViewSchema);
export type TagView = z.infer<typeof tagViewSchema>;
