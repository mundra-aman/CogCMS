import { z } from 'zod';
import { listEnvelopeSchema } from '@/contracts/v1/common';

export const faqViewSchema = z
  .object({
    id: z.string(),
    question: z.string(),
    answer: z.string(),
    category: z.string(),
    order: z.number().int(),
  })
  .strict();
export const faqListResponseSchema = listEnvelopeSchema(faqViewSchema);
export type FaqView = z.infer<typeof faqViewSchema>;
