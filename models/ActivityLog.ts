import mongoose, { Document, Model, Schema, Types } from 'mongoose';

/**
 * Standard content lifecycle actions tracked by the audit trail.
 */
export type ActivityAction = 'create' | 'update' | 'delete' | 'publish' | 'unpublish';

/**
 * Supported CMS content entity types.
 */
export type ActivityEntityType = 'blog' | 'author' | 'faq' | 'whitepaper' | 'release_note';

/**
 * Snapshot of the authenticated user who initiated the action.
 * Snapshotting ensures that historical audit trails remain legible and accurate
 * even if the user account is later modified, disabled, or removed.
 */
export interface IActivityActor {
  id: Types.ObjectId;
  name: string;
  email: string;
  role: string;
}

/**
 * Persistent document interface for the ActivityLog collection.
 */
export interface IActivityLog extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  actor: IActivityActor;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  entityTitle: string;
  entitySlug: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const ActivityActorSchema = new Schema<IActivityActor>(
  {
    id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    actor: { type: ActivityActorSchema, required: true },
    action: {
      type: String,
      enum: ['create', 'update', 'delete', 'publish', 'unpublish'],
      required: true,
    },
    entityType: {
      type: String,
      enum: ['blog', 'author', 'faq', 'whitepaper', 'release_note'],
      required: true,
    },
    entityId: { type: String, required: true, trim: true },
    entityTitle: { type: String, default: '', trim: true },
    entitySlug: { type: String, default: '', trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'activity_logs',
  },
);

/**
 * Compound indexes optimized specifically for query access patterns:
 * 1. Default site chronological list: { siteId: 1, createdAt: -1, _id: -1 }
 * 2. Action filter within site: { siteId: 1, action: 1, createdAt: -1 }
 * 3. Entity type filter within site: { siteId: 1, entityType: 1, createdAt: -1 }
 * 4. Entity detail history lookup: { siteId: 1, entityId: 1 }
 *
 * In accordance with repository DocumentDB compatibility guidelines, no partial
 * filter expressions, collations, or text indexes are declared here.
 */
ActivityLogSchema.index({ siteId: 1, createdAt: -1, _id: -1 });
ActivityLogSchema.index({ siteId: 1, action: 1, createdAt: -1 });
ActivityLogSchema.index({ siteId: 1, entityType: 1, createdAt: -1 });
ActivityLogSchema.index({ siteId: 1, entityId: 1 });

const ActivityLog: Model<IActivityLog> =
  mongoose.models.ActivityLog || mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);

export default ActivityLog;
