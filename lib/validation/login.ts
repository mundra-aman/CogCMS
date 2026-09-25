import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z.email().trim().toLowerCase(),
    password: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long'),
    rememberMe: z.boolean().default(false),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
