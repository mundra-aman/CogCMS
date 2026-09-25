import { z } from 'zod';

export const faqSubmissionUpdateSchema = z
  .object({ status: z.enum(['pending', 'answered', 'dismissed']) })
  .strip();

export const publicFaqSubmissionSchema = z
  .object({
    question: z.string().trim().min(1).max(2000),
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
  })
  .strict();
