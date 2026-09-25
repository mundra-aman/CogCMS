import { z } from 'zod';

export const isoDateSchema = z.string().datetime({ offset: true });

export const paginationMetaSchema = z
  .object({
    page: z.number().int().positive(),
    limit: z.number().int().positive().max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export function dataEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({ data }).strict();
}

export function listEnvelopeSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: paginationMetaSchema }).strict();
}

export function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) };
}
