import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface ILoginAttempt extends Document<Types.ObjectId> {
  key: string;
  count: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
  expiresAt: Date;
}

const LoginAttemptSchema = new Schema<ILoginAttempt>(
  {
    key: {
      type: String,
      required: true,
      validate: {
        validator: (value: string) => /^(email|ip):[a-f0-9]{64}$/.test(value),
        message: 'Login attempt keys must be opaque SHA-256 identifiers',
      },
    },
    count: { type: Number, required: true, min: 0, validate: Number.isInteger },
    windowStartedAt: { type: Date, required: true },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'login_attempts', versionKey: false },
);

LoginAttemptSchema.index({ key: 1 }, { unique: true });
LoginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LoginAttempt: Model<ILoginAttempt> =
  mongoose.models.LoginAttempt ||
  mongoose.model<ILoginAttempt>('LoginAttempt', LoginAttemptSchema);

export default LoginAttempt;
