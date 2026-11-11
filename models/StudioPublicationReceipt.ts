import mongoose, { type Model, Schema, Types } from 'mongoose';

interface IStudioPublicationReceipt {
  _id: string;
  siteId: Types.ObjectId;
  sourceId: string;
  revision: string;
  createdAt: Date;
}

// No TTL: accepted revisions must stay consumed after an editor deletes the blog.
const schema = new Schema<IStudioPublicationReceipt>(
  {
    _id: { type: String, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    sourceId: { type: String, required: true },
    revision: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'studio_publication_receipts' },
);

const StudioPublicationReceipt: Model<IStudioPublicationReceipt> =
  mongoose.models.StudioPublicationReceipt ||
  mongoose.model<IStudioPublicationReceipt>('StudioPublicationReceipt', schema);
export default StudioPublicationReceipt;
