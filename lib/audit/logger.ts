import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import AuditLog, {
  type AuditAction,
  type AuditEntityType,
} from '@/models/AuditLog';
import type { AuthenticatedUser } from '@/lib/auth/require';

export interface LogAuditParams {
  siteId?: string | Types.ObjectId | null;
  actor: AuthenticatedUser;
  entityType: AuditEntityType;
  entityId: string | Types.ObjectId;
  entityTitle: string;
  action: AuditAction;
  details?: Record<string, unknown>;
  session?: any;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await connectToDatabase();

    const doc = {
      siteId: params.siteId
        ? typeof params.siteId === 'string'
          ? new Types.ObjectId(params.siteId)
          : params.siteId
        : null,
      actor: {
        id: new Types.ObjectId(params.actor.id),
        name: params.actor.name,
        email: params.actor.email,
        role: params.actor.role,
      },
      entityType: params.entityType,
      entityId: params.entityId.toString(),
      entityTitle: params.entityTitle,
      action: params.action,
      details: params.details ?? {},
    };

    if (params.session) {
      await AuditLog.create([doc], { session: params.session });
    } else {
      await AuditLog.create(doc);
    }
  } catch (error) {
    // Fail closed inside transactions to preserve atomicity; otherwise log without blocking mutations.
    console.error('Failed to write audit log:', error);
    if (params.session) {
      throw error;
    }
  }
}
