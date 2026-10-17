import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { WEBHOOK_SUBSCRIPTION_EVENTS, type WebhookSubscriptionEvent } from '@/lib/webhooks/events';

export { WEBHOOK_SUBSCRIPTION_EVENTS, type WebhookSubscriptionEvent };

export type LastDeliveryStatus = 'success' | 'failed';

export interface IWebhookLastDelivery {
  status: LastDeliveryStatus;
  statusCode: number;
  timestamp: Date;
}

export interface IWebhookSubscription extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  url: string;
  events: WebhookSubscriptionEvent[];
  /** Stored server-side only; never returned on list/get responses. */
  secret: string;
  active: boolean;
  lastDelivery: IWebhookLastDelivery | null;
  createdAt: Date;
  updatedAt: Date;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const lastDeliverySchema = new Schema<IWebhookLastDelivery>(
  {
    status: { type: String, enum: ['success', 'failed'], required: true },
    statusCode: { type: Number, required: true },
    timestamp: { type: Date, required: true },
  },
  { _id: false },
);

const WebhookSubscriptionSchema = new Schema<IWebhookSubscription>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: isHttpsUrl,
        message: 'url must be a valid https URL without credentials',
      },
    },
    events: {
      type: [String],
      enum: WEBHOOK_SUBSCRIPTION_EVENTS,
      required: true,
      validate: {
        validator: (arr: string[]) => arr.length > 0,
        message: 'events must contain at least one entry',
      },
    },
    secret: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    lastDelivery: { type: lastDeliverySchema, default: null },
  },
  { timestamps: true, collection: 'webhook_subscriptions' },
);

WebhookSubscriptionSchema.index({ siteId: 1, createdAt: -1 });

const WebhookSubscription: Model<IWebhookSubscription> =
  mongoose.models.WebhookSubscription ||
  mongoose.model<IWebhookSubscription>('WebhookSubscription', WebhookSubscriptionSchema);

export default WebhookSubscription;
