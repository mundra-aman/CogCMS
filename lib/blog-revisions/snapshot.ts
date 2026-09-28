import { Types } from 'mongoose';
import type { IBlogSnapshot } from '@/models/BlogRevision';

/** Every editable blog field kept in a revision, in display order. */
export const SNAPSHOT_FIELDS = [
  'title',
  'slug',
  'status',
  'excerpt',
  'content',
  'imageUrl',
  'tag',
  'category',
  'tags',
  'authorId',
  'faqs',
  'keyTakeaways',
  'relatedSlugs',
  'tocOverrides',
  'metaTitle',
  'metaDescription',
  'keywords',
  'isFeatured',
] as const satisfies readonly (keyof IBlogSnapshot)[];

/**
 * Fields a restore writes back. Slug and status are excluded on purpose: restoring old
 * wording must not silently move the post to an old URL or publish/unpublish it.
 */
export const RESTORABLE_FIELDS = SNAPSHOT_FIELDS.filter(
  (field) => field !== 'slug' && field !== 'status',
);

type BlogLike = {
  [K in keyof IBlogSnapshot]?: unknown;
} & { toObject?: () => Record<string, unknown> };

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * Copies the editable fields out of a blog document into a plain, normalized object.
 * Normalizing (no subdocument _ids, no undefined keys) makes two snapshots comparable.
 */
export function pickSnapshot(blog: BlogLike): IBlogSnapshot {
  const source = (typeof blog.toObject === 'function' ? blog.toObject() : blog) as Record<
    string,
    unknown
  >;
  const authorId = source.authorId;
  return {
    title: text(source.title),
    slug: text(source.slug),
    excerpt: text(source.excerpt),
    content: text(source.content),
    imageUrl: text(source.imageUrl),
    tag: text(source.tag),
    authorId:
      authorId && Types.ObjectId.isValid(String(authorId))
        ? new Types.ObjectId(String(authorId))
        : null,
    category: text(source.category),
    tags: strings(source.tags),
    faqs: (Array.isArray(source.faqs) ? source.faqs : []).map((faq) => ({
      question: text((faq as { question?: unknown }).question),
      answer: text((faq as { answer?: unknown }).answer),
    })),
    keyTakeaways: strings(source.keyTakeaways),
    relatedSlugs: strings(source.relatedSlugs),
    tocOverrides: (Array.isArray(source.tocOverrides) ? source.tocOverrides : []).map((entry) => {
      const { id, label, hidden } = entry as { id?: unknown; label?: unknown; hidden?: unknown };
      return {
        id: text(id),
        ...(typeof label === 'string' ? { label } : {}),
        ...(typeof hidden === 'boolean' ? { hidden } : {}),
      };
    }),
    status: source.status === 'draft' ? 'draft' : 'publish',
    metaTitle: text(source.metaTitle),
    metaDescription: text(source.metaDescription),
    keywords: text(source.keywords),
    isFeatured: source.isFeatured === true,
  };
}

/** Comparable form of one field: ObjectIds become strings, everything else is JSON. */
export function fieldKey(snapshot: IBlogSnapshot, field: keyof IBlogSnapshot): string {
  const value = snapshot[field];
  return JSON.stringify(value instanceof Types.ObjectId ? value.toString() : value);
}

export function snapshotsEqual(a: IBlogSnapshot, b: IBlogSnapshot): boolean {
  return SNAPSHOT_FIELDS.every((field) => fieldKey(a, field) === fieldKey(b, field));
}
