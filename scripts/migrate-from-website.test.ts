import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deploymentIdentityFromHello } from '@/scripts/migrate-from-website';
import {
  deterministicObjectId,
  parseFaqSeedJson,
  parseMigrationArgs,
  parseStaticWhitepaper,
  readMarkdownDirectory,
} from '@/scripts/migration/prepare';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('MongoDB deployment identity', () => {
  it('uses replica-set identity before per-process identity', () => {
    const first = deploymentIdentityFromHello({
      topologyVersion: { processId: 'member-a' },
      setName: 'rs0',
      hosts: ['mongo-b:27017', 'mongo-a:27017'],
    });
    const second = deploymentIdentityFromHello({
      topologyVersion: { processId: 'member-b' },
      setName: 'rs0',
      hosts: ['mongo-a:27017', 'mongo-b:27017'],
    });

    expect(first).toBe('replica:rs0:mongo-a:27017,mongo-b:27017');
    expect(second).toBe(first);
  });

  it('does not treat a single mongos process as a deployment identity', () => {
    expect(
      deploymentIdentityFromHello({
        msg: 'isdbgrid',
        topologyVersion: { processId: 'router-a' },
      }),
    ).toBeNull();
  });

  it('fails closed when replica-set membership is unavailable', () => {
    expect(
      deploymentIdentityFromHello({
        setName: 'rs0',
        topologyVersion: { processId: 'member-a' },
      }),
    ).toBeNull();
  });
});

const env = {
  SOURCE_MONGODB_URI: 'mongodb://source.example/legacy',
  MONGODB_URI: 'mongodb://target.example',
  MONGODB_DB_NAME: 'cognerd_cms_phase_e',
  RELEASE_NOTES_DIR: 'C:/fixtures/releases',
  WHITEPAPERS_DIR: 'C:/fixtures/whitepapers',
  MIGRATION_SITE_SLUG: 'example-site',
  MIGRATION_SITE_NAME: 'Example Site',
  MIGRATION_SITE_ORIGIN: 'https://www.example.com',
};

describe('migrate-from-website arguments and preparation', () => {
  it('parses defaults and the frozen flag set', () => {
    expect(parseMigrationArgs([], env)).toMatchObject({
      sourceUri: env.SOURCE_MONGODB_URI,
      targetUri: env.MONGODB_URI,
      targetDbName: env.MONGODB_DB_NAME,
      siteSlug: 'example-site',
      siteName: 'Example Site',
      siteOrigin: 'https://www.example.com',
      dryRun: false,
      only: [
        'authors',
        'posts',
        'whitepapers',
        'faqs',
        'faq-submissions',
        'subscribers',
        'release-notes',
      ],
    });

    expect(
      parseMigrationArgs(['--dry-run', '--site=other-site', '--only', 'posts,authors'], env),
    ).toMatchObject({
      siteSlug: 'other-site',
      dryRun: true,
      only: ['authors', 'posts'],
    });
  });

  it('rejects missing configuration and unknown or malformed flags', () => {
    expect(() => parseMigrationArgs([], { ...env, MIGRATION_SITE_SLUG: '' })).toThrow(/site/i);
    expect(() => parseMigrationArgs([], { ...env, MIGRATION_SITE_NAME: '' })).toThrow(/MIGRATION_SITE_NAME/);
    expect(() => parseMigrationArgs([], { ...env, MIGRATION_SITE_ORIGIN: 'https://user:pass@example.com/path' })).toThrow(/origin/i);
    expect(() => parseMigrationArgs([], { ...env, SOURCE_MONGODB_URI: '' })).toThrow(
      /SOURCE_MONGODB_URI/,
    );
    expect(() => parseMigrationArgs(['--wat'], env)).toThrow(/Unknown argument/);
    expect(() => parseMigrationArgs(['--only', 'posts,nope'], env)).toThrow(/Unknown group/);
    expect(() => parseMigrationArgs(['--site'], env)).toThrow(/requires a value/);
  });

  it('uses stable ObjectIds and parses FAQ fallback JSON strictly', () => {
    expect(deterministicObjectId('site', 'cognerd-website').toString()).toBe(
      deterministicObjectId('site', 'cognerd-website').toString(),
    );
    expect(deterministicObjectId('site', 'cognerd-website').toString()).not.toBe(
      deterministicObjectId('site', 'other').toString(),
    );
    expect(
      parseFaqSeedJson(
        JSON.stringify([{ question: '  What? ', answer: ' Because. ', category: ' General ' }]),
      ),
    ).toEqual([{ question: 'What?', answer: 'Because.', category: 'General', order: 0 }]);
    expect(() => parseFaqSeedJson('{"question":"not-an-array"}')).toThrow(/array/);
  });

  it('parses static whitepaper frontmatter while retaining Markdown content', () => {
    const parsed = parseStaticWhitepaper(
      [
        '---',
        'title: State of AI',
        'description: A field guide',
        'date: 2026-03-17',
        'author: CogNerd Research Team',
        'tags: AEO, GEO',
        'stat1Value: "68%"',
        '---',
        '',
        '# State of AI',
        '',
        'Body.',
      ].join('\n'),
      'state-of-ai.md',
    );

    expect(parsed).toMatchObject({
      title: 'State of AI',
      slug: 'state-of-ai',
      description: 'A field guide',
      date: '2026-03-17',
      tags: ['AEO', 'GEO'],
      tag: 'AEO',
      keywords: '',
      stat1Value: '68%',
      content: '# State of AI\n\nBody.',
      status: 'publish',
    });

    expect(() =>
      parseStaticWhitepaper(
        '---\ntitle: Impossible date\ndate: 2026-02-30\n---\n\n# Body\n',
        'impossible-date.md',
      ),
    ).toThrow(/date is invalid/i);
  });

  it('matches the legacy loaders by ignoring mixed-case Markdown extensions', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-phase-e-files-'));
    temporaryDirectories.push(directory);
    await Promise.all([
      fs.writeFile(path.join(directory, 'included.md'), '# Included'),
      fs.writeFile(path.join(directory, 'ignored.MD'), '# Ignored'),
    ]);

    await expect(readMarkdownDirectory(directory, 'Fixture')).resolves.toEqual([
      { filename: 'included.md', raw: '# Included' },
    ]);
  });
});
