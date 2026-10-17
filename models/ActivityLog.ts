import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface IActivityLog extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  userName: string;
  userEmail: string;
  action: ActivityAction;
  resourceType: string;
  resourceId: Types.ObjectId;
  resourceTitle: string;
  siteId: Types.ObjectId;
  createdAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    action: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE'],
      required: true,
    },
    resourceType: {
      type: String,
      required: true,
      trim: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    resourceTitle: {
      type: String,
      required: true,
      trim: true,
    },
    siteId: {
      type: Schema.Types.ObjectId,
      ref: 'Site',
      required: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'activity_logs',
  },
);

ActivityLogSchema.index({ siteId: 1, createdAt: -1 });

const ActivityLog: Model<IActivityLog> =
  mongoose.models.ActivityLog ||
  mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);

export default ActivityLog;
