import { z } from 'zod';

export const publicationStatusSchema = z.enum(['draft', 'publish']);
export const requiredTextSchema = z.string().trim().min(1);
export const optionalTextSchema = z.string().trim().optional();
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase URL-safe slug');

/** Validate a non-blank source string without altering its bytes. */
export const requiredSourceTextSchema = z
  .string()
  .refine((value) => value.trim().length > 0, 'Must not be blank');
