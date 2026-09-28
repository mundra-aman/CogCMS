import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import type { PublicationStatus, IBlog } from '@/models/Blog';
import type { RenderedBlogSnapshot } from '@/lib/render/blog';

export interface BlogVersionSnapshot {
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
  publishedAt: Date | null;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  isFeatured: boolean;
  rendered: RenderedBlogSnapshot;
}

export interface IBlogVersion extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  blogId: Types.ObjectId;
  version: number;
  changeType: 'create' | 'update' | 'restore';
  snapshot: BlogVersionSnapshot;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
}

const TocOverrideSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: '' },
    hidden: { type: Boolean, default: false },
  },
  { _id: false },
);

const FaqSchema = new Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false },
);

const TocEntrySchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    level: { type: Number, required: true },
  },
  { _id: false },
);

const RenderedSchema = new Schema(
  {
    html: { type: String, default: '' },
    toc: { type: [TocEntrySchema], default: [] },
    wordCount: { type: Number, required: true, min: 0 },
    readingTime: { type: Number, required: true, min: 0 },
    pipelineVersion: { type: Number, required: true, min: 1 },
    renderedAt: { type: Date, required: true },
  },
  { _id: false },
);

const SnapshotSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true },
    excerpt: { type: String, default: '' },
    content: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    tag: { type: String, default: 'Insights' },
    authorId: { type: Schema.Types.ObjectId, ref: 'Author', default: null },
    category: { type: String, default: '' },
    tags: { type: [String], default: [] },
    faqs: { type: [FaqSchema], default: [] },
    keyTakeaways: { type: [String], default: [] },
    relatedSlugs: { type: [String], default: [] },
    tocOverrides: { type: [TocOverrideSchema], default: [] },
    status: { type: String, enum: ['draft', 'publish'], required: true },
    publishedAt: { type: Date, default: null },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    keywords: { type: String, default: '' },
    isFeatured: { type: Boolean, default: false },
    rendered: { type: RenderedSchema, required: true },
  },
  { _id: false },
);

const BlogVersionSchema = new Schema<IBlogVersion>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    blogId: { type: Schema.Types.ObjectId, ref: 'Blog', required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    changeType: { type: String, enum: ['create', 'update', 'restore'], required: true },
    snapshot: { type: SnapshotSchema, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'blog_versions' },
);

BlogVersionSchema.index({ blogId: 1, version: -1 });
BlogVersionSchema.index({ siteId: 1, blogId: 1, createdAt: -1 });
BlogVersionSchema.index({ blogId: 1, version: 1 }, { unique: true });

const BlogVersion: Model<IBlogVersion> =
  mongoose.models.BlogVersion || mongoose.model<IBlogVersion>('BlogVersion', BlogVersionSchema);

export default BlogVersion;

export function snapshotBlog(blog: IBlog): BlogVersionSnapshot {
  return {
    title: blog.title,
    slug: blog.slug,
    excerpt: blog.excerpt,
    content: blog.content,
    imageUrl: blog.imageUrl,
    tag: blog.tag ?? 'Insights',
    authorId: blog.authorId ?? null,
    category: blog.category ?? '',
    tags: [...blog.tags],
    faqs: blog.faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
    keyTakeaways: [...blog.keyTakeaways],
    relatedSlugs: [...blog.relatedSlugs],
    tocOverrides: blog.tocOverrides.map((entry) => ({
      id: entry.id,
      label: entry.label,
      hidden: entry.hidden,
    })),
    status: blog.status,
    publishedAt: blog.publishedAt,
    metaTitle: blog.metaTitle ?? '',
    metaDescription: blog.metaDescription ?? '',
    keywords: blog.keywords ?? '',
    isFeatured: blog.isFeatured,
    rendered: blog.rendered,
  };
}

export async function recordBlogVersion(
  blog: IBlog,
  createdBy: Types.ObjectId | null,
  changeType: IBlogVersion['changeType'],
) {
  const latest = await BlogVersion.findOne({ blogId: blog._id })
    .sort({ version: -1 })
    .select({ version: 1 })
    .lean()
    .exec();
  return BlogVersion.create({
    siteId: blog.siteId,
    blogId: blog._id,
    version: (latest?.version ?? 0) + 1,
    changeType,
    snapshot: snapshotBlog(blog),
    createdBy,
  });
}
