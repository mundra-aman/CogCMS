import { z } from 'zod';

export const newsletterEmailSchema = z.string().trim().toLowerCase().email();

export const newsletterSubscriberInputSchema = z
  .object({
    email: newsletterEmailSchema,
    source: z.string().trim().min(1).default('footer'),
  })
  .strict();
