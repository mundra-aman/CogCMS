import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type EventFormat = 'online' | 'in-person' | 'hybrid';
export type TicketPriceType = 'free' | 'paid';

export interface IEvent extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  title: string;
  slug: string;
  summary: string;
  content: string;
  imageUrl: string;
  imageAlt: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  format: EventFormat;
  location: string;
  onlineUrl: string;
  registrationUrl: string;
  ticketPriceType?: TicketPriceType;
  ticketPriceAmount: string;
  ticketPriceCurrency: string;
  organizer: string;
  speakers: string;
  metaTitle: string;
  metaDescription: string;
  status: 'draft' | 'publish';
  publishedAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true },
    title: { type: String, required: true },
    slug: { type: String, required: true },
    summary: { type: String, default: '' },
    content: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    imageAlt: { type: String, default: '' },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timeZone: { type: String, required: true },
    format: { type: String, enum: ['online', 'in-person', 'hybrid'], required: true },
    location: { type: String, default: '' },
    onlineUrl: { type: String, default: '' },
    registrationUrl: { type: String, default: '' },
    ticketPriceType: {
      type: String,
      enum: ['free', 'paid'],
    },
    ticketPriceAmount: { type: String, default: '' },
    ticketPriceCurrency: { type: String, default: '' },
    organizer: { type: String, default: '' },
    speakers: { type: String, default: '' },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'publish'], default: 'draft' },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'events' },
);

EventSchema.index({ siteId: 1, slug: 1 }, { unique: true });
EventSchema.index({ siteId: 1, status: 1, startAt: 1 });

const Event: Model<IEvent> = mongoose.models.Event || mongoose.model<IEvent>('Event', EventSchema);

export default Event;
