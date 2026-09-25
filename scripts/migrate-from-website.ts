import { validateMigrationSite } from '@/scripts/migration/prepare';
import mongoose, { type Connection, type Model, Types } from 'mongoose';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Author from '@/models/Author';
import Blog from '@/models/Blog';
import FAQ from '@/models/FAQ';
import FAQSubmission from '@/models/FAQSubmission';
import NewsletterSubscriber from '@/models/NewsletterSubscriber';
import ReleaseNote from '@/models/ReleaseNote';
import Site from '@/models/Site';
import Whitepaper from '@/models/Whitepaper';
import { renderBlogSnapshot } from '@/lib/render/blog';
import {
  extractReleaseNoteBody,
  normalizeReleaseNotes,
  parseDateString,
  parseReleaseNoteFile,
} from '@/lib/release-notes-parser';
import {
  deterministicObjectId,
  parseFaqSeedJson,
  parseMigrationArgs,
  parseStaticWhitepaper,
  readMarkdownDirectory,
} from '@/scripts/migration/prepare';
import {
  MIGRATION_GROUPS,
  type MigrationCount,
  type MigrationGroup,
  type MigrationOptions,
  type MigrationResult,
} from '@/scripts/migration/types';

type Row = Record<string, any>;
type PreparedRow = { key: string; filter: Row; document: Row };
type PreparedGroups = Record<MigrationGroup, PreparedRow[]>;
type MongoHello = {
  topologyVersion?: { processId?: unknown };
  setName?: unknown;
  hosts?: unknown[];
  passives?: unknown[];
  arbiters?: unknown[];
  me?: unknown;
  primary?: unknown;
  msg?: unknown;
  serviceId?: unknown;
};

const SOURCE_COLLECTIONS: Record<Exclude<MigrationGroup, 'release-notes'>, string> = {
  authors: 'cognerd-authors',
  posts: 'cognerd-blogs',
  whitepapers: 'cognerd-whitepapers',
  faqs: 'cognerd-faqs',
  'faq-submissions': 'cognerd-faq-submissions',
  subscribers: 'cognerd-newsletter-subscribers',
};

const TARGET_COLLECTIONS: Record<MigrationGroup, string> = {
  authors: 'authors',
  posts: 'blogs',
  whitepapers: 'whitepapers',
  faqs: 'faqs',
  'faq-submissions': 'faq_submissions',
  subscribers: 'newsletter_subscribers',
  'release-notes': 'release_notes',
};

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function requiredText(value: unknown, label: string): string {
  const result = text(value).trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function objectId(value: unknown, label: string): Types.ObjectId {
  if (value instanceof Types.ObjectId) return value;
  if (typeof value === 'string' && Types.ObjectId.isValid(value)) return new Types.ObjectId(value);
  throw new Error(`${label} must be an ObjectId`);
}

function date(value: unknown, fallback: Date, label: string): Date {
  if (value === undefined) return fallback;
  if (
    !(value instanceof Date) &&
    !(
      (typeof value === 'string' && value.trim().length > 0) ||
      (typeof value === 'number' && Number.isFinite(value))
    )
  ) {
    throw new Error(`${label} must be a date`);
  }
  const result = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(result.getTime())) {
    throw new Error(`${label} must be a date`);
  }
  return result;
}

export function deploymentIdentityFromHello(hello: MongoHello | undefined): string | null {
  if (!hello) return null;
  const members = [...(hello.hosts ?? []), ...(hello.passives ?? []), ...(hello.arbiters ?? [])]
    .filter((value): value is string => typeof value === 'string')
    .sort();
  if (typeof hello.setName === 'string') {
    return members.length > 0 ? `replica:${hello.setName}:${members.join(',')}` : null;
  }

  // A mongos or load-balanced service is one router, not a stable cluster identity.
  if (hello.msg === 'isdbgrid' || hello.serviceId) return null;

  const processId = hello.topologyVersion?.processId;
  if (processId) return `process:${String(processId)}`;

  const server = hello.me ?? hello.primary;
  if (typeof server === 'string' && server) return `server:${server}`;
  return null;
}

async function deploymentIdentity(connection: Connection): Promise<string | null> {
  const hello = (await connection.db?.admin().command({ hello: 1 })) as MongoHello | undefined;
  return deploymentIdentityFromHello(hello);
}

function sourceCreatedAt(row: Row): Date {
  const id = objectId(row._id, 'source _id');
  return date(row.createdAt, id.getTimestamp(), 'createdAt');
}

function sourceUpdatedAt(row: Row, createdAt: Date): Date {
  return date(row.updatedAt, createdAt, 'updatedAt');
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function replaceSensitiveValue(message: string, value: string | undefined): string {
  if (!value) return message;
  let redacted = message.split(value).join('[redacted]');
  const authority = value.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1];
  const credentials = authority?.includes('@')
    ? authority.slice(0, authority.lastIndexOf('@'))
    : '';
  const password = credentials.includes(':') ? credentials.slice(credentials.indexOf(':') + 1) : '';
  for (const fragment of [credentials, password]) {
    if (fragment) redacted = redacted.split(fragment).join('[redacted]');
    try {
      const decoded = decodeURIComponent(fragment);
      if (decoded) redacted = redacted.split(decoded).join('[redacted]');
    } catch {
      // A malformed encoded credential is still covered by its literal form.
    }
  }
  return redacted;
}

function redactMigrationError(error: unknown, options: MigrationOptions): Error {
  const message = error instanceof Error ? error.message : String(error);
  const withoutUris = [options.sourceUri, options.targetUri].reduce(replaceSensitiveValue, message);
  return new Error(
    withoutUris.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]'),
  );
}

function publicationStatus(value: unknown): 'draft' | 'publish' {
  if (value === 'draft' || value === 'publish') return value;
  if (value === undefined || value === null || value === '') return 'publish';
  throw new Error(`Invalid publication status: ${String(value)}`);
}

function modelOn(connection: Connection, name: string, model: Model<any>): Model<any> {
  return connection.model(name, model.schema, model.collection.collectionName);
}

function targetModels(connection: Connection) {
  return {
    Site: modelOn(connection, 'MigrationSite', Site),
    Author: modelOn(connection, 'MigrationAuthor', Author),
    Blog: modelOn(connection, 'MigrationBlog', Blog),
    Whitepaper: modelOn(connection, 'MigrationWhitepaper', Whitepaper),
    FAQ: modelOn(connection, 'MigrationFAQ', FAQ),
    FAQSubmission: modelOn(connection, 'MigrationFAQSubmission', FAQSubmission),
    NewsletterSubscriber: modelOn(
      connection,
      'MigrationNewsletterSubscriber',
      NewsletterSubscriber,
    ),
    ReleaseNote: modelOn(connection, 'MigrationReleaseNote', ReleaseNote),
  };
}

async function validated(model: Model<any>, value: Row): Promise<Row> {
  const document = new model(value);
  await document.validate();
  return document.toObject({ depopulate: true, versionKey: false });
}

function preparedRow(group: MigrationGroup, document: Row): PreparedRow {
  if (
    group === 'authors' ||
    group === 'posts' ||
    group === 'whitepapers' ||
    group === 'release-notes'
  ) {
    return {
      key: String(document.slug),
      filter: { siteId: document.siteId, slug: document.slug },
      document,
    };
  }
  if (group === 'subscribers') {
    return {
      key: String(document.email),
      filter: { siteId: document.siteId, email: document.email },
      document,
    };
  }
  return {
    key: String(document._id),
    filter: { siteId: document.siteId, _id: document._id },
    document,
  };
}

function assertUnique(groups: PreparedGroups): void {
  for (const [group, rows] of Object.entries(groups)) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.key)) {
        const safeKey = group === 'subscribers' ? '[redacted]' : row.key;
        throw new Error(`Duplicate prepared ${group} key: ${safeKey}`);
      }
      seen.add(row.key);
    }
  }
}

async function assertTargetIdentitySafety(
  connection: Connection,
  groups: PreparedGroups,
  selected: readonly MigrationGroup[],
): Promise<void> {
  for (const group of selected) {
    const collection = connection.collection(TARGET_COLLECTIONS[group]);
    for (const row of groups[group]) {
      const matches = await collection
        .find(row.filter, { projection: { _id: 1 } })
        .limit(2)
        .toArray();
      if (matches.length > 1) {
        const safeKey = group === 'subscribers' ? '[redacted]' : row.key;
        throw new Error(`Target has duplicate ${group} key: ${safeKey}`);
      }
      if (matches.length === 1) continue;
      const identity = row.document._id;
      if (identity && (await collection.findOne({ _id: identity }, { projection: { _id: 1 } }))) {
        throw new Error(`Target ${group} identity conflicts with source: ${identity}`);
      }
    }
  }
}

async function writePreparedRow(
  connection: Connection,
  collectionName: string,
  row: PreparedRow,
): Promise<void> {
  const set = { ...row.document };
  const inserted = { _id: set._id, createdAt: set.createdAt };
  delete set._id;
  delete set.createdAt;
  delete set.__v;
  if (Object.prototype.hasOwnProperty.call(set, 'publishedAt')) {
    const existing = await connection
      .collection(collectionName)
      .findOne(row.filter, { projection: { publishedAt: 1 } });
    if (existing?.publishedAt) {
      delete set.publishedAt;
    } else if (!existing && set.publishedAt === null) {
      Object.assign(inserted, { publishedAt: null });
      delete set.publishedAt;
    }
  }
  await connection
    .collection(collectionName)
    .updateOne(row.filter, { $set: set, $setOnInsert: inserted }, { upsert: true });
}

async function prepareGroups(
  source: Connection,
  target: Connection,
  options: MigrationOptions,
  siteId: Types.ObjectId,
): Promise<{ groups: PreparedGroups; warnings: string[] }> {
  const models = targetModels(target);
  const selected = new Set(options.only);
  const groups = Object.fromEntries(
    options.only.map((group) => [group, []]),
  ) as unknown as PreparedGroups;
  for (const group of Object.keys(TARGET_COLLECTIONS) as MigrationGroup[]) {
    groups[group] ??= [];
  }
  const warnings: string[] = [];

  const sourcePosts = selected.has('posts')
    ? await source.collection(SOURCE_COLLECTIONS.posts).find().toArray()
    : [];
  const referencedAuthorIds = sourcePosts.flatMap((row) => {
    if (row.authorId instanceof Types.ObjectId) return [row.authorId];
    if (typeof row.authorId === 'string' && Types.ObjectId.isValid(row.authorId)) {
      return [new Types.ObjectId(row.authorId)];
    }
    return [];
  });
  const sourceAuthors = selected.has('authors')
    ? await source.collection(SOURCE_COLLECTIONS.authors).find().toArray()
    : selected.has('posts')
      ? await source
          .collection(SOURCE_COLLECTIONS.authors)
          .find({ _id: { $in: referencedAuthorIds } })
          .toArray()
      : [];
  const existingAuthors =
    selected.has('authors') || selected.has('posts')
      ? await target.collection('authors').find({ siteId }).toArray()
      : [];
  const targetAuthorBySlug = new Map(existingAuthors.map((row) => [String(row.slug), row._id]));
  const authorIdMap = new Map<string, Types.ObjectId>();

  for (const row of sourceAuthors) {
    const sourceId = objectId(row._id, 'author _id');
    const slug = requiredText(row.slug, `author ${sourceId} slug`);
    const targetId = objectId(
      targetAuthorBySlug.get(slug) ?? sourceId,
      `author ${slug} target _id`,
    );
    authorIdMap.set(sourceId.toString(), targetId);
    if (!selected.has('authors')) continue;
    const createdAt = sourceCreatedAt(row);
    const document = await validated(models.Author, {
      _id: targetId,
      siteId,
      name: requiredText(row.name, `author ${slug} name`),
      slug,
      role: text(row.role),
      bio: text(row.bio),
      avatarUrl: text(row.avatarUrl),
      socials: row.socials && typeof row.socials === 'object' ? row.socials : {},
      status: 'publish',
      publishedAt: createdAt,
      createdBy: null,
      updatedBy: null,
      createdAt,
      updatedAt: sourceUpdatedAt(row, createdAt),
    });
    groups.authors.push(preparedRow('authors', document));
  }

  if (selected.has('posts')) {
    for (const row of sourcePosts) {
      const id = objectId(row._id, 'post _id');
      const slug = requiredText(row.slug, `post ${id} slug`);
      const createdAt = sourceCreatedAt(row);
      const status = publicationStatus(row.status);
      let authorId: Types.ObjectId | null = null;
      if (row.authorId) {
        const sourceAuthorId = objectId(row.authorId, `post ${slug} authorId`);
        authorId = authorIdMap.get(sourceAuthorId.toString()) ?? null;
        if (!authorId) warnings.push(`Post ${slug} has a dangling author ${sourceAuthorId}`);
      }
      const content = requiredText(row.content, `post ${slug} content`);
      const updatedAt = sourceUpdatedAt(row, createdAt);
      const rendered = await renderBlogSnapshot(content);
      const document = await validated(models.Blog, {
        _id: id,
        siteId,
        title: requiredText(row.title, `post ${slug} title`),
        slug,
        excerpt: text(row.excerpt),
        content,
        imageUrl: text(row.imageUrl),
        tag: text(row.tag, 'Insights'),
        authorId,
        category: text(row.category),
        tags: stringArray(row.tags),
        faqs: Array.isArray(row.faqs) ? row.faqs : [],
        keyTakeaways: stringArray(row.keyTakeaways),
        relatedSlugs: stringArray(row.relatedSlugs),
        tocOverrides: Array.isArray(row.tocOverrides) ? row.tocOverrides : [],
        status,
        publishedAt: status === 'publish' ? createdAt : null,
        metaTitle: text(row.metaTitle),
        metaDescription: text(row.metaDescription),
        keywords: text(row.keywords),
        isFeatured: row.isFeatured === true,
        rendered: { ...rendered, renderedAt: updatedAt },
        createdBy: null,
        updatedBy: null,
        createdAt,
        updatedAt,
      });
      groups.posts.push(preparedRow('posts', document));
    }
  }

  if (selected.has('whitepapers')) {
    const dynamicRows = await source.collection(SOURCE_COLLECTIONS.whitepapers).find().toArray();
    const bySlug = new Map<string, Row>();
    const dynamicSlugs = new Set<string>();
    for (const row of dynamicRows) {
      const id = objectId(row._id, 'whitepaper _id');
      const slug = requiredText(row.slug, `whitepaper ${id} slug`);
      if (bySlug.has(slug)) throw new Error(`Duplicate source whitepaper slug: ${slug}`);
      dynamicSlugs.add(slug);
      const createdAt = sourceCreatedAt(row);
      const status = publicationStatus(row.status);
      bySlug.set(slug, {
        _id: id,
        siteId,
        title: requiredText(row.title, `whitepaper ${slug} title`),
        slug,
        description: text(row.description),
        date: text(row.date),
        author: text(row.author, 'CogNerd Research Team'),
        authorRole: text(row.authorRole),
        readTime: text(row.readTime),
        tags: stringArray(row.tags ?? row.tag),
        headline: text(row.headline),
        stat1Value: text(row.stat1Value),
        stat1Label: text(row.stat1Label),
        stat2Value: text(row.stat2Value),
        stat2Label: text(row.stat2Label),
        excerpt: text(row.excerpt),
        content: requiredText(row.content, `whitepaper ${slug} content`),
        imageUrl: text(row.imageUrl),
        tag: text(row.tag, 'Insights'),
        status,
        publishedAt: status === 'publish' ? createdAt : null,
        metaTitle: text(row.metaTitle),
        metaDescription: text(row.metaDescription),
        keywords: text(row.keywords),
        isFeatured: row.isFeatured === true,
        createdBy: null,
        updatedBy: null,
        createdAt,
        updatedAt: sourceUpdatedAt(row, createdAt),
      });
    }
    const staticFiles = await readMarkdownDirectory(options.whitepapersDirectory, 'Whitepaper');
    const staticSlugs = new Set<string>();
    for (const file of staticFiles) {
      const paper = parseStaticWhitepaper(file.raw, file.filename);
      if (staticSlugs.has(paper.slug)) {
        throw new Error(`Duplicate static whitepaper slug: ${paper.slug}`);
      }
      staticSlugs.add(paper.slug);
      if (dynamicSlugs.has(paper.slug)) {
        warnings.push(`Skipped static whitepaper ${paper.slug}; dynamic source takes precedence`);
        continue;
      }
      const createdAt = paper.date ? new Date(paper.date) : new Date(0);
      bySlug.set(paper.slug, {
        _id: deterministicObjectId(options.siteSlug, 'whitepaper', paper.slug),
        siteId,
        ...paper,
        date: paper.date ? createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        }) : '',
        publishedAt: createdAt,
        createdBy: null,
        updatedBy: null,
        createdAt,
        updatedAt: createdAt,
      });
    }
    for (const value of bySlug.values()) {
      groups.whitepapers.push(
        preparedRow('whitepapers', await validated(models.Whitepaper, value)),
      );
    }
  }

  if (selected.has('faqs')) {
    const sourceRows = await source.collection(SOURCE_COLLECTIONS.faqs).find().toArray();
    const hasExplicitSeed = options.faqSeedJson !== undefined;
    const rows: Row[] = hasExplicitSeed
      ? parseFaqSeedJson(options.faqSeedJson).map((row, index) => ({
          _id: deterministicObjectId(options.siteSlug, 'faq', String(index), row.question),
          ...row,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }))
      : sourceRows;
    if (hasExplicitSeed && sourceRows.length > 0) {
      warnings.push(
        `Explicit FAQ seed replaced ${sourceRows.length} source FAQ${sourceRows.length === 1 ? '' : 's'}`,
      );
    }
    for (const row of rows) {
      const id = objectId(row._id, 'FAQ _id');
      const createdAt = sourceCreatedAt(row);
      const document = await validated(models.FAQ, {
        _id: id,
        siteId,
        question: requiredText(row.question, `FAQ ${id} question`),
        answer: requiredText(row.answer, `FAQ ${id} answer`),
        category: text(row.category, 'General'),
        order: typeof row.order === 'number' && Number.isFinite(row.order) ? row.order : 0,
        status: 'publish',
        publishedAt: createdAt,
        createdBy: null,
        updatedBy: null,
        createdAt,
        updatedAt: sourceUpdatedAt(row, createdAt),
      });
      groups.faqs.push(preparedRow('faqs', document));
    }
  }

  if (selected.has('faq-submissions')) {
    const rows = await source.collection(SOURCE_COLLECTIONS['faq-submissions']).find().toArray();
    for (const row of rows) {
      const id = objectId(row._id, 'FAQ submission _id');
      const createdAt = sourceCreatedAt(row);
      if (!['pending', 'answered', 'dismissed'].includes(row.status ?? 'pending')) {
        throw new Error(`FAQ submission ${id} has an invalid status`);
      }
      const document = await validated(models.FAQSubmission, {
        _id: id,
        siteId,
        question: requiredText(row.question, `FAQ submission ${id} question`),
        email: text(row.email),
        name: text(row.name),
        status: row.status ?? 'pending',
        createdBy: null,
        updatedBy: null,
        createdAt,
        updatedAt: sourceUpdatedAt(row, createdAt),
      });
      groups['faq-submissions'].push(preparedRow('faq-submissions', document));
    }
  }

  if (selected.has('subscribers')) {
    const rows = await source.collection(SOURCE_COLLECTIONS.subscribers).find().toArray();
    for (const row of rows) {
      const id = objectId(row._id, 'subscriber _id');
      const createdAt = sourceCreatedAt(row);
      const email = requiredText(row.email, `subscriber ${id} email`).toLowerCase();
      const document = await validated(models.NewsletterSubscriber, {
        _id: id,
        siteId,
        email,
        source: text(row.source, 'footer'),
        submitCount:
          typeof row.submitCount === 'number' && row.submitCount >= 1 ? row.submitCount : 1,
        firstSubscribedAt: date(row.firstSubscribedAt, createdAt, 'firstSubscribedAt'),
        lastSubscribedAt: date(row.lastSubscribedAt, createdAt, 'lastSubscribedAt'),
        createdBy: null,
        updatedBy: null,
        createdAt,
        updatedAt: sourceUpdatedAt(row, createdAt),
      });
      groups.subscribers.push(preparedRow('subscribers', document));
    }
  }

  if (selected.has('release-notes')) {
    const files = await readMarkdownDirectory(options.releaseNotesDirectory, 'Release-note');
    const parsed = files.map(({ filename, raw }) => ({
      raw,
      note: parseReleaseNoteFile(raw, filename),
    }));
    for (const { note } of parsed) {
      if (note.date && !parseDateString(note.date)) {
        throw new Error(`Release note date is invalid: ${note.filename}`);
      }
    }
    const rawByFilename = new Map(parsed.map(({ raw, note }) => [note.filename, raw]));
    for (const note of normalizeReleaseNotes(parsed.map(({ note }) => note))) {
      const releaseDate = new Date(note.dateIso);
      if (Number.isNaN(releaseDate.getTime())) {
        throw new Error(`Release note date is invalid: ${note.filename}`);
      }
      const bodyMarkdown = extractReleaseNoteBody(rawByFilename.get(note.filename) ?? '');
      if (!bodyMarkdown.trim()) throw new Error(`Release note body is empty: ${note.filename}`);
      const document = await validated(models.ReleaseNote, {
        _id: deterministicObjectId(options.siteSlug, 'release-note', note.slug),
        siteId,
        version: requiredText(note.version, `release note ${note.filename} version`),
        slug: note.slug,
        releaseDate,
        bodyMarkdown,
        status: 'publish',
        publishedAt: releaseDate,
        createdBy: null,
        updatedBy: null,
        createdAt: releaseDate,
        updatedAt: releaseDate,
      });
      groups['release-notes'].push(preparedRow('release-notes', document));
    }
  }

  assertUnique(groups);
  return { groups, warnings };
}

export async function migrateFromWebsite(options: MigrationOptions): Promise<MigrationResult> {
  options = { ...options, ...validateMigrationSite(options) };
  let source: Connection | undefined;
  let target: Connection | undefined;
  const selected = new Set(options.only);
  const groupsToMigrate = MIGRATION_GROUPS.filter((group) => selected.has(group));
  const canonicalOptions = { ...options, only: groupsToMigrate };

  try {
    source = mongoose.createConnection(options.sourceUri, {
      bufferCommands: false,
      autoIndex: false,
    });
    target = mongoose.createConnection(options.targetUri, {
      dbName: options.targetDbName,
      bufferCommands: false,
      autoIndex: false,
    });
    await Promise.all([source.asPromise(), target.asPromise()]);
    if (source.name === target.name) {
      const [sourceDeployment, targetDeployment] = await Promise.all([
        deploymentIdentity(source),
        deploymentIdentity(target),
      ]);
      if (!sourceDeployment || !targetDeployment) {
        throw new Error(
          'Unable to prove source and target are different MongoDB deployments for the same database name',
        );
      }
      if (sourceDeployment === targetDeployment) {
        throw new Error('Source and target resolve to the same MongoDB database');
      }
    }
    const existingSite = await target.collection('sites').findOne({ slug: options.siteSlug });
    const siteId = existingSite?._id
      ? objectId(existingSite._id, 'target site _id')
      : deterministicObjectId('site', options.siteSlug);
    if (!existingSite && (await target.collection('sites').findOne({ _id: siteId }))) {
      throw new Error(`Target site identity conflicts with ${options.siteSlug}`);
    }
    const { groups, warnings } = await prepareGroups(source, target, canonicalOptions, siteId);
    await assertTargetIdentitySafety(target, groups, groupsToMigrate);

    if (!options.dryRun) {
      const now = new Date();
      const models = targetModels(target);
      const siteDocument = await validated(models.Site, {
        _id: siteId,
        name: options.siteName,
        slug: options.siteSlug,
        primaryDomain: options.siteOrigin,
        publicPaths: {
          blogs: '/blogs',
          whitepapers: '/whitepapers',
          faq: '/faq',
          releaseNotes: '/release-notes',
        },
        publisher: {
          name: options.siteName,
          url: options.siteOrigin,
          logoUrl: '',
        },
        defaultLocale: 'en',
        mediaPrefix: options.siteSlug,
        status: 'active',
        createdBy: null,
        createdAt: existingSite?.createdAt ?? now,
        updatedAt: existingSite?.updatedAt ?? now,
        ...existingSite,
      });
      await writePreparedRow(target, 'sites', {
        key: options.siteSlug,
        filter: { slug: options.siteSlug },
        document: siteDocument,
      });
      for (const group of groupsToMigrate) {
        for (const row of groups[group]) {
          await writePreparedRow(target, TARGET_COLLECTIONS[group], row);
        }
        if (group === 'faqs' && canonicalOptions.faqSeedJson !== undefined) {
          await target.collection(TARGET_COLLECTIONS.faqs).deleteMany({
            siteId,
            _id: { $nin: groups.faqs.map((row) => row.document._id) },
          });
        }
      }
    }

    const counts: MigrationCount[] = [];
    for (const group of groupsToMigrate) {
      const targetCount = await target
        .collection(TARGET_COLLECTIONS[group])
        .countDocuments({ siteId });
      const sourceCount = groups[group].length;
      counts.push({
        group,
        source: sourceCount,
        target: targetCount,
        match: options.dryRun ? true : sourceCount === targetCount,
      });
    }
    return {
      dryRun: options.dryRun,
      counts,
      warnings,
      matches: counts.every((row) => row.match),
    };
  } catch (error) {
    throw redactMigrationError(error, options);
  } finally {
    await Promise.allSettled([source?.close(), target?.close()]);
  }
}

async function main(): Promise<void> {
  const result = await migrateFromWebsite(parseMigrationArgs(process.argv.slice(2)));
  console.table(
    result.counts.map((row) => ({
      group: row.group,
      source: row.source,
      target: row.target,
      status: result.dryRun ? 'planned' : row.match ? 'match' : 'mismatch',
    })),
  );
  for (const warning of result.warnings) console.warn(`[migration] ${warning}`);
  if (!result.matches) process.exitCode = 1;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
