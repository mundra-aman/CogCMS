import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid site id');
const password = z
  .string()
  .min(12)
  .max(200)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'Password cannot exceed 72 UTF-8 bytes',
  });

const assignment = z
  .object({
    role: z.enum(['admin', 'editor']),
    siteIds: z.array(objectId).max(100),
  })
  .refine(({ role, siteIds }) => role === 'admin' || siteIds.length > 0, {
    message: 'Editors must be assigned to at least one site',
    path: ['siteIds'],
  });

export const createUserSchema = z
  .object({
    email: z.email().trim().toLowerCase(),
    name: z.string().trim().min(1).max(120),
    role: z.enum(['admin', 'editor']),
    siteIds: z.array(objectId).max(100).default([]),
    status: z.enum(['active', 'disabled']).default('active'),
    password,
  })
  .strict()
  .superRefine((value, ctx) => {
    const result = assignment.safeParse({ role: value.role, siteIds: value.siteIds });
    for (const issue of result.error?.issues ?? []) {
      ctx.addIssue({ ...issue, path: issue.path });
    }
    if (new Set(value.siteIds).size !== value.siteIds.length) {
      ctx.addIssue({ code: 'custom', path: ['siteIds'], message: 'Duplicate site ids are not allowed' });
    }
  });

export const updateUserSchema = z
  .object({
    email: z.email().trim().toLowerCase().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(['admin', 'editor']).optional(),
    siteIds: z.array(objectId).max(100).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    password: password.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .superRefine((value, ctx) => {
    if (value.siteIds && new Set(value.siteIds).size !== value.siteIds.length) {
      ctx.addIssue({ code: 'custom', path: ['siteIds'], message: 'Duplicate site ids are not allowed' });
    }
  });

export const userAssignmentSchema = assignment;

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: password })
  .strict()
  .refine(({ currentPassword, newPassword }) => currentPassword !== newPassword, {
    message: 'New password must be different',
    path: ['newPassword'],
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
