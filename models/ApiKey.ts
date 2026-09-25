import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export const API_KEY_SCOPES = ['content:read', 'intake:write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface IApiKey extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  rotatedFrom: Types.ObjectId | null;
  rotatedTo: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    name: { type: String, required: true, trim: true },
    prefix: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /^[a-f\d]{8}$/,
    },
    keyHash: { type: String, required: true, select: false },
    scopes: { type: [String], enum: API_KEY_SCOPES, required: true },
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    rotatedFrom: { type: Schema.Types.ObjectId, ref: 'ApiKey', default: null },
    rotatedTo: { type: Schema.Types.ObjectId, ref: 'ApiKey', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'api_keys' },
);

ApiKeySchema.index({ siteId: 1, createdAt: -1 });

const ApiKey: Model<IApiKey> =
  mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', ApiKeySchema);

export default ApiKey;
