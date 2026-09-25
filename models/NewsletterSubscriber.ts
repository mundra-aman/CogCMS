import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { newsletterEmailSchema } from '@/lib/validation/newsletter-subscriber';

export interface INewsletterSubscriber extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  email: string;
  source: string;
  submitCount: number;
  firstSubscribedAt: Date;
  lastSubscribedAt: Date;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const NewsletterSubscriberSchema = new Schema<INewsletterSubscriber>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (value: string) => newsletterEmailSchema.safeParse(value).success,
        message: 'email must be valid',
      },
    },
    source: { type: String, trim: true, default: 'footer' },
    submitCount: { type: Number, min: 1, default: 1 },
    firstSubscribedAt: { type: Date, required: true },
    lastSubscribedAt: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'newsletter_subscribers' },
);

NewsletterSubscriberSchema.index({ siteId: 1, email: 1 }, { unique: true });

const NewsletterSubscriber: Model<INewsletterSubscriber> =
  mongoose.models.NewsletterSubscriber ||
  mongoose.model<INewsletterSubscriber>('NewsletterSubscriber', NewsletterSubscriberSchema);

export default NewsletterSubscriber;
