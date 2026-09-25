import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type SiteStatus = 'active' | 'archived';

export interface SitePublicPaths {
  blogs: string;
  whitepapers: string;
  faq: string;
  releaseNotes: string;
}

export interface SitePublisher {
  name: string;
  url: string;
  logoUrl: string;
}

export interface ISite extends Document<Types.ObjectId> {
  name: string;
  slug: string;
  primaryDomain: string;
  publicPaths: SitePublicPaths;
  publisher: SitePublisher;
  defaultLocale: string;
  mediaPrefix: string;
  status: SiteStatus;
  webhookUrl?: string;
  webhookSecret?: string;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

function normaliseOrigin(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      (url.pathname !== '/' && url.pathname !== '') ||
      url.search ||
      url.hash
    ) {
      return trimmed;
    }
    return url.origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

const SiteSchema = new Schema<ISite>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    primaryDomain: {
      type: String,
      required: true,
      set: normaliseOrigin,
      validate: { validator: isHttpOrigin, message: 'primaryDomain must be an HTTP(S) origin' },
    },
    publicPaths: {
      blogs: { type: String, default: '/blogs' },
      whitepapers: { type: String, default: '/whitepapers' },
      faq: { type: String, default: '/faq' },
      releaseNotes: { type: String, default: '/release-notes' },
    },
    publisher: {
      name: { type: String, required: true, trim: true },
      url: { type: String, required: true, trim: true },
      logoUrl: { type: String, default: '', trim: true },
    },
    defaultLocale: { type: String, default: 'en', trim: true },
    mediaPrefix: { type: String, trim: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    webhookUrl: { type: String, trim: true, default: undefined },
    webhookSecret: { type: String, default: undefined, select: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'sites' },
);

SiteSchema.pre('validate', function setDefaultMediaPrefix() {
  if (!this.mediaPrefix) this.mediaPrefix = this.slug;
});

const Site: Model<ISite> = mongoose.models.Site || mongoose.model<ISite>('Site', SiteSchema);

export default Site;
