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
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await connectToDatabase();

    await AuditLog.create({
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
    });
  } catch (error) {
    // Audit logging is best-effort so write failures do not roll back primary mutations.
    console.error('Failed to write audit log:', error);
  }
}
