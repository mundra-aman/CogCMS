import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import AuditLog, {
  type AuditAction,
  type AuditEntityType,
} from '@/models/AuditLog';
import type { AuthenticatedUser } from '@/lib/auth/require';

// Interface defining the expected structure of the arguments passed to the logAudit function; Has no meaning outside runtime type-checking; Turns into 'trash' at runtime.
export interface LogAuditParams {
  siteId: string | Types.ObjectId;
  actor: AuthenticatedUser;
  entityType: AuditEntityType;
  entityId: string | Types.ObjectId;
  entityTitle: string;
  action: AuditAction | string;
  details?: Record<string, unknown>;
}

// Async function that runs in the background creating/ pushing the log records into DB
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    // Wait for Db connection
    await connectToDatabase();

    // Create new record using defined model
    await AuditLog.create({
      // site id to track which site the action belongs to; check type and cast to object id
      siteId:
        typeof params.siteId === 'string'
          ? new Types.ObjectId(params.siteId)
          : params.siteId,
      // actor - who performed the action; cast id to object id
      actor: {
        id: new Types.ObjectId(params.actor.id),
        name: params.actor.name,
        email: params.actor.email,
        role: params.actor.role,
      },
      // entity on which the given action was performed; check type and cast id to object id
      entityType: params.entityType,
      entityId: params.entityId.toString(),
      entityTitle: params.entityTitle,
      action: params.action,
      details: params.details ?? {},
    });
  } catch (error) {
    // Critical vs Non-Critical Path: Actions such as Saving a Blog/ creating the user etc are critical and should fail loudly; whereas logging can fail silently.
    console.error('Failed to write audit log:', error);
  }
}
