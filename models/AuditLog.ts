import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export const AUDIT_ENTITY_TYPES = ['blog', 'event', 'user', 'site', 'api_key'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'publish',
  'unpublish',
  'restore',
  'generate',
  'rotate',
  'revoke',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// Snapshot actor profile so log entries remain readable even if the user is later deleted.
export interface IAuditActor {
  id: Types.ObjectId;
  name: string;
  email: string;
  role: 'admin' | 'editor';
}

export interface IAuditLog extends Document<Types.ObjectId> {
  siteId: Types.ObjectId | null;
  actor: IAuditActor;
  entityType: AuditEntityType;
  entityId: string;
  entityTitle: string;
  action: AuditAction;
  details?: Record<string, unknown>;
  createdAt: Date;
}

const AuditActorSchema = new Schema<IAuditActor>(
  {
    id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, enum: ['admin', 'editor'], required: true },
  },
  { _id: false },
);

const AuditLogSchema = new Schema<IAuditLog>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    actor: { type: AuditActorSchema, required: true },
    entityType: {
      type: String,
      enum: AUDIT_ENTITY_TYPES,
      required: true,
      index: true,
    },
    entityId: { type: String, required: true },
    entityTitle: { type: String, required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    details: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'audit_logs',
  },
);

AuditLogSchema.index({ siteId: 1, createdAt: -1 });
AuditLogSchema.index({ siteId: 1, entityType: 1, createdAt: -1 });

const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export default AuditLog;