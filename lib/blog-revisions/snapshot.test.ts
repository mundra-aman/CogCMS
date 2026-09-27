import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  pickSnapshot,
  RESTORABLE_FIELDS,
  SNAPSHOT_FIELDS,
  snapshotsEqual,
} from '@/lib/blog-revisions/snapshot';

const authorId = new Types.ObjectId();
const blog = {
  title: 'Hello',
  slug: 'hello',
  excerpt: 'Short',
  content: '<p>Body</p>',
  imageUrl: '',
  tag: 'Insights',
  authorId,
  category: 'News',
  tags: ['a', 'b'],
  faqs: [{ _id: new Types.ObjectId(), question: 'Q?', answer: 'A.' }],
  keyTakeaways: ['One'],
  relatedSlugs: [],
  tocOverrides: [{ _id: new Types.ObjectId(), id: 'intro', label: undefined, hidden: true }],
  status: 'publish',
  metaTitle: '',
  metaDescription: '',
  keywords: '',
  isFeatured: false,
  // Fields that must never end up in a snapshot:
  siteId: new Types.ObjectId(),
  rendered: { html: '<p>Body</p>' },
  updatedAt: new Date(),
};

describe('blog snapshots', () => {
  it('copies exactly the editable fields and normalizes subdocuments', () => {
    const snapshot = pickSnapshot(blog);
    expect(Object.keys(snapshot).sort()).toEqual([...SNAPSHOT_FIELDS].sort());
    expect(snapshot.faqs).toEqual([{ question: 'Q?', answer: 'A.' }]);
    expect(snapshot.tocOverrides).toEqual([{ id: 'intro', hidden: true }]);
    expect(snapshot.authorId?.toString()).toBe(authorId.toString());
  });

  it('uses toObject() when given a Mongoose document', () => {
    expect(pickSnapshot({ toObject: () => ({ ...blog, title: 'From doc' }) }).title).toBe(
      'From doc',
    );
  });

  it('treats snapshots as equal when only ids of subdocuments differ', () => {
    const copy = { ...blog, faqs: [{ _id: new Types.ObjectId(), question: 'Q?', answer: 'A.' }] };
    expect(snapshotsEqual(pickSnapshot(blog), pickSnapshot(copy))).toBe(true);
    expect(
      snapshotsEqual(pickSnapshot(blog), pickSnapshot({ ...blog, content: '<p>New</p>' })),
    ).toBe(false);
    expect(
      snapshotsEqual(pickSnapshot(blog), pickSnapshot({ ...blog, authorId: new Types.ObjectId() })),
    ).toBe(false);
  });

  it('never restores slug or status', () => {
    expect(RESTORABLE_FIELDS).not.toContain('slug');
    expect(RESTORABLE_FIELDS).not.toContain('status');
    expect(RESTORABLE_FIELDS).toContain('content');
    expect(RESTORABLE_FIELDS).toHaveLength(SNAPSHOT_FIELDS.length - 2);
  });
});
