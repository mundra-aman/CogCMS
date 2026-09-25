import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type FAQSubmissionStatus = 'pending' | 'answered' | 'dismissed';

export interface IFAQSubmission extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  question: string;
  email?: string;
  name?: string;
  status: FAQSubmissionStatus;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const FAQSubmissionSchema = new Schema<IFAQSubmission>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    question: { type: String, required: true },
    email: { type: String, default: '' },
    name: { type: String, default: '' },
    status: { type: String, default: 'pending', enum: ['pending', 'answered', 'dismissed'] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'faq_submissions' },
);

FAQSubmissionSchema.index({ siteId: 1, status: 1, createdAt: -1 });

const FAQSubmission: Model<IFAQSubmission> =
  mongoose.models.FAQSubmission ||
  mongoose.model<IFAQSubmission>('FAQSubmission', FAQSubmissionSchema);

export default FAQSubmission;
