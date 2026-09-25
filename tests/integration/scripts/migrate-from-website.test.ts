import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { migrateFromWebsite } from '@/scripts/migrate-from-website';

const temporaryDirectories: string[] = [];
const connections: mongoose.Connection[] = [];

function databaseUri(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

async function connection(uri: string): Promise<mongoose.Connection> {
  const value = await mongoose.createConnection(uri).asPromise();
  connections.push(value);
  return value;
}

async function fixtures() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-phase-e-'));
  temporaryDirectories.push(root);
  const releaseNotesDirectory = path.join(root, 'release-notes');
  const whitepapersDirectory = path.join(root, 'whitepapers');
  await Promise.all([fs.mkdir(releaseNotesDirectory), fs.mkdir(whitepapersDirectory)]);
  await fs.writeFile(
    path.join(releaseNotesDirectory, 'version_4.0_20260903.md'),
    '# Release Notes\nVersion 4.0 | September 3, 2026\n\nFirst release.\n\n## Added\n\n- Migration.\n',
  );
  await fs.writeFile(
    path.join(whitepapersDirectory, 'guide.md'),
    '---\ntitle: Migration Guide\ndate: 2026-09-01\ntags: CMS, Migration\n---\n\n# Guide\n\nBody.\n',
  );
  return { releaseNotesDirectory, whitepapersDirectory };
}

afterEach(async () => {
  await Promise.all(connections.splice(0).map((item) => item.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('website migration', () => {
  it('keeps an undated static whitepaper display date blank across import and rerun', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_undated_${suffix}`);
    const targetDbName = `phase_e_undated_${suffix}`;
    await connection(sourceUri);
    const paths = await fixtures();
    await fs.writeFile(path.join(paths.whitepapersDirectory, 'guide.md'), '---\ntitle: Undated Guide\n---\n\n# Guide\n');
    const options = { sourceUri, targetUri: baseUri, targetDbName, siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
      dryRun: false, only: ['whitepapers'] as const, faqSeedJson: undefined, ...paths };
    await migrateFromWebsite(options);
    const target = await connection(databaseUri(baseUri, targetDbName));
    const first = await target.collection('whitepapers').findOne();
    expect(first).toMatchObject({ date: '', publishedAt: new Date(0), createdAt: new Date(0) });
    await migrateFromWebsite(options);
    expect(await target.collection('whitepapers').countDocuments()).toBe(1);
    expect(await target.collection('whitepapers').findOne()).toMatchObject({ _id: first!._id, date: '' });
  });

  it('dry-runs without writes, migrates every group, and reruns without identity drift', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_${suffix}`);
    const targetDbName = `phase_e_${suffix}`;
    const source = await connection(sourceUri);
    const authorId = new mongoose.Types.ObjectId();
    const danglingAuthorId = new mongoose.Types.ObjectId();
    const createdAt = new Date('2026-01-02T03:04:05.000Z');

    await Promise.all([
      source.collection('cognerd-authors').insertOne({
        _id: authorId,
        name: 'Ada',
        slug: 'ada',
        role: 'Editor',
        createdAt,
        updatedAt: createdAt,
      }),
      source.collection('cognerd-blogs').insertMany([
        {
          _id: new mongoose.Types.ObjectId(),
          title: 'Published',
          slug: 'published',
          excerpt: 'Excerpt',
          content: '<h2>Start</h2><p>Hello</p>',
          authorId,
          keywords: 'ai, cms',
          status: 'publish',
          createdAt,
          updatedAt: createdAt,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          title: 'Dangling',
          slug: 'dangling',
          content: '<p>Still migrates</p>',
          authorId: danglingAuthorId,
          status: 'draft',
          createdAt,
          updatedAt: createdAt,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          title: 'Empty after sanitizing',
          slug: 'empty-after-sanitizing',
          content: '<p></p>',
          status: 'publish',
          createdAt,
          updatedAt: createdAt,
        },
      ]),
      source.collection('cognerd-faqs').insertOne({
        _id: new mongoose.Types.ObjectId(),
        question: 'Question?',
        answer: 'Answer.',
        category: 'General',
        order: 1,
        createdAt,
        updatedAt: createdAt,
      }),
      source.collection('cognerd-faq-submissions').insertOne({
        _id: new mongoose.Types.ObjectId(),
        question: 'Submitted?',
        status: 'pending',
        createdAt,
        updatedAt: createdAt,
      }),
      source.collection('cognerd-newsletter-subscribers').insertOne({
        _id: new mongoose.Types.ObjectId(),
        email: ' Reader@Example.com ',
        source: 'footer',
        submitCount: 2,
        firstSubscribedAt: createdAt,
        lastSubscribedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      }),
    ]);
    const paths = await fixtures();
    const options = {
      sourceUri,
      targetUri: baseUri,
      targetDbName,
      siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
      dryRun: true,
      only: [
        'authors',
        'posts',
        'whitepapers',
        'faqs',
        'faq-submissions',
        'subscribers',
        'release-notes',
      ] as const,
      faqSeedJson: undefined,
      ...paths,
    };

    const dryRun = await migrateFromWebsite(options);
    expect(dryRun.matches).toBe(true);
    expect(dryRun.counts.map((row) => [row.group, row.source])).toEqual([
      ['authors', 1],
      ['posts', 3],
      ['whitepapers', 1],
      ['faqs', 1],
      ['faq-submissions', 1],
      ['subscribers', 1],
      ['release-notes', 1],
    ]);
    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('sites').countDocuments()).toBe(0);

    const first = await migrateFromWebsite({ ...options, dryRun: false });
    expect(first.matches).toBe(true);
    expect(await target.collection('sites').findOne({ slug: 'example-site' })).toMatchObject({
      name: 'Example Site', primaryDomain: 'https://www.example.com',
    });
    await target.collection('sites').updateOne({ slug: 'example-site' }, { $set: { name: 'Customized Site', primaryDomain: 'https://custom.example.com' } });
    await migrateFromWebsite({ ...options, dryRun: false });
    expect(await target.collection('sites').findOne({ slug: 'example-site' })).toMatchObject({
      name: 'Customized Site', primaryDomain: 'https://custom.example.com',
    });
    expect(first.warnings).toEqual([expect.stringMatching(/dangling.*author/i)]);
    const firstPosts = await target.collection('blogs').find().sort({ slug: 1 }).toArray();
    expect(firstPosts).toHaveLength(3);
    expect(firstPosts.find((row) => row.slug === 'published')).toMatchObject({
      authorId,
      publishedAt: createdAt,
      keywords: 'ai, cms',
      createdAt,
      createdBy: null,
      updatedBy: null,
    });
    expect(firstPosts.find((row) => row.slug === 'published')?.rendered.html).toContain('Start');
    expect(firstPosts.find((row) => row.slug === 'empty-after-sanitizing')?.rendered.html).toBe('');
    expect(firstPosts.find((row) => row.slug === 'dangling')?.authorId).toBeNull();
    expect(await target.collection('newsletter_subscribers').findOne()).toMatchObject({
      email: 'reader@example.com',
    });
    expect(await target.collection('release_notes').findOne()).toMatchObject({
      version: '4.0',
      sections: [{ title: 'Added', items: [{ type: 'bullet', text: 'Migration.' }] }],
    });
    expect(await target.collection('whitepapers').findOne()).toMatchObject({
      date: 'September 1, 2026',
      tag: 'CMS',
      keywords: '',
      publishedAt: new Date('2026-09-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    const identities = Object.fromEntries(
      firstPosts.map((row) => [
        row.slug,
        `${row._id}:${row.createdAt.toISOString()}:${row.rendered.renderedAt.toISOString()}`,
      ]),
    );
    const second = await migrateFromWebsite({ ...options, dryRun: false });
    expect(second.matches).toBe(true);
    const secondPosts = await target.collection('blogs').find().sort({ slug: 1 }).toArray();
    expect(
      Object.fromEntries(
        secondPosts.map((row) => [
          row.slug,
          `${row._id}:${row.createdAt.toISOString()}:${row.rendered.renderedAt.toISOString()}`,
        ]),
      ),
    ).toEqual(identities);
  });

  it('validates the complete static input before creating the target site', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_bad_${suffix}`);
    const targetDbName = `phase_e_bad_${suffix}`;
    await connection(sourceUri);
    const paths = await fixtures();
    await fs.writeFile(path.join(paths.whitepapersDirectory, 'bad.md'), '---\ntitle:\n---\n');

    await expect(
      migrateFromWebsite({
        sourceUri,
        targetUri: baseUri,
        targetDbName,
        siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
        dryRun: false,
        only: ['whitepapers'],
        faqSeedJson: undefined,
        ...paths,
      }),
    ).rejects.toThrow(/whitepaper/i);

    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('sites').countDocuments()).toBe(0);
  });

  it('uses FAQ fallback, prefers dynamic whitepapers, and writes selected groups only', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_selected_${suffix}`);
    const targetDbName = `phase_e_selected_${suffix}`;
    const source = await connection(sourceUri);
    const createdAt = new Date('2026-09-01T00:00:00.000Z');
    await source.collection('cognerd-whitepapers').insertOne({
      _id: new mongoose.Types.ObjectId(),
      title: 'Migration Guide',
      slug: 'migration-guide',
      content: '# Dynamic source',
      tags: 'AEO, GEO',
      status: 'publish',
      createdAt,
      updatedAt: createdAt,
    });
    const paths = await fixtures();

    const result = await migrateFromWebsite({
      sourceUri,
      targetUri: baseUri,
      targetDbName,
      siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
      dryRun: false,
      only: ['faqs', 'whitepapers'],
      faqSeedJson: JSON.stringify([{ question: 'Fallback?', answer: 'Yes.' }]),
      ...paths,
    });

    expect(result.matches).toBe(true);
    expect(result.warnings).toContain(
      'Skipped static whitepaper migration-guide; dynamic source takes precedence',
    );
    expect(result.counts.map((row) => [row.group, row.source])).toEqual([
      ['whitepapers', 1],
      ['faqs', 1],
    ]);
    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('whitepapers').findOne()).toMatchObject({
      slug: 'migration-guide',
      content: '# Dynamic source',
      tags: ['AEO', 'GEO'],
    });
    expect(await target.collection('faqs').findOne()).toMatchObject({
      question: 'Fallback?',
      answer: 'Yes.',
    });
    expect(await target.collection('blogs').countDocuments()).toBe(0);
  });

  it('treats an explicit FAQ seed as authoritative and removes stale target FAQs', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_faq_seed_${suffix}`);
    const targetDbName = `phase_e_faq_seed_${suffix}`;
    const source = await connection(sourceUri);
    const createdAt = new Date('2026-09-01T00:00:00.000Z');
    await source.collection('cognerd-faqs').insertOne({
      _id: new mongoose.Types.ObjectId(),
      question: 'Stale source FAQ?',
      answer: 'This was never published on the website.',
      category: 'General',
      order: 0,
      createdAt,
      updatedAt: createdAt,
    });

    const first = await migrateFromWebsite({
      sourceUri,
      targetUri: baseUri,
      targetDbName,
      siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
      dryRun: false,
      only: ['faqs'],
    });
    expect(first.matches).toBe(true);

    const seed = [
      { question: 'Canonical one?', answer: 'First.', category: 'Platform', order: 0 },
      { question: 'Canonical two?', answer: 'Second.', category: 'Strategy', order: 1 },
    ];
    const second = await migrateFromWebsite({
      sourceUri,
      targetUri: baseUri,
      targetDbName,
      siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
      dryRun: false,
      only: ['faqs'],
      faqSeedJson: JSON.stringify(seed),
    });

    expect(second).toMatchObject({
      matches: true,
      counts: [{ group: 'faqs', source: 2, target: 2, match: true }],
    });
    expect(second.warnings).toContain('Explicit FAQ seed replaced 1 source FAQ');
    const target = await connection(databaseUri(baseUri, targetDbName));
    const rows = await target
      .collection('faqs')
      .find({}, { projection: { _id: 0, question: 1 } })
      .sort({ order: 1 })
      .toArray();
    expect(rows).toEqual([{ question: 'Canonical one?' }, { question: 'Canonical two?' }]);
  });

  it('reports an existing target count mismatch and rejects a same-database configuration', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceDbName = `legacy_mismatch_${suffix}`;
    const sourceUri = databaseUri(baseUri, sourceDbName);
    const targetDbName = `phase_e_mismatch_${suffix}`;
    const source = await connection(sourceUri);
    const target = await connection(databaseUri(baseUri, targetDbName));
    const siteId = new mongoose.Types.ObjectId();
    await target.collection('sites').insertOne({
      _id: siteId,
      name: 'CogNerd Website',
      slug: 'example-site',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    await target.collection('blogs').insertOne({
      _id: new mongoose.Types.ObjectId(),
      siteId,
      slug: 'extra',
    });

    const mismatch = await migrateFromWebsite({
      sourceUri,
      targetUri: baseUri,
      targetDbName,
      siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
      dryRun: false,
      only: ['posts'],
    });
    expect(mismatch).toMatchObject({
      matches: false,
      counts: [{ group: 'posts', source: 0, target: 1, match: false }],
    });

    await expect(
      migrateFromWebsite({
        sourceUri,
        targetUri: baseUri,
        targetDbName: sourceDbName,
        siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
        dryRun: false,
        only: ['posts'],
      }),
    ).rejects.toThrow(/same MongoDB database/);

    const aliasedTarget = new URL(baseUri);
    aliasedTarget.hostname = aliasedTarget.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
    await expect(
      migrateFromWebsite({
        sourceUri,
        targetUri: aliasedTarget.toString(),
        targetDbName: sourceDbName,
        siteSlug: 'example-site-alias',
        siteName: 'Example Site',
        siteOrigin: 'https://www.example.com',
        dryRun: false,
        only: ['posts'],
      }),
    ).rejects.toThrow(/same MongoDB database/);
    expect(await source.collection('sites').countDocuments({ slug: 'example-site-alias' })).toBe(
      0,
    );
  });

  it('rejects duplicate dynamic whitepaper slugs before creating the target site', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_duplicate_${suffix}`);
    const targetDbName = `phase_e_duplicate_${suffix}`;
    const source = await connection(sourceUri);
    const createdAt = new Date('2026-09-01T00:00:00.000Z');
    await source.collection('cognerd-whitepapers').insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        title: 'First',
        slug: 'duplicate',
        content: '# First',
        createdAt,
        updatedAt: createdAt,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: 'Second',
        slug: 'duplicate',
        content: '# Second',
        createdAt,
        updatedAt: createdAt,
      },
    ]);
    const paths = await fixtures();

    await expect(
      migrateFromWebsite({
        sourceUri,
        targetUri: baseUri,
        targetDbName,
        siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
        dryRun: false,
        only: ['whitepapers'],
        faqSeedJson: undefined,
        ...paths,
      }),
    ).rejects.toThrow(/duplicate source whitepaper slug/i);

    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('sites').countDocuments()).toBe(0);
  });

  it('rejects duplicate static whitepaper slugs before creating the target site', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_static_duplicate_${suffix}`);
    const targetDbName = `phase_e_static_duplicate_${suffix}`;
    await connection(sourceUri);
    const paths = await fixtures();
    await fs.writeFile(
      path.join(paths.whitepapersDirectory, 'guide-copy.md'),
      '---\ntitle: Migration Guide\ndate: 2026-09-02\n---\n\n# Duplicate\n',
    );

    await expect(
      migrateFromWebsite({
        sourceUri,
        targetUri: baseUri,
        targetDbName,
        siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
        dryRun: false,
        only: ['whitepapers'],
        faqSeedJson: undefined,
        ...paths,
      }),
    ).rejects.toThrow(/duplicate static whitepaper slug/i);

    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('sites').countDocuments()).toBe(0);
  });

  it('rejects malformed explicit timestamps before creating the target site', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_timestamp_${suffix}`);
    const targetDbName = `phase_e_timestamp_${suffix}`;
    const source = await connection(sourceUri);
    await source.collection('cognerd-blogs').insertOne({
      _id: new mongoose.Types.ObjectId(),
      title: 'Bad time',
      slug: 'bad-time',
      content: '<p>Body</p>',
      createdAt: null,
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    await expect(
      migrateFromWebsite({
        sourceUri,
        targetUri: baseUri,
        targetDbName,
        siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
        dryRun: false,
        only: ['posts'],
      }),
    ).rejects.toThrow(/createdAt must be a date/);

    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('sites').countDocuments()).toBe(0);
  });

  it('rejects an invalid explicit release-note date instead of using a fallback date', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_release_date_${suffix}`);
    const targetDbName = `phase_e_release_date_${suffix}`;
    await connection(sourceUri);
    const paths = await fixtures();
    await fs.writeFile(
      path.join(paths.releaseNotesDirectory, 'version_9.9_20260903.md'),
      '# Release Notes\nVersion 9.9 | Definitely not a date\n\n## Added\n\n- Invalid.\n',
    );

    await expect(
      migrateFromWebsite({
        sourceUri,
        targetUri: baseUri,
        targetDbName,
        siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
        dryRun: false,
        only: ['release-notes'],
        ...paths,
      }),
    ).rejects.toThrow(/release note date is invalid.*version_9\.9_20260903\.md/i);

    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('sites').countDocuments()).toBe(0);
  });

  it('preserves a valid author relationship across posts-only then authors-only runs', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_partial_author_${suffix}`);
    const targetDbName = `phase_e_partial_author_${suffix}`;
    const source = await connection(sourceUri);
    const authorId = new mongoose.Types.ObjectId();
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    await Promise.all([
      source.collection('cognerd-authors').insertOne({
        _id: authorId,
        name: 'Ada',
        slug: 'ada',
        createdAt,
        updatedAt: createdAt,
      }),
      source.collection('cognerd-blogs').insertOne({
        _id: new mongoose.Types.ObjectId(),
        title: 'Partial migration',
        slug: 'partial-migration',
        content: '<p>Body</p>',
        authorId,
        status: 'publish',
        createdAt,
        updatedAt: createdAt,
      }),
    ]);

    const options = {
      sourceUri,
      targetUri: baseUri,
      targetDbName,
      siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
      dryRun: false,
    } as const;
    const postsOnly = await migrateFromWebsite({ ...options, only: ['posts'] });
    expect(postsOnly.warnings).toEqual([]);

    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('blogs').findOne({ slug: 'partial-migration' })).toMatchObject({
      authorId,
    });
    expect(await target.collection('authors').countDocuments()).toBe(0);

    await migrateFromWebsite({ ...options, only: ['authors'] });
    expect(await target.collection('authors').findOne({ _id: authorId })).toMatchObject({
      slug: 'ada',
    });
    expect(await target.collection('blogs').findOne({ slug: 'partial-migration' })).toMatchObject({
      authorId,
    });
  });

  it('does not erase first-publication timestamps when a source row returns to draft', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_publication_time_${suffix}`);
    const targetDbName = `phase_e_publication_time_${suffix}`;
    const source = await connection(sourceUri);
    const postId = new mongoose.Types.ObjectId();
    const whitepaperId = new mongoose.Types.ObjectId();
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    await Promise.all([
      source.collection('cognerd-blogs').insertOne({
        _id: postId,
        title: 'Published post',
        slug: 'published-post',
        content: '<p>Body</p>',
        status: 'publish',
        createdAt,
        updatedAt: createdAt,
      }),
      source.collection('cognerd-whitepapers').insertOne({
        _id: whitepaperId,
        title: 'Published paper',
        slug: 'published-paper',
        content: '# Body',
        status: 'publish',
        createdAt,
        updatedAt: createdAt,
      }),
    ]);
    const paths = await fixtures();
    const options = {
      sourceUri,
      targetUri: baseUri,
      targetDbName,
      siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
      dryRun: false,
      only: ['posts', 'whitepapers'] as const,
      ...paths,
    };

    await migrateFromWebsite(options);
    await Promise.all([
      source.collection('cognerd-blogs').updateOne({ _id: postId }, { $set: { status: 'draft' } }),
      source
        .collection('cognerd-whitepapers')
        .updateOne({ _id: whitepaperId }, { $set: { status: 'draft' } }),
    ]);
    await migrateFromWebsite(options);

    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('blogs').findOne({ _id: postId })).toMatchObject({
      status: 'draft',
      publishedAt: createdAt,
    });
    expect(await target.collection('whitepapers').findOne({ _id: whitepaperId })).toMatchObject({
      status: 'draft',
      publishedAt: createdAt,
    });
  });

  it('redacts credential-bearing MongoDB URIs from connection errors', async () => {
    const sentinel = 'MONGO_SENTINEL_4c7b';
    let message = '';
    try {
      await migrateFromWebsite({
        sourceUri: `mongodb://user:${sentinel}@127.0.0.1:1/?serverSelectionTimeoutMS=250`,
        targetUri: inject('mongoUri'),
        targetDbName: 'phase_e_redaction',
        siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
        dryRun: true,
        only: ['posts'],
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBeTruthy();
    expect(message).not.toContain(sentinel);
  });

  it('rejects target identity collisions before creating the migration site', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_collision_${suffix}`);
    const targetDbName = `phase_e_collision_${suffix}`;
    const source = await connection(sourceUri);
    const target = await connection(databaseUri(baseUri, targetDbName));
    const authorId = new mongoose.Types.ObjectId();
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    await source.collection('cognerd-authors').insertOne({
      _id: authorId,
      name: 'Source Author',
      slug: 'source-author',
      createdAt,
      updatedAt: createdAt,
    });
    await target.collection('authors').insertOne({
      _id: authorId,
      siteId: new mongoose.Types.ObjectId(),
      name: 'Other Author',
      slug: 'other-author',
    });

    await expect(
      migrateFromWebsite({
        sourceUri,
        targetUri: baseUri,
        targetDbName,
        siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
        dryRun: false,
        only: ['authors'],
      }),
    ).rejects.toThrow(/identity conflicts/);
    expect(await target.collection('sites').countDocuments()).toBe(0);
  });

  it('redacts duplicate subscriber email identities from migration errors', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_subscriber_duplicate_${suffix}`);
    const targetDbName = `phase_e_subscriber_duplicate_${suffix}`;
    const source = await connection(sourceUri);
    await source.collection('cognerd-newsletter-subscribers').insertMany([
      { _id: new mongoose.Types.ObjectId(), email: 'Person@example.test' },
      { _id: new mongoose.Types.ObjectId(), email: ' person@example.test ' },
    ]);

    let message = '';
    try {
      await migrateFromWebsite({
        sourceUri,
        targetUri: baseUri,
        targetDbName,
        siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
        dryRun: false,
        only: ['subscribers'],
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/duplicate prepared subscribers key/i);
    expect(message).not.toMatch(/person@example\.test/i);
    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('sites').countDocuments()).toBe(0);
  });

  it('does not validate unrelated authors when only FAQs are selected', async () => {
    const baseUri = inject('mongoUri');
    const suffix = Math.random().toString(16).slice(2);
    const sourceUri = databaseUri(baseUri, `legacy_faq_only_${suffix}`);
    const targetDbName = `phase_e_faq_only_${suffix}`;
    const source = await connection(sourceUri);
    await Promise.all([
      source.collection('cognerd-authors').insertOne({
        _id: new mongoose.Types.ObjectId(),
        name: 'Unused malformed author',
      }),
      source.collection('cognerd-faqs').insertOne({
        _id: new mongoose.Types.ObjectId(),
        question: 'Selected?',
        answer: 'Yes.',
      }),
    ]);

    const result = await migrateFromWebsite({
      sourceUri,
      targetUri: baseUri,
      targetDbName,
      siteSlug: 'example-site', siteName: 'Example Site', siteOrigin: 'https://www.example.com',
      dryRun: false,
      only: ['faqs'],
    });

    expect(result).toMatchObject({
      matches: true,
      counts: [{ group: 'faqs', source: 1, target: 1, match: true }],
    });
    const target = await connection(databaseUri(baseUri, targetDbName));
    expect(await target.collection('faqs').countDocuments()).toBe(1);
  });
});
