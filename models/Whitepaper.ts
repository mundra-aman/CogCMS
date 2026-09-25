import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import type { PublicationStatus } from '@/models/Blog';
import { estimateWhitepaperReadTime } from '@/lib/validation/whitepaper';

export interface IWhitepaper extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  date: string;
  author: string;
  authorRole: string;
  readTime: string;
  tags: string[];
  headline: string;
  stat1Value: string;
  stat1Label: string;
  stat2Value: string;
  stat2Label: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  tag?: string;
  status: PublicationStatus;
  publishedAt: Date | null;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string;
  isFeatured: boolean;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const WhitepaperSchema = new Schema<IWhitepaper>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    title: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: '' },
    date: { type: String, default: '' },
    author: { type: String, default: 'Research Team' },
    authorRole: { type: String, default: '' },
    readTime: { type: String, default: '' },
    tags: { type: [String], default: [] },
    headline: { type: String, default: '' },
    stat1Value: { type: String, default: '' },
    stat1Label: { type: String, default: '' },
    stat2Value: { type: String, default: '' },
    stat2Label: { type: String, default: '' },
    excerpt: { type: String, default: '' },
    content: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    tag: { type: String, default: 'Insights' },
    status: { type: String, enum: ['draft', 'publish'], default: 'publish' },
    publishedAt: { type: Date, default: null },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    keywords: { type: String, default: '' },
    isFeatured: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'whitepapers' },
);

WhitepaperSchema.pre('validate', function setFirstPublishedAt() {
  if (!this.readTime.trim()) this.readTime = estimateWhitepaperReadTime(this.content);
  if (this.status === 'publish' && !this.publishedAt) this.publishedAt = new Date();
});
WhitepaperSchema.index({ siteId: 1, slug: 1 }, { unique: true });
WhitepaperSchema.index({ siteId: 1, status: 1, createdAt: -1 });

const Whitepaper: Model<IWhitepaper> =
  mongoose.models.Whitepaper || mongoose.model<IWhitepaper>('Whitepaper', WhitepaperSchema);

export default Whitepaper;
