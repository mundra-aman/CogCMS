import { z } from 'zod';
import { publicationStatusSchema, requiredTextSchema } from './common';

export const faqInputSchema = z
  .object({
    question: requiredTextSchema,
    answer: requiredTextSchema,
    category: z.string().trim().optional(),
    order: z.number().int().nonnegative().optional(),
    status: publicationStatusSchema.optional(),
  })
  .strip();

export const faqUpdateSchema = z
  .object({
    question: requiredTextSchema.optional(),
    answer: requiredTextSchema.optional(),
    category: requiredTextSchema.optional(),
    order: z.number().int().nonnegative().optional(),
    status: publicationStatusSchema.optional(),
  })
  .strip();
