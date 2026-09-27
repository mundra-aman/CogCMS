import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import type { PublicationStatus } from '@/models/Blog';

/** Oldest revisions beyond this count are pruned per blog after every new revision. */
export const BLOG_REVISION_LIMIT = 50;

/**
 * The editable fields of a blog at one point in time. `rendered` is deliberately absent:
 * it is derived from `content` and is re-rendered on restore, so a restored post always
 * uses the current rendering pipeline.
 */
export interface IBlogSnapshot {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  tag: string;
  authorId: Types.ObjectId | null;
  category: string;
  tags: string[];
  faqs: { question: string; answer: string }[];
  keyTakeaways: string[];
  relatedSlugs: string[];
  tocOverrides: { id: string; label?: string; hidden?: boolean }[];
  status: PublicationStatus;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  isFeatured: boolean;
}

/** edit = replaced by a normal save; restore = replaced because an older version was restored. */
export const BLOG_REVISION_REASONS = ['edit', 'restore'] as const;
export type BlogRevisionReason = (typeof BLOG_REVISION_REASONS)[number];

export interface IBlogRevision extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  /** Keyed by id, not slug: the slug is editable, the id is not. */
  blogId: Types.ObjectId;
  snapshot: IBlogSnapshot;
  /** When this version was originally saved (the blog's updatedAt at the time). */
  savedAt: Date;
  /** Who saved this version (the blog's updatedBy, or createdBy for the first version). */
  savedBy: Types.ObjectId | null;
  /** Who replaced it; createdAt is when it was replaced. */
  replacedBy: Types.ObjectId | null;
  reason: BlogRevisionReason;
  restoredFrom: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const SnapshotSchema = new Schema<IBlogSnapshot>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true },
    excerpt: { type: String, default: '' },
    content: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    tag: { type: String, default: '' },
    authorId: { type: Schema.Types.ObjectId, ref: 'Author', default: null },
    category: { type: String, default: '' },
    tags: { type: [String], default: [] },
    faqs: {
      type: [{ question: { type: String }, answer: { type: String } }],
      default: [],
      _id: false,
    },
    keyTakeaways: { type: [String], default: [] },
    relatedSlugs: { type: [String], default: [] },
    tocOverrides: {
      type: [{ id: { type: String }, label: { type: String }, hidden: { type: Boolean } }],
      default: [],
      _id: false,
    },
    status: { type: String, enum: ['draft', 'publish'], required: true },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    keywords: { type: String, default: '' },
    isFeatured: { type: Boolean, default: false },
  },
  { _id: false },
);

const BlogRevisionSchema = new Schema<IBlogRevision>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true },
    blogId: { type: Schema.Types.ObjectId, ref: 'Blog', required: true },
    snapshot: { type: SnapshotSchema, required: true },
    savedAt: { type: Date, required: true },
    savedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, enum: BLOG_REVISION_REASONS, required: true },
    restoredFrom: { type: Schema.Types.ObjectId, ref: 'BlogRevision', default: null },
  },
  { timestamps: true, collection: 'blog_revisions' },
);

// History of one blog, newest first. siteId leads so every query is tenant-scoped by index.
BlogRevisionSchema.index({ siteId: 1, blogId: 1, _id: -1 });

const BlogRevision: Model<IBlogRevision> =
  mongoose.models.BlogRevision || mongoose.model<IBlogRevision>('BlogRevision', BlogRevisionSchema);

export default BlogRevision;
