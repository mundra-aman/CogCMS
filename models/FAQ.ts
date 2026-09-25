import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import type { PublicationStatus } from '@/models/Blog';

export interface IFAQ extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  question: string;
  answer: string;
  category: string;
  order: number;
  status: PublicationStatus;
  publishedAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const FAQSchema = new Schema<IFAQ>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: { type: String, required: true, default: 'General' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'publish'], default: 'publish' },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'faqs' },
);

FAQSchema.pre('validate', function setFirstPublishedAt() {
  if (this.status === 'publish' && !this.publishedAt) this.publishedAt = new Date();
});
FAQSchema.index({ siteId: 1, category: 1, order: 1 });
FAQSchema.index({ siteId: 1, status: 1 });

const FAQ: Model<IFAQ> = mongoose.models.FAQ || mongoose.model<IFAQ>('FAQ', FAQSchema);

export default FAQ;
