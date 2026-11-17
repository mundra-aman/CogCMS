import mongoose, { Document, Model, Schema, Types } from 'mongoose';

// Entity whose updates are being audited/ logged 
export type AuditEntityType = 'blog' | 'event' | 'user' | 'site' | 'api_key';

// Different actions that can be performed on the entity
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'unpublish'
  | 'restore'
  | 'generate'
  | 'revoke';

// Using interface in place of usual class to reduce runtime bytecode size; Becomes trash at runtime; Just acts as a running contract to verify mongoose model; An 'Actor' is the one performing the action.; Using detailed Actor profile in place of just Id to ensure Log remains immutable and readable even if the user is deleted.
export interface IAuditActor {
  id: Types.ObjectId;
  name: string;
  email: string;
  role: 'admin' | 'editor';
}

// Mongoose returns an object model in runtime; Using Document<Types.ObjectId> to ensure Typescript is aware of model object's properties
export interface IAuditLog extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  actor: IAuditActor;
  entityType: AuditEntityType;
  entityId: string;
  entityTitle: string;
  action: AuditAction | string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

// Schema made to instantiate the real mongoose contract; Using strict typing and making fields required; Actor Schema
const AuditActorSchema = new Schema<IAuditActor>(
  {
    id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, enum: ['admin', 'editor'], required: true },
  },
  // _id: false tells MongoDb that this Actor data is an owned object and not a separate collection; We don't need a separate id for it as it is always bundled with an actor.
  { _id: false },
);

// Actual log schema
const AuditLogSchema = new Schema<IAuditLog>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    actor: { type: AuditActorSchema, required: true },
    entityType: {
      type: String,
      enum: ['blog', 'event', 'user', 'site', 'api_key'],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true },
    entityTitle: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'audit_logs',
  },
);

// Indexing for efficient querying; 1 = Ascending order; -1 = Descending order; Group by SiteID, sort newest to oldest
AuditLogSchema.index({ siteId: 1, createdAt: -1 });
// Group by SiteID and EntityType, sort newest to oldest
AuditLogSchema.index({ siteId: 1, entityType: 1, createdAt: -1 });

// Initialise a constant variable AuditLog of the type created by the interface IAuditLog; Since Mongoose keeps the running registry of all models created by current Node.js instance, we check if the model already exists else create a new model based on schema defined at Ln:49
const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

// Using default export to establish 'AuditLog' as the single source of truth for this model
export default AuditLog;