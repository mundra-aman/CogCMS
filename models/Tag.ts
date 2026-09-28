import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import type { PublicationStatus } from '@/models/Blog';

export interface ITag extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  color: string;
  status: PublicationStatus;
  publishedAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TagSchema = new Schema<ITag>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, default: '', trim: true },
    color: { type: String, default: '#FF751F', trim: true },
    status: { type: String, enum: ['draft', 'publish'], default: 'publish' },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'tags' },
);

TagSchema.pre('validate', function setFirstPublishedAt() {
  if (this.status === 'publish' && !this.publishedAt) this.publishedAt = new Date();
});
TagSchema.index({ siteId: 1, slug: 1 }, { unique: true });
TagSchema.index({ siteId: 1, status: 1 });

const Tag: Model<ITag> = mongoose.models.Tag || mongoose.model<ITag>('Tag', TagSchema);

export default Tag;
