import { Types } from 'mongoose';
import Blog, { type IBlog } from '@/models/Blog';
import BlogRevision, {
  BLOG_REVISION_LIMIT,
  type BlogRevisionReason,
  type IBlogRevision,
} from '@/models/BlogRevision';
import User from '@/models/User';
import { pickSnapshot, snapshotsEqual } from './snapshot';

async function discardRevision(revisionId: Types.ObjectId): Promise<void> {
  try {
    await BlogRevision.deleteOne({ _id: revisionId }).exec();
  } catch {
    // Leaves one duplicate of the current version. Harmless, and far better than losing data.
    console.warn('[cms] could not discard an unused blog revision');
  }
}

/** Keeps the newest BLOG_REVISION_LIMIT revisions of one blog and deletes the rest. */
export async function pruneRevisions(siteId: string, blogId: Types.ObjectId): Promise<void> {
  const stale = await BlogRevision.find({ siteId, blogId })
    .sort({ _id: -1 })
    .skip(BLOG_REVISION_LIMIT)
    .select('_id')
    .lean()
    .exec();
  if (stale.length > 0) {
    await BlogRevision.deleteMany({ _id: { $in: stale.map((row) => row._id) } }).exec();
  }
}

/**
 * Applies an update to a blog and keeps the version it replaces.
 *
 * Order matters. The old version is written *before* the blog is changed, so a crash
 * can never lose it; the worst case is one extra revision identical to the current post.
 * If the update fails or changes nothing, the new revision is discarded. If the revision
 * cannot be written at all, the save is refused: losing history silently would defeat
 * the purpose of the feature.
 */
export async function updateBlogWithRevision(input: {
  existing: IBlog;
  siteId: string;
  update: Record<string, unknown>;
  userId: string;
  reason: BlogRevisionReason;
  restoredFrom?: Types.ObjectId | null;
}): Promise<{ blog: IBlog | null; revisionId: string | null }> {
  const { existing, siteId, update, userId, reason } = input;
  const before = pickSnapshot(existing);
  const revision = await BlogRevision.create({
    siteId: new Types.ObjectId(siteId),
    blogId: existing._id,
    snapshot: before,
    savedAt: existing.updatedAt ?? existing.createdAt ?? new Date(),
    savedBy: existing.updatedBy ?? existing.createdBy ?? null,
    replacedBy: new Types.ObjectId(userId),
    reason,
    restoredFrom: input.restoredFrom ?? null,
  });

  let blog: IBlog | null;
  try {
    blog = await Blog.findOneAndUpdate(
      { _id: existing._id, siteId },
      { $set: update },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  } catch (error) {
    await discardRevision(revision._id);
    throw error;
  }

  if (!blog || snapshotsEqual(before, pickSnapshot(blog))) {
    await discardRevision(revision._id);
    return { blog, revisionId: null };
  }
  await pruneRevisions(siteId, existing._id);
  return { blog, revisionId: revision._id.toString() };
}

export async function deleteBlogRevisions(siteId: string, blogId: Types.ObjectId): Promise<void> {
  await BlogRevision.deleteMany({ siteId, blogId }).exec();
}

type UserRef = { id: string; name: string } | null;

/** Resolves user ids to display names in one query. Deleted users show as null. */
export async function userNames(
  ids: (Types.ObjectId | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const users = await User.find({ _id: { $in: unique } })
    .select('name')
    .lean()
    .exec();
  return new Map(users.map((user) => [user._id.toString(), user.name]));
}

function ref(id: Types.ObjectId | null | undefined, names: Map<string, string>): UserRef {
  if (!id) return null;
  const name = names.get(id.toString());
  return name ? { id: id.toString(), name } : null;
}

export type BlogRevisionSummary = {
  id: string;
  savedAt: string;
  savedBy: UserRef;
  replacedAt: string;
  replacedBy: UserRef;
  reason: BlogRevisionReason;
  restoredFrom: string | null;
  title: string;
  slug: string;
  status: 'draft' | 'publish';
};

export function serializeRevisionSummary(
  revision: Pick<
    IBlogRevision,
    '_id' | 'savedAt' | 'savedBy' | 'replacedBy' | 'reason' | 'restoredFrom' | 'createdAt'
  > & { snapshot: Pick<IBlogRevision['snapshot'], 'title' | 'slug' | 'status'> },
  names: Map<string, string>,
): BlogRevisionSummary {
  return {
    id: revision._id.toString(),
    savedAt: new Date(revision.savedAt).toISOString(),
    savedBy: ref(revision.savedBy, names),
    replacedAt: new Date(revision.createdAt).toISOString(),
    replacedBy: ref(revision.replacedBy, names),
    reason: revision.reason,
    restoredFrom: revision.restoredFrom ? revision.restoredFrom.toString() : null,
    title: revision.snapshot.title,
    slug: revision.snapshot.slug,
    status: revision.snapshot.status,
  };
}
