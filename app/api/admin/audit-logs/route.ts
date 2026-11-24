import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectToDatabase from '@/lib/mongodb';
import AuditLog, { AUDIT_ENTITY_TYPES } from '@/models/AuditLog';
import { withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { paginationMeta } from '@/contracts/v1/common';

export const dynamic = 'force-dynamic';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
        ctx.addIssue({ code: 'custom', message: `${label} must be a positive safe integer` });
        return z.NEVER;
      }
      return num;
    });

const auditLogQuerySchema = z
  .object({
    page: positiveSafeInt(1, 'Page'),
    limit: positiveSafeInt(20, 'Limit').refine((n) => n <= 100, {
      message: 'Limit must be between 1 and 100',
    }),
    search: z.string().trim().max(100, 'Search query cannot exceed 100 characters').default(''),
    entityType: z.enum(['all', ...AUDIT_ENTITY_TYPES]).optional(),
  })
  .refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), {
    message: 'Pagination offset exceeds safe integer range',
    path: ['page'],
  });

export const GET = withAdmin(
  async (req, { site }) => {
    const searchParams = req.nextUrl.searchParams;
    const parsed = auditLogQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      entityType: searchParams.get('entityType') ?? undefined,
    });
    if (!parsed.success) {
      throw validationError(parsed.error.flatten().fieldErrors);
    }

    const { page, limit, search, entityType } = parsed.data;

    // Combine server-resolved site/global visibility with optional search/type filters via $and so search never overwrites tenant isolation.
    const conditions: Record<string, unknown>[] = [
      {
        $or: [{ siteId: new Types.ObjectId(site.id) }, { siteId: null }],
      },
    ];

    if (entityType && entityType !== 'all') {
      conditions.push({ entityType });
    }

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      conditions.push({
        $or: [
          { entityTitle: searchRegex },
          { 'actor.name': searchRegex },
          { 'actor.email': searchRegex },
          { action: searchRegex },
        ],
      });
    }

    const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };

    await connectToDatabase();

    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      AuditLog.countDocuments(filter).exec(),
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    return NextResponse.json({
      data: items,
      meta: paginationMeta(page, limit, total),
    });
  },
  { admin: true, site: true },
);