import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { withAdmin } from '@/lib/http/admin-handler';
import ActivityLog, { type ActivityAction, type ActivityEntityType } from '@/models/ActivityLog';

export const dynamic = 'force-dynamic';

const VALID_ACTIONS: Set<ActivityAction> = new Set([
  'create',
  'update',
  'delete',
  'publish',
  'unpublish',
]);

const VALID_ENTITY_TYPES: Set<ActivityEntityType> = new Set([
  'blog',
  'author',
  'faq',
  'whitepaper',
  'release_note',
]);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Escapes characters with regex syntax meaning to prevent regular expression injection.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parses and bounds the requested pagination page number.
 */
function parsePage(value: string | null): number {
  if (!value) return DEFAULT_PAGE;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_PAGE;
}

/**
 * Parses and bounds the requested pagination limit to avoid unbounded collection queries.
 */
function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * GET /api/admin/activity-logs
 *
 * Retrieves a paginated, chronologically sorted list of audit records scoped to
 * the active site. Supports optional filtering by action, entity type, and search keyword.
 *
 * Unauthorized requests (anonymous or missing site selection) are rejected by the withAdmin wrapper.
 */
export const GET = withAdmin(async (req, { site }) => {
  await connectToDatabase();

  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get('page'));
  const limit = parseLimit(url.searchParams.get('limit'));

  const rawAction = url.searchParams.get('action');
  const rawEntityType = url.searchParams.get('entityType');
  const search = (url.searchParams.get('search') ?? '').trim();

  // Strict tenant isolation: every query is scoped to the resolved active site
  const filter: Record<string, unknown> = {
    siteId: site.id,
  };

  if (rawAction && VALID_ACTIONS.has(rawAction as ActivityAction)) {
    filter.action = rawAction;
  }

  if (rawEntityType && VALID_ENTITY_TYPES.has(rawEntityType as ActivityEntityType)) {
    filter.entityType = rawEntityType;
  }

  if (search) {
    const escaped = escapeRegex(search.slice(0, 100));
    filter.$or = [
      { entityTitle: { $regex: escaped, $options: 'i' } },
      { 'actor.name': { $regex: escaped, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  // Execute count and projection concurrently to minimize request latency
  const [total, items] = await Promise.all([
    ActivityLog.countDocuments(filter),
    ActivityLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean().exec(),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return NextResponse.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  });
});
