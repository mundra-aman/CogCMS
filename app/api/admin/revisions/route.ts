import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectToDatabase from '@/lib/mongodb';
import Revision, { REVISION_ENTITY_TYPES, REVISION_TRIGGERS } from '@/models/Revision';
import { withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

const positiveSafeInt = (fallback: number, label: string) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined) return fallback;
      if (!/^\d+$/.test(raw)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a positive integer` });
        return z.NEVER;
      }
      const num = Number(raw);
      if (!Number.isSafeInteger(num) || num < 1) {
        ctx.addIssue({
          code: 'custom',
          message: `${label} must be a positive integer greater than 0`,
        });
        return z.NEVER;
      }
      return num;
    });

const revisionListQuerySchema = z
  .object({
    entityType: z.enum(REVISION_ENTITY_TYPES),
    entityId: z
      .string()
      .refine((id) => Types.ObjectId.isValid(id), 'Valid entityId is required'),
    trigger: z.enum(REVISION_TRIGGERS).optional(),
    limit: positiveSafeInt(100, 'limit').transform((n) => Math.min(n, 500)),
    page: positiveSafeInt(1, 'page').refine(
      (n) => n <= 100000,
      'page must be a safe integer between 1 and 100,000',
    ),
  })
  .refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), {
    message: 'Calculated pagination offset is out of safe range',
    path: ['page'],
  });

// Omit bulky snapshot payloads from list responses; snapshots are fetched on demand by ID.
export const GET = withAdmin(
  async (req, { site }) => {
    const searchParams = req.nextUrl.searchParams;
    const parsed = revisionListQuerySchema.safeParse({
      entityType: searchParams.get('entityType') ?? undefined,
      entityId: searchParams.get('entityId') ?? undefined,
      trigger: searchParams.get('trigger') || undefined,
      limit: searchParams.get('limit') ?? undefined,
      page: searchParams.get('page') ?? undefined,
    });

    if (!parsed.success) {
      throw validationError(parsed.error.flatten(), 'Invalid revision query parameters');
    }

    const { entityType, entityId, trigger, limit, page } = parsed.data;
    const skip = (page - 1) * limit;

    await connectToDatabase();

    const query: Record<string, unknown> = {
      siteId: new Types.ObjectId(site.id),
      entityType,
      entityId: new Types.ObjectId(entityId),
    };

    if (trigger) {
      query.trigger = trigger;
    }

    const revisions = await Revision.find(
      query,
      {
        _id: 1,
        majorVersion: 1,
        minorVersion: 1,
        version: 1,
        restoredFromVersion: 1,
        trigger: 1,
        author: 1,
        summary: 1,
        createdAt: 1,
      },
    )
      .sort({ majorVersion: -1, minorVersion: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    return NextResponse.json(revisions);
  },
  { site: true },
);
