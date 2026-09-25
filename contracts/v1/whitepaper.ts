import { z } from 'zod';
import { dataEnvelopeSchema, isoDateSchema, listEnvelopeSchema } from '@/contracts/v1/common';

export const contentBlockSchema = z
  .object({
    type: z.enum(['h1', 'h2', 'h3', 'paragraph', 'ul', 'ol', 'table', 'divider']),
    text: z.string().optional(),
    items: z.array(z.string()).optional(),
    headers: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())).optional(),
  })
  .strict();
export const whitepaperSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    date: z.string(),
    author: z.string(),
    authorRole: z.string(),
    readTime: z.string(),
    tags: z.array(z.string()),
    headline: z.string(),
    stat1Value: z.string(),
    stat1Label: z.string(),
    stat2Value: z.string(),
    stat2Label: z.string(),
    excerpt: z.string(),
    imageUrl: z.string(),
    tag: z.string(),
    isFeatured: z.boolean(),
    publishedAt: isoDateSchema.nullable(),
    updatedAt: isoDateSchema,
  })
  .strict();
export const whitepaperViewSchema = whitepaperSummarySchema
  .extend({
    content: z.string(),
    blocks: z.array(contentBlockSchema),
    metaTitle: z.string(),
    metaDescription: z.string(),
    keywords: z.array(z.string()),
  })
  .strict();
export const whitepaperResponseSchema = dataEnvelopeSchema(whitepaperViewSchema);
export const whitepaperListResponseSchema = listEnvelopeSchema(whitepaperSummarySchema);
export type WhitepaperView = z.infer<typeof whitepaperViewSchema>;
