import { z } from 'zod';
import { publicationStatusSchema, requiredTextSchema, slugSchema } from './common';

export const tagInputSchema = z
  .object({
    name: requiredTextSchema,
    slug: slugSchema,
    description: z.string().trim().optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color')
      .optional(),
    status: publicationStatusSchema.optional(),
  })
  .strip();

export const tagUpdateSchema = z
  .object({
    name: requiredTextSchema.optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color')
      .optional(),
    status: publicationStatusSchema.optional(),
  })
  .strip();
