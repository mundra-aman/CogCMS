import mongoose, { type Model, Schema, Types } from 'mongoose';
export interface IStudioConnectionGrant {
  _id: string;
  codeHash: string;
  codeChallenge: string;
  stateHash: string;
  redirectUri: string;
  brandLabel: string;
  siteId: Types.ObjectId;
  createdBy: Types.ObjectId;
  /** Approval expiry (TTL); removed once a key is minted so the grant is kept. */
  expiresAt?: Date | null;
  keyExpiresAt?: Date | null;
  status: 'approved' | 'consuming' | 'issued' | 'active';
  apiKeyId: Types.ObjectId | null;
  createdAt: Date;
}
const schema = new Schema<IStudioConnectionGrant>(
  {
    _id: { type: String, required: true },
    codeHash: { type: String, required: true, unique: true },
    codeChallenge: { type: String, required: true },
    stateHash: { type: String, required: true },
    redirectUri: { type: String, required: true },
    brandLabel: { type: String, required: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, expires: 0 },
    keyExpiresAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['approved', 'consuming', 'issued', 'active'],
      default: 'approved',
    },
    apiKeyId: { type: Schema.Types.ObjectId, ref: 'ApiKey', default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'studio_connection_grants' },
);
const StudioConnectionGrant: Model<IStudioConnectionGrant> =
  mongoose.models.StudioConnectionGrant ||
  mongoose.model<IStudioConnectionGrant>('StudioConnectionGrant', schema);
export default StudioConnectionGrant;
