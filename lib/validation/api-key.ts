import { z } from 'zod';
import { API_KEY_SCOPES } from '@/models/ApiKey';

export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);

export const issueApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    scopes: z
      .array(apiKeyScopeSchema)
      .min(1)
      .max(API_KEY_SCOPES.length)
      .refine((scopes) => new Set(scopes).size === scopes.length, 'Scopes must be unique'),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
  })
  .strict();
