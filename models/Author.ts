import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import type { PublicationStatus } from '@/models/Blog';

export interface IAuthor extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  name: string;
  slug: string;
  role?: string;
  bio?: string;
  avatarUrl?: string;
  socials: { x?: string; linkedin?: string; website?: string };
  status: PublicationStatus;
  publishedAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const AuthorSchema = new Schema<IAuthor>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    role: { type: String, default: '' },
    bio: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    socials: {
      x: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      website: { type: String, default: '' },
    },
    status: { type: String, enum: ['draft', 'publish'], default: 'publish' },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'authors' },
);

AuthorSchema.pre('validate', function setFirstPublishedAt() {
  if (this.status === 'publish' && !this.publishedAt) this.publishedAt = new Date();
});
AuthorSchema.index({ siteId: 1, slug: 1 }, { unique: true });

const Author: Model<IAuthor> =
  mongoose.models.Author || mongoose.model<IAuthor>('Author', AuthorSchema);

export default Author;
