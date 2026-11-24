import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import type { IBlog } from '@/models/Blog';
import type { IEvent } from '@/models/Event';

export type BlogRevisionSnapshot = Omit<
  IBlog,
  keyof Document | 'siteId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>;

export type EventRevisionSnapshot = Omit<
  IEvent,
  keyof Document | 'siteId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>;

export const REVISION_ENTITY_TYPES = ['blog', 'event'] as const;
export type RevisionEntityType = (typeof REVISION_ENTITY_TYPES)[number];

export const REVISION_TRIGGERS = ['create', 'update', 'publish', 'unpublish', 'restore'] as const;
export type RevisionTrigger = (typeof REVISION_TRIGGERS)[number];

export type RevisionSnapshot = BlogRevisionSnapshot | EventRevisionSnapshot;

export interface IRevisionAuthor {
  id: Types.ObjectId;
  name: string;
  email: string;
}

export interface IRevision extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  entityType: RevisionEntityType;
  entityId: Types.ObjectId;
  majorVersion: number;
  minorVersion: number;
  version: string;
  restoredFromVersion?: string | null;
  trigger: RevisionTrigger;
  author: IRevisionAuthor;
  snapshot: RevisionSnapshot;
  summary?: string;
  createdAt: Date;
}

const RevisionAuthorSchema = new Schema<IRevisionAuthor>(
  {
    id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
  },
  { _id: false },
);

const RevisionSchema = new Schema<IRevision>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    entityType: { type: String, enum: REVISION_ENTITY_TYPES, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    majorVersion: { type: Number, required: true, default: 1 },
    minorVersion: { type: Number, required: true, default: 0 },
    version: { type: String, required: true },
    restoredFromVersion: { type: String, default: null },
    trigger: {
      type: String,
      enum: REVISION_TRIGGERS,
      default: 'update',
      index: true,
    },
    author: { type: RevisionAuthorSchema, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    summary: { type: String, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'revisions',
  },
);

// Compound unique index scoped per entityType avoids collisions if blog and event IDs overlap.
RevisionSchema.index(
  { siteId: 1, entityType: 1, entityId: 1, majorVersion: -1, minorVersion: -1 },
  { unique: true },
);

// Clear cached model so updated indexes/fields apply cleanly across Next.js hot reloads.
if (mongoose.models && mongoose.models.Revision) {
  delete (mongoose.models as Record<string, unknown>).Revision;
}

const Revision: Model<IRevision> = mongoose.model<IRevision>('Revision', RevisionSchema);

export default Revision;
