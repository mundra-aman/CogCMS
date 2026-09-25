import mongoose, { Schema } from 'mongoose';

// Provision explicitly with ensure:indexes. Runtime never creates collections or indexes.
const schema = new Schema(
  {
    _id: { type: String, required: true },
    tokens: { type: Number, required: true },
    updatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'intake_rate_limits', versionKey: false, autoIndex: false, autoCreate: false },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.IntakeRateLimit || mongoose.model('IntakeRateLimit', schema);
