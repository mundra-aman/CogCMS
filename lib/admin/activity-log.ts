import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import type { AuthenticatedUser } from '@/lib/auth/require';
import ActivityLog, {
  type ActivityAction,
  type ActivityEntityType,
  type IActivityLog,
} from '@/models/ActivityLog';

export type { ActivityAction, ActivityEntityType };

export interface ActivityActorInput {
  id?: string | Types.ObjectId;
  _id?: Types.ObjectId;
  name: string;
  email: string;
  role: string;
}

export interface RecordActivityOptions {
  siteId: string | Types.ObjectId;
  user: AuthenticatedUser | ActivityActorInput;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string | Types.ObjectId;
  entityTitle?: string;
  entitySlug?: string;
  metadata?: Record<string, unknown>;
  /**
   * If true, errors encountered during activity logging will be rethrown.
   * Default is false to prevent crashing a mutation that has already committed.
   */
  throwOnError?: boolean;
}

/**
 * Keys that must never be recorded in audit metadata under any circumstances.
 * Matched case-insensitively against metadata object properties.
 */
const SENSITIVE_KEY_PATTERN = /(password|secret|token|cookie|credential|auth|jwt|hash)/i;

/**
 * Strips sensitive authentication fields and caps long string properties to
 * ensure metadata stays compact and audit records remain safe.
 */
export function sanitizeActivityMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    if (typeof value === 'string') {
      // Bounded string length prevents accidentally storing huge HTML blobs or raw payloads
      sanitized[key] = value.length > 500 ? `${value.slice(0, 497)}...` : value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null ||
      value instanceof Types.ObjectId ||
      value instanceof Date
    ) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      // Filter array primitives or serialize simple lists like changed field names
      sanitized[key] = value
        .filter((item) => typeof item === 'string' || typeof item === 'number')
        .slice(0, 50);
    } else if (typeof value === 'object') {
      // Shallow recursive sanitize for one level of nesting
      sanitized[key] = sanitizeActivityMetadata(value as Record<string, unknown>);
    }
  }

  return sanitized;
}

/**
 * Determines whether a status transition constitutes a publish, unpublish,
 * or standard content update.
 */
export function resolveContentAction(
  beforeStatus: string | undefined,
  afterStatus: string | undefined,
): ActivityAction {
  if (beforeStatus === 'draft' && afterStatus === 'publish') {
    return 'publish';
  }
  if (beforeStatus === 'publish' && afterStatus === 'draft') {
    return 'unpublish';
  }
  return 'update';
}

/**
 * Central server-side mechanism for writing audit records.
 *
 * Engineering decision:
 * In this CMS, primary document operations (create, update, delete) are atomic per
 * collection without distributed two-phase commit transactions. Once a primary mutation
 * completes in MongoDB, failing to record the activity log must not surface as a 500
 * error to the user, because the client would perceive the mutation as failed and
 * potentially retry, causing duplicates or slug collisions.
 *
 * Failures are logged with full diagnostic context via console.error for observability,
 * and callers can opt into throwing when running under transactional or test harnesses.
 */
export async function recordActivity(options: RecordActivityOptions): Promise<IActivityLog | null> {
  try {
    const {
      siteId,
      user,
      action,
      entityType,
      entityId,
      entityTitle = '',
      entitySlug = '',
      metadata,
      throwOnError = false,
    } = options;

    if (!siteId) {
      throw new Error('siteId is required to record activity');
    }
    const userId =
      'id' in user && user.id
        ? user.id.toString()
        : '_id' in user && user._id
          ? user._id.toString()
          : '';
    if (!userId) {
      throw new Error('Authenticated user is required to record activity');
    }
    if (!action) {
      throw new Error('action is required to record activity');
    }
    if (!entityType) {
      throw new Error('entityType is required to record activity');
    }
    if (!entityId) {
      throw new Error('entityId is required to record activity');
    }

    await connectToDatabase();

    const canonicalSiteId = siteId instanceof Types.ObjectId ? siteId : new Types.ObjectId(siteId);
    const canonicalUserId = new Types.ObjectId(userId);
    const canonicalEntityId =
      entityId instanceof Types.ObjectId ? entityId.toString() : String(entityId);

    const safeMetadata = sanitizeActivityMetadata(metadata);

    const record = await ActivityLog.create({
      siteId: canonicalSiteId,
      actor: {
        id: canonicalUserId,
        name: user.name || 'Unknown User',
        email: user.email || 'unknown@example.com',
        role: user.role || 'editor',
      },
      action,
      entityType,
      entityId: canonicalEntityId,
      entityTitle: entityTitle.trim(),
      entitySlug: entitySlug.trim(),
      metadata: safeMetadata,
      createdAt: new Date(),
    });

    return record;
  } catch (error) {
    console.error('[cms] activity logging failed', {
      siteId: options.siteId,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      error,
    });

    if (options.throwOnError) {
      throw error;
    }

    return null;
  }
}
