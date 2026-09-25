import { z } from 'zod';
import { dataEnvelopeSchema } from '@/contracts/v1/common';

export const faqSubmissionResultSchema = z
  .object({ id: z.string(), status: z.literal('pending') })
  .strict();
export const faqSubmissionResponseSchema = dataEnvelopeSchema(faqSubmissionResultSchema);
export const newsletterResultSchema = z
  .object({ subscribed: z.literal(true), new: z.boolean() })
  .strict();
export const newsletterResponseSchema = dataEnvelopeSchema(newsletterResultSchema);
