import mongoose, { Types, type ClientSession } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import Revision, {
  type IRevision,
  type RevisionEntityType,
  type RevisionSnapshot,
  type RevisionTrigger,
} from '@/models/Revision';
import Blog from '@/models/Blog';
import Event from '@/models/Event';
import { logAudit } from '@/lib/audit/logger';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { renderBlogSnapshot } from '@/lib/render/blog';
import { invalidateRelatedPosts } from '@/lib/blog-content/related-index';
import { notifySiteWebhook } from '@/lib/webhook';
import { notFound } from '@/lib/http/errors';
import type { AuthenticatedUser } from '@/lib/auth/require';
import { normalizeDateToEpoch } from '@/lib/revisions/diff';
import { assertBlogAuthorIsUsable } from '@/lib/admin/blog-author';

// Keep entity mutations, revision snapshots, and audit entries atomic.
export async function runInTransaction<T>(
  fn: (session?: ClientSession) => Promise<T>,
): Promise<T> {
  await connectToDatabase();
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export interface CreateRevisionParams {
  siteId: string | Types.ObjectId;
  entityType: RevisionEntityType;
  entityId: string | Types.ObjectId;
  author: AuthenticatedUser;
  snapshot: RevisionSnapshot;
  trigger?: RevisionTrigger;
  restoredFromVersion?: string;
  summary?: string;
  session?: ClientSession;
}

export function hasContentChanged(
  entityType: RevisionEntityType,
  current: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
): boolean {
  if (!previous) return true;

  const fields =
    entityType === 'blog'
      ? [
          'title',
          'slug',
          'content',
          'excerpt',
          'tag',
          'category',
          'imageUrl',
          'imageAlt',
          'metaTitle',
          'metaDescription',
          'keywords',
          'isFeatured',
        ]
      : [
          'title',
          'slug',
          'content',
          'summary',
          'format',
          'location',
          'timeZone',
          'startAt',
          'endAt',
          'ticketPriceType',
          'ticketPriceAmount',
          'ticketPriceCurrency',
          'onlineUrl',
          'registrationUrl',
          'imageUrl',
          'imageAlt',
          'organizer',
          'speakers',
          'metaTitle',
          'metaDescription',
        ];

  for (const field of fields) {
    const curVal = current[field];
    const prevVal = previous[field];

    // Compare epoch ms so ISO formatting differences do not cause false positives.
    if (field === 'startAt' || field === 'endAt') {
      const tz = String(current.timeZone || previous.timeZone || 'UTC');
      const curTime = normalizeDateToEpoch(curVal, tz);
      const prevTime = normalizeDateToEpoch(prevVal, tz);
      if (curTime !== prevTime) return true;
      continue;
    }

    const curStr = curVal === undefined || curVal === null ? '' : String(curVal).trim();
    const prevStr = prevVal === undefined || prevVal === null ? '' : String(prevVal).trim();

    if (curStr !== prevStr) {
      return true;
    }
  }

  if (entityType === 'blog') {
    const curAuthor = current.authorId ? String(current.authorId) : '';
    const prevAuthor = previous.authorId ? String(previous.authorId) : '';
    if (curAuthor !== prevAuthor) return true;

    const curRelated = JSON.stringify(current.relatedSlugs ?? []);
    const prevRelated = JSON.stringify(previous.relatedSlugs ?? []);
    if (curRelated !== prevRelated) return true;

    // Strip Mongoose subdocument _id fields before comparing so empty edits stay deduplicated.
    const normalizeToc = (toc: unknown) => {
      if (!Array.isArray(toc)) return [];
      return toc.map((t: any) => ({
        id: String(t?.id ?? '').trim(),
        label: String(t?.label ?? '').trim(),
        hidden: Boolean(t?.hidden),
      }));
    };
    const curToc = JSON.stringify(normalizeToc(current.tocOverrides));
    const prevToc = JSON.stringify(normalizeToc(previous.tocOverrides));
    if (curToc !== prevToc) return true;

    const curTags = JSON.stringify(current.tags ?? []);
    const prevTags = JSON.stringify(previous.tags ?? []);
    if (curTags !== prevTags) return true;

    const curTakeaways = JSON.stringify(current.keyTakeaways ?? []);
    const prevTakeaways = JSON.stringify(previous.keyTakeaways ?? []);
    if (curTakeaways !== prevTakeaways) return true;

    const normalizeFaqs = (faqs: unknown) => {
      if (!Array.isArray(faqs)) return [];
      return faqs.map((f: any) => ({
        question: String(f?.question ?? '').trim(),
        answer: String(f?.answer ?? '').trim(),
      }));
    };
    const curFaqs = JSON.stringify(normalizeFaqs(current.faqs));
    const prevFaqs = JSON.stringify(normalizeFaqs(previous.faqs));
    if (curFaqs !== prevFaqs) return true;
  }

  return false;
}

// Omit recomputable HTML (rendered) and DB internals (_id, siteId, __v, timestamps) from stored snapshots.
export function sanitizeRevisionSnapshot(
  entityType: RevisionEntityType,
  raw: Record<string, unknown>,
): RevisionSnapshot {
  if (!raw) return {} as RevisionSnapshot;

  if (entityType === 'blog') {
    return {
      title: String(raw.title ?? ''),
      slug: String(raw.slug ?? ''),
      content: String(raw.content ?? ''),
      excerpt: raw.excerpt !== undefined && raw.excerpt !== null ? String(raw.excerpt) : undefined,
      tag: raw.tag !== undefined && raw.tag !== null ? String(raw.tag) : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      category: raw.category !== undefined && raw.category !== null ? String(raw.category) : undefined,
      imageUrl: raw.imageUrl !== undefined && raw.imageUrl !== null ? String(raw.imageUrl) : undefined,
      imageAlt: raw.imageAlt !== undefined && raw.imageAlt !== null ? String(raw.imageAlt) : undefined,
      metaTitle: raw.metaTitle !== undefined && raw.metaTitle !== null ? String(raw.metaTitle) : undefined,
      metaDescription: raw.metaDescription !== undefined && raw.metaDescription !== null ? String(raw.metaDescription) : undefined,
      keywords: raw.keywords !== undefined && raw.keywords !== null ? String(raw.keywords) : undefined,
      isFeatured: Boolean(raw.isFeatured),
      authorId: raw.authorId ? String(raw.authorId) : null,
      relatedSlugs: Array.isArray(raw.relatedSlugs) ? raw.relatedSlugs.map(String) : [],
      tocOverrides: Array.isArray(raw.tocOverrides)
        ? raw.tocOverrides.map((t: any) => ({
            id: String(t?.id ?? ''),
            label: String(t?.label ?? ''),
            hidden: Boolean(t?.hidden),
          }))
        : [],
      keyTakeaways: Array.isArray(raw.keyTakeaways) ? raw.keyTakeaways.map(String) : [],
      faqs: Array.isArray(raw.faqs)
        ? raw.faqs.map((f: any) => ({
            question: String(f?.question ?? ''),
            answer: String(f?.answer ?? ''),
          }))
        : [],
      status: (raw.status as any) || 'draft',
      publishedAt: raw.publishedAt ? new Date(raw.publishedAt as any) : null,
    } as unknown as RevisionSnapshot;
  }

  return {
    title: String(raw.title ?? ''),
    slug: String(raw.slug ?? ''),
    content: String(raw.content ?? ''),
    summary: raw.summary !== undefined && raw.summary !== null ? String(raw.summary) : undefined,
    format: (raw.format as any) || 'online',
    location: raw.location !== undefined && raw.location !== null ? String(raw.location) : undefined,
    timeZone: String(raw.timeZone || 'UTC'),
    startAt: raw.startAt ? new Date(raw.startAt as any) : new Date(),
    endAt: raw.endAt ? new Date(raw.endAt as any) : new Date(),
    ticketPriceType: (raw.ticketPriceType as any) || 'free',
    ticketPriceAmount: raw.ticketPriceAmount !== undefined && raw.ticketPriceAmount !== null ? String(raw.ticketPriceAmount) : '',
    ticketPriceCurrency: raw.ticketPriceCurrency !== undefined && raw.ticketPriceCurrency !== null ? String(raw.ticketPriceCurrency) : '',
    onlineUrl: raw.onlineUrl !== undefined && raw.onlineUrl !== null ? String(raw.onlineUrl) : undefined,
    registrationUrl: raw.registrationUrl !== undefined && raw.registrationUrl !== null ? String(raw.registrationUrl) : undefined,
    imageUrl: raw.imageUrl !== undefined && raw.imageUrl !== null ? String(raw.imageUrl) : undefined,
    imageAlt: raw.imageAlt !== undefined && raw.imageAlt !== null ? String(raw.imageAlt) : undefined,
    organizer: raw.organizer !== undefined && raw.organizer !== null ? String(raw.organizer) : '',
    speakers: raw.speakers !== undefined && raw.speakers !== null ? String(raw.speakers) : '',
    metaTitle: raw.metaTitle !== undefined && raw.metaTitle !== null ? String(raw.metaTitle) : undefined,
    metaDescription: raw.metaDescription !== undefined && raw.metaDescription !== null ? String(raw.metaDescription) : undefined,
    status: (raw.status as any) || 'draft',
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt as any) : null,
  } as unknown as RevisionSnapshot;
}

// Core revision creation engine.
// Calculates semantic versioning numbers (major.minor), deduplicates unchanged drafts and publishes,
// promotes restored drafts upon publication, and persists immutable revision records.
export async function createRevisionSnapshot(params: CreateRevisionParams): Promise<IRevision> {
  await connectToDatabase();
  const siteObjectId = typeof params.siteId === 'string' ? new Types.ObjectId(params.siteId) : params.siteId;
  const entityObjectId = typeof params.entityId === 'string' ? new Types.ObjectId(params.entityId) : params.entityId;
  let trigger: RevisionTrigger = params.trigger ?? 'update';
  const rawSnapshot = params.snapshot as Record<string, unknown>;
  const cleanSnapshot = sanitizeRevisionSnapshot(params.entityType, rawSnapshot);
  const snapshot = cleanSnapshot as unknown as Record<string, unknown>;
  const isPublishedSnapshot = snapshot?.status === 'publish';

  // Retrieve the most recently created revision for this entity under the tenant site boundary.
  const latestCreated = await Revision.findOne({
    siteId: siteObjectId,
    entityType: params.entityType,
    entityId: entityObjectId,
  })
    .session(params.session || null)
    .sort({ createdAt: -1, _id: -1 })
    .exec();

  // No previous revisions: published items start as 'publish' (v1.0) rather than a misleading 'create' badge.
  if (!latestCreated) {
    const initialTrigger: RevisionTrigger = isPublishedSnapshot || trigger === 'publish' ? 'publish' : 'create';
    const version = '1.0';
    const doc = {
      siteId: siteObjectId,
      entityType: params.entityType,
      entityId: entityObjectId,
      majorVersion: 1,
      minorVersion: 0,
      version,
      restoredFromVersion: params.restoredFromVersion ?? null,
      trigger: initialTrigger,
      author: {
        id: new Types.ObjectId(params.author.id),
        name: params.author.name,
        email: params.author.email,
      },
      snapshot: cleanSnapshot,
      summary: params.summary ?? (initialTrigger === 'publish' ? 'Initial published post' : 'Initial draft created'),
    };
    if (params.session) {
      const res = await Revision.create([doc], { session: params.session });
      return res[0];
    }
    return Revision.create(doc);
  }

  // Explicit restore trigger always proceeds to generate the restoration release milestone.
  if (trigger === 'restore') {
    const highestMajorRev = await Revision.findOne({
      siteId: siteObjectId,
      entityType: params.entityType,
      entityId: entityObjectId,
    })
      .session(params.session || null)
      .sort({ majorVersion: -1 })
      .exec();

    const currentMaxMajor = highestMajorRev?.majorVersion ?? 0;
    const majorVersion = Math.max(1, currentMaxMajor + 1);
    const minorVersion = 0;
    const version = `${majorVersion}.${minorVersion}`;

    const doc = {
      siteId: siteObjectId,
      entityType: params.entityType,
      entityId: entityObjectId,
      majorVersion,
      minorVersion,
      version,
      restoredFromVersion: params.restoredFromVersion ?? null,
      trigger: 'restore' as const,
      author: {
        id: new Types.ObjectId(params.author.id),
        name: params.author.name,
        email: params.author.email,
      },
      snapshot: cleanSnapshot,
      summary: params.summary ?? `Restored as draft from version ${params.restoredFromVersion}`,
    };
    if (params.session) {
      const res = await Revision.create([doc], { session: params.session });
      return res[0];
    }
    return Revision.create(doc);
  }

  // Content change check against the most recent revision.
  const contentChanged = hasContentChanged(
    params.entityType,
    snapshot,
    latestCreated.snapshot as Record<string, unknown>,
  );

  // Case 2: Content has NOT changed.
  if (!contentChanged) {
    // Sub-case 2A: Publishing directly after restore promotes the restored revision in-place.
    if (latestCreated.trigger === 'restore' && trigger === 'publish') {
      latestCreated.trigger = 'publish';
      latestCreated.summary = latestCreated.restoredFromVersion
        ? `Published (Restored from version ${latestCreated.restoredFromVersion})`
        : 'Published restored version';
      latestCreated.snapshot = cleanSnapshot;
      await latestCreated.save({ session: params.session });
      return latestCreated;
    }

    // Sub-case 2B: Unpublishing an entity (transition from published to draft).
    // An unpublish is a deliberate lifecycle transition that must be recorded in history even if content is unchanged.
    if (trigger === 'unpublish') {
      // Deduplicate if already recorded as unpublish
      if (latestCreated.trigger === 'unpublish') {
        return latestCreated;
      }

      const majorVersion = latestCreated.majorVersion;
      const minorVersion = latestCreated.minorVersion + 1;
      const version = `${majorVersion}.${minorVersion}`;

      const doc = {
        siteId: siteObjectId,
        entityType: params.entityType,
        entityId: entityObjectId,
        majorVersion,
        minorVersion,
        version,
        restoredFromVersion: null,
        trigger: 'unpublish' as const,
        author: {
          id: new Types.ObjectId(params.author.id),
          name: params.author.name,
          email: params.author.email,
        },
        snapshot: cleanSnapshot,
        summary: params.summary ?? 'Unpublished to draft',
      };

      if (params.session) {
        const res = await Revision.create([doc], { session: params.session });
        return res[0];
      }
      return Revision.create(doc);
    }

    // Sub-case 2C: Latest revision is already published or restored.
    // If the editor clicks 'Publish' or 'Save Draft' again without altering content,
    // deduplicate and return the existing revision to avoid phantom version increments.
    if (latestCreated.trigger === 'publish' || latestCreated.trigger === 'restore') {
      return latestCreated;
    }

    // Sub-case 2B: Latest revision was a draft (e.g. 'create' or 'update') and the user is now PUBLISHING it.
    if (trigger === 'publish' || isPublishedSnapshot) {
      // If there were minor draft saves (e.g. v1.1 or v1.2), publish promotes it to the next major release (v2.0).
      if (latestCreated.minorVersion > 0) {
        const highestMajorRev = await Revision.findOne({
          siteId: siteObjectId,
          entityType: params.entityType,
          entityId: entityObjectId,
        })
          .session(params.session || null)
          .sort({ majorVersion: -1 })
          .exec();
        const currentMaxMajor = highestMajorRev?.majorVersion ?? 1;
        const majorVersion = currentMaxMajor + 1;
        const minorVersion = 0;
        const version = `${majorVersion}.${minorVersion}`;

        const doc = {
          siteId: siteObjectId,
          entityType: params.entityType,
          entityId: entityObjectId,
          majorVersion,
          minorVersion,
          version,
          restoredFromVersion: null,
          trigger: 'publish' as const,
          author: {
            id: new Types.ObjectId(params.author.id),
            name: params.author.name,
            email: params.author.email,
          },
          snapshot: cleanSnapshot,
          summary: params.summary ?? 'Published draft',
        };
        if (params.session) {
          const res = await Revision.create([doc], { session: params.session });
          return res[0];
        }
        return Revision.create(doc);
      } else {
        // It's v1.0 initial draft being published for the first time: update v1.0 in-place to 'publish'.
        latestCreated.trigger = 'publish';
        latestCreated.summary = params.summary ?? 'Published post';
        latestCreated.snapshot = cleanSnapshot;
        await latestCreated.save({ session: params.session });
        return latestCreated;
      }
    }

    // Sub-case 2C: User saved draft again with no changes: return existing draft without creating a new version.
    return latestCreated;
  }

  // Case 3: Content HAS changed.
  let majorVersion = 1;
  let minorVersion = 0;

  if (trigger === 'publish' || isPublishedSnapshot) {
    // Publishing new content bumps to the next major release milestone (e.g. v2.0, v3.0).
    const highestMajorRev = await Revision.findOne({
      siteId: siteObjectId,
      entityType: params.entityType,
      entityId: entityObjectId,
    })
      .session(params.session || null)
      .sort({ majorVersion: -1 })
      .exec();

    const currentMaxMajor = highestMajorRev?.majorVersion ?? 0;
    majorVersion = Math.max(1, currentMaxMajor + 1);
    minorVersion = 0;
    trigger = 'publish';
  } else {
    // Saving draft or unpublishing with changes increments the minor version under the current major branch (e.g. v1.1, v1.2, v2.1).
    const currentMajor = latestCreated.majorVersion ?? 1;
    const highestMinorRev = await Revision.findOne({
      siteId: siteObjectId,
      entityType: params.entityType,
      entityId: entityObjectId,
      majorVersion: currentMajor,
    })
      .session(params.session || null)
      .sort({ minorVersion: -1 })
      .exec();

    const currentMaxMinor = highestMinorRev?.minorVersion ?? 0;
    majorVersion = currentMajor;
    minorVersion = currentMaxMinor + 1;
    trigger = params.trigger === 'unpublish' ? 'unpublish' : 'update';
  }

  // Format composite semantic version string.
  const version = `${majorVersion}.${minorVersion}`;

  // Persist the new revision record.
  const finalDoc = {
    siteId: siteObjectId,
    entityType: params.entityType,
    entityId: entityObjectId,
    majorVersion,
    minorVersion,
    version,
    restoredFromVersion: params.restoredFromVersion ?? null,
    trigger: trigger as RevisionTrigger,
    author: {
      id: new Types.ObjectId(params.author.id),
      name: params.author.name,
      email: params.author.email,
    },
    snapshot: cleanSnapshot,
    summary:
      trigger === 'unpublish'
        ? (params.summary && params.summary !== 'Unpublished to draft'
            ? params.summary
            : 'Unpublished to draft with content changes')
        : params.summary ?? (trigger === 'publish' ? 'Published changes' : 'Draft save'),
  };

  if (params.session) {
    const res = await Revision.create([finalDoc], { session: params.session });
    return res[0];
  }
  return Revision.create(finalDoc);
}

// Restores a historical revision as an unpublished draft (clearing publishedAt) inside a transaction.
export async function restoreRevision(
  revisionId: string,
  siteId: string,
  user: AuthenticatedUser,
): Promise<{ restoredRevision: IRevision; entity: unknown }> {
  await connectToDatabase();

  const result = await runInTransaction(async (session) => {
    // Enforce tenant site isolation: Must match both revision _id and the active tenant siteId.
    const revision = await Revision.findOne({
      _id: revisionId,
      siteId: new Types.ObjectId(siteId),
    })
      .session(session || null)
      .exec();

    if (!revision) {
      throw notFound('Revision');
    }

    const snapshot = revision.snapshot as Record<string, unknown>;
    const restoredFromVersion = String(revision.version);

    // Branch A: Blog Entity Restoration.
    if (revision.entityType === 'blog') {
      const existing = await Blog.findOne({
        _id: revision.entityId,
        siteId: new Types.ObjectId(siteId),
      })
        .session(session || null)
        .exec();

      if (!existing) throw notFound('Blog');

      // Referential integrity & site boundary check:
      // Verify that historical author reference still exists and belongs to the active tenant site.
      if (snapshot.authorId) {
        await assertBlogAuthorIsUsable({
          authorId: String(snapshot.authorId),
          siteId,
          blogStatus: 'draft',
        });
      }

      const previousStatus = existing.status;
      const previousSlug = existing.slug;
      const contentChanged = hasContentChanged(
        'blog',
        existing.toObject() as unknown as Record<string, unknown>,
        snapshot,
      );

      // Guard: If already an unpublished draft, content is identical, and latest revision is already this version
      const latestRev = await Revision.findOne({
        siteId: new Types.ObjectId(siteId),
        entityType: 'blog',
        entityId: existing._id,
      })
        .session(session || null)
        .sort({ createdAt: -1, _id: -1 })
        .exec();

      if (
        previousStatus === 'draft' &&
        !contentChanged &&
        latestRev &&
        (latestRev.restoredFromVersion === restoredFromVersion || latestRev.version === restoredFromVersion)
      ) {
        return {
          restoredRevision: latestRev,
          entity: existing,
          previousStatus,
          previousSlug,
          entityType: 'blog' as const,
          slug: existing.slug,
          id: existing._id.toString(),
        };
      }

      // Re-sanitize HTML and re-render server-side HTML snapshot with code syntax highlighting.
      const content = sanitizeBlogHtml(String(snapshot.content ?? ''));
      const rendered = await renderBlogSnapshot(content);

      // Prepare update payload: restore historical content AS DRAFT without publishing as side effect.
      // Clear publishedAt so a restored draft does not retain stale publication timestamps upon future publishing.
      const updatePayload: Record<string, unknown> = {
        ...snapshot,
        content,
        rendered,
        status: 'draft',
        updatedBy: new Types.ObjectId(user.id),
      };
      delete updatePayload._id;
      delete updatePayload.siteId;
      delete updatePayload.createdAt;
      delete updatePayload.updatedAt;
      delete updatePayload.createdBy;
      delete updatePayload.__v;

      // Apply restored properties and commit to MongoDB within transaction.
      existing.set(updatePayload);
      existing.set('publishedAt', undefined);
      await existing.save({ session });

      // Create a new milestone revision document recording this restoration event.
      const newRevision = await createRevisionSnapshot({
        siteId,
        entityType: 'blog',
        entityId: existing._id,
        author: user,
        snapshot: existing.toObject() as unknown as RevisionSnapshot,
        trigger: 'restore',
        restoredFromVersion,
        summary: `Restored as draft from version ${restoredFromVersion}`,
        session,
      });

      // Write persistent audit trail entry.
      await logAudit({
        siteId,
        actor: user,
        entityType: 'blog',
        entityId: existing._id.toString(),
        entityTitle: existing.title,
        action: 'restore',
        details: {
          restoredFromVersion,
          newVersion: newRevision.version,
        },
        session,
      });

      return {
        restoredRevision: newRevision,
        entity: existing,
        previousStatus,
        previousSlug,
        entityType: 'blog' as const,
        slug: existing.slug,
        id: existing._id.toString(),
      };
    } else if (revision.entityType === 'event') {
      // Branch B: Event Entity Restoration.
      const existing = await Event.findOne({
        _id: revision.entityId,
        siteId: new Types.ObjectId(siteId),
      })
        .session(session || null)
        .exec();

      if (!existing) throw notFound('Event');

      const previousStatus = existing.status;
      const previousSlug = existing.slug;
      const contentChanged = hasContentChanged(
        'event',
        existing.toObject() as unknown as Record<string, unknown>,
        snapshot,
      );

      const latestRev = await Revision.findOne({
        siteId: new Types.ObjectId(siteId),
        entityType: 'event',
        entityId: existing._id,
      })
        .session(session || null)
        .sort({ createdAt: -1, _id: -1 })
        .exec();

      if (
        previousStatus === 'draft' &&
        !contentChanged &&
        latestRev &&
        (latestRev.restoredFromVersion === restoredFromVersion || latestRev.version === restoredFromVersion)
      ) {
        return {
          restoredRevision: latestRev,
          entity: existing,
          previousStatus,
          previousSlug,
          entityType: 'event' as const,
          slug: existing.slug,
          id: existing._id.toString(),
        };
      }

      // Clean rich text description.
      const content = sanitizeBlogHtml(String(snapshot.content ?? ''));
      const updatePayload: Record<string, unknown> = {
        ...snapshot,
        content,
        status: 'draft',
        updatedBy: new Types.ObjectId(user.id),
      };
      delete updatePayload._id;
      delete updatePayload.siteId;
      delete updatePayload.createdAt;
      delete updatePayload.updatedAt;
      delete updatePayload.createdBy;
      delete updatePayload.__v;

      existing.set(updatePayload);
      existing.set('publishedAt', undefined);
      await existing.save({ session });

      // Create the restored milestone revision document.
      const newRevision = await createRevisionSnapshot({
        siteId,
        entityType: 'event',
        entityId: existing._id,
        author: user,
        snapshot: existing.toObject() as unknown as RevisionSnapshot,
        trigger: 'restore',
        restoredFromVersion,
        summary: `Restored as draft from version ${restoredFromVersion}`,
        session,
      });

      // Write persistent audit trail entry.
      await logAudit({
        siteId,
        actor: user,
        entityType: 'event',
        entityId: existing._id.toString(),
        entityTitle: existing.title,
        action: 'restore',
        details: {
          restoredFromVersion,
          newVersion: newRevision.version,
        },
        session,
      });

      return {
        restoredRevision: newRevision,
        entity: existing,
        previousStatus,
        previousSlug,
        entityType: 'event' as const,
        slug: existing.slug,
        id: existing._id.toString(),
      };
    }

    throw notFound('Entity');
  });

  // External effects execute strictly after successful database commit.
  if (result.previousStatus === 'publish') {
    // Notify using the pre-restore slug that was live before the restore so consumer caches are purged.
    const liveSlug = result.previousSlug || result.slug;
    if (result.entityType === 'blog') {
      invalidateRelatedPosts(siteId);
      notifySiteWebhook(siteId, {
        type: 'content.unpublished',
        contentType: 'post',
        slug: liveSlug,
        id: result.id,
      });
    } else if (result.entityType === 'event') {
      notifySiteWebhook(siteId, {
        type: 'content.unpublished',
        contentType: 'event',
        slug: liveSlug,
        id: result.id,
      });
    }
  }

  return { restoredRevision: result.restoredRevision, entity: result.entity };
}
