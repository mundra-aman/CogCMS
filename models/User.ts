import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type UserRole = 'admin' | 'editor';
export type UserStatus = 'active' | 'disabled';

export interface IUser extends Document<Types.ObjectId> {
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  siteIds: Types.ObjectId[];
  status: UserStatus;
  lastLoginAt: Date | null;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['admin', 'editor'], required: true },
    siteIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Site' }],
      default: [],
    },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'users' },
);

UserSchema.pre('validate', function validateEditorAssignment() {
  if (this.role === 'editor' && this.siteIds.length === 0) {
    this.invalidate('siteIds', 'Editors must be assigned to at least one site');
  }
});

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
