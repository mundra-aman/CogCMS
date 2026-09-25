import { z } from 'zod';

const slug = z
  .string()
  .trim()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase kebab-case');

const origin = z
  .url()
  .superRefine((value, ctx) => {
    const url = new URL(value);
    if (url.username || url.password) {
      ctx.addIssue({ code: 'custom', message: 'Origin cannot contain credentials' });
    }
  })
  .transform((value, ctx) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      ctx.addIssue({ code: 'custom', message: 'Origin must use http or https' });
      return z.NEVER;
    }
    if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
      ctx.addIssue({ code: 'custom', message: 'Origin cannot contain a path, query, or hash' });
      return z.NEVER;
    }
    return url.origin;
  });

const publicPath = z
  .string()
  .trim()
  .regex(/^\/(?!\/)(?:[^\\?#]*[^\\/?#])?$/, 'Use a safe absolute path without a trailing slash')
  .refine((value) => {
    try {
      return !decodeURIComponent(value)
        .split('/')
        .some((segment) => segment === '.' || segment === '..');
    } catch {
      return false;
    }
  }, 'Path cannot contain dot segments or invalid encoding');

const webhookUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .url()
    .superRefine((value, ctx) => {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        ctx.addIssue({ code: 'custom', message: 'Webhook URL must use http or https' });
      }
      if (url.username || url.password) {
        ctx.addIssue({ code: 'custom', message: 'Webhook URL cannot contain credentials' });
      }
    })
    .nullable(),
);

export const publicPathsSchema = z
  .object({
    blogs: publicPath.default('/blogs'),
    whitepapers: publicPath.default('/whitepapers'),
    faq: publicPath.default('/faq'),
    releaseNotes: publicPath.default('/release-notes'),
  })
  .strict();

export const publisherSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    url: origin,
    logoUrl: z.url().optional().or(z.literal('')),
  })
  .strict();

const mutableSiteFields = {
  name: z.string().trim().min(1).max(120),
  slug,
  primaryDomain: origin,
  publicPaths: publicPathsSchema.optional(),
  publisher: publisherSchema.optional(),
  defaultLocale: z.string().trim().min(2).max(16).default('en'),
  mediaPrefix: slug.optional(),
  status: z.enum(['active', 'archived']).default('active'),
  webhookUrl: webhookUrl.optional(),
} as const;

export const createSiteSchema = z.object(mutableSiteFields).strict();

export const updateSiteSchema = z
  .object({
    name: mutableSiteFields.name.optional(),
    slug: mutableSiteFields.slug.optional(),
    primaryDomain: mutableSiteFields.primaryDomain.optional(),
    publicPaths: mutableSiteFields.publicPaths,
    publisher: mutableSiteFields.publisher,
    defaultLocale: z.string().trim().min(2).max(16).optional(),
    mediaPrefix: mutableSiteFields.mediaPrefix,
    status: z.enum(['active', 'archived']).optional(),
    webhookUrl: webhookUrl.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
