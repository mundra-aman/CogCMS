import { z } from 'zod';
import { dataEnvelopeSchema } from '@/contracts/v1/common';

export const siteViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    primaryDomain: z.string(),
    publicPaths: z
      .object({
        blogs: z.string(),
        whitepapers: z.string(),
        faq: z.string(),
        releaseNotes: z.string(),
      })
      .strict(),
    publisher: z.object({ name: z.string(), url: z.string(), logoUrl: z.string() }).strict(),
    mediaBaseUrl: z.string().nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const siteResponseSchema = dataEnvelopeSchema(siteViewSchema);
export type SiteView = z.infer<typeof siteViewSchema>;
