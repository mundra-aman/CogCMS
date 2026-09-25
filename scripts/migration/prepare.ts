import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Types } from 'mongoose';
import { parseDateString } from '@/lib/release-notes-parser';
import {
  MIGRATION_GROUPS,
  type FaqSeed,
  type MigrationGroup,
  type MigrationOptions,
  type StaticWhitepaper,
} from '@/scripts/migration/types';

type Environment = Record<string, string | undefined>;

function requiredEnvironment(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionValue(argv: string[], index: number, name: string): [string, number] {
  const inline = argv[index].startsWith(`${name}=`) ? argv[index].slice(name.length + 1) : null;
  if (inline !== null) {
    if (!inline.trim()) throw new Error(`${name} requires a value`);
    return [inline, index];
  }
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return [value, index + 1];
}

function parseGroups(value: string): MigrationGroup[] {
  const groups = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (groups.length === 0) throw new Error('--only requires at least one group');
  for (const group of groups) {
    if (!MIGRATION_GROUPS.includes(group as MigrationGroup)) {
      throw new Error(`Unknown group: ${group}`);
    }
  }
  const selected = new Set(groups as MigrationGroup[]);
  return MIGRATION_GROUPS.filter((group) => selected.has(group));
}

export function parseMigrationArgs(
  argv: string[],
  env: Environment = process.env,
): MigrationOptions {
  let siteSlug = env.MIGRATION_SITE_SLUG?.trim().toLowerCase() ?? '';
  let dryRun = false;
  let only: MigrationGroup[] = [...MIGRATION_GROUPS];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      dryRun = true;
    } else if (argument === '--site' || argument.startsWith('--site=')) {
      const [value, consumed] = optionValue(argv, index, '--site');
      siteSlug = value.trim().toLowerCase();
      index = consumed;
    } else if (argument === '--only' || argument.startsWith('--only=')) {
      const [value, consumed] = optionValue(argv, index, '--only');
      only = parseGroups(value);
      index = consumed;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteSlug)) {
    throw new Error('--site must be a kebab-case site slug');
  }

  return {
    ...validateMigrationSite({
      siteSlug,
      siteName: requiredEnvironment(env, 'MIGRATION_SITE_NAME'),
      siteOrigin: requiredEnvironment(env, 'MIGRATION_SITE_ORIGIN'),
    }),
    sourceUri: requiredEnvironment(env, 'SOURCE_MONGODB_URI'),
    targetUri: requiredEnvironment(env, 'MONGODB_URI'),
    targetDbName: requiredEnvironment(env, 'MONGODB_DB_NAME'),
    dryRun,
    only,
    releaseNotesDirectory: env.RELEASE_NOTES_DIR?.trim() || undefined,
    whitepapersDirectory: env.WHITEPAPERS_DIR?.trim() || undefined,
    faqSeedJson: env.FAQ_SEED_JSON?.trim() || undefined,
  };
}

export function validateMigrationSite(site: Pick<MigrationOptions, 'siteSlug' | 'siteName' | 'siteOrigin'>) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site.siteSlug) || !site.siteName?.trim()) {
    throw new Error('An explicit site slug and name are required');
  }
  let origin: URL;
  try { origin = new URL(site.siteOrigin); } catch { throw new Error('MIGRATION_SITE_ORIGIN must be an HTTP(S) origin'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('MIGRATION_SITE_ORIGIN must be an HTTP(S) origin without credentials or a path');
  }
  return { siteSlug: site.siteSlug, siteName: site.siteName.trim(), siteOrigin: origin.origin };
}

export function deterministicObjectId(...parts: string[]): Types.ObjectId {
  const hex = createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);
  return new Types.ObjectId(hex);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a string`);
  return value.trim();
}

export function parseFaqSeedJson(value?: string): FaqSeed[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('FAQ_SEED_JSON must be valid JSON');
  }
  if (!Array.isArray(parsed)) throw new Error('FAQ_SEED_JSON must be an array');
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`FAQ_SEED_JSON[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    return {
      question: requiredText(row.question, `FAQ_SEED_JSON[${index}].question`),
      answer: requiredText(row.answer, `FAQ_SEED_JSON[${index}].answer`),
      category:
        typeof row.category === 'string' && row.category.trim() ? row.category.trim() : 'General',
      order: typeof row.order === 'number' && Number.isFinite(row.order) ? row.order : index,
    };
  });
}

function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  if (!slug) throw new Error('Static whitepaper title does not produce a slug');
  return slug;
}

function unquote(value: string): string {
  return value.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2');
}

export function parseStaticWhitepaper(raw: string, filename: string): StaticWhitepaper {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`Static whitepaper has no frontmatter: ${filename}`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    if (key) meta[key] = unquote(line.slice(colon + 1));
  }
  const title = requiredText(meta.title, `Static whitepaper title (${filename})`);
  const content = match[2].trim();
  if (!content) throw new Error(`Static whitepaper body is empty: ${filename}`);
  const date = meta.date?.trim() ?? '';
  if (date && !parseDateString(date)) {
    throw new Error(`Static whitepaper date is invalid: ${filename}`);
  }
  return {
    title,
    slug: slugFromTitle(title),
    description: meta.description ?? '',
    date,
    author: meta.author || 'CogNerd Research Team',
    authorRole: meta.authorRole ?? '',
    readTime: meta.readTime ?? '',
    tags: (meta.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    headline: meta.headline || title,
    stat1Value: meta.stat1Value ?? '',
    stat1Label: meta.stat1Label ?? '',
    stat2Value: meta.stat2Value ?? '',
    stat2Label: meta.stat2Label ?? '',
    excerpt: meta.excerpt ?? meta.description ?? '',
    content,
    imageUrl: meta.imageUrl ?? '',
    tag: meta.tag || (meta.tags ?? '').split(',').map((tag) => tag.trim()).find(Boolean) || 'Research',
    status: 'publish',
    metaTitle: meta.metaTitle ?? '',
    metaDescription: meta.metaDescription ?? meta.description ?? '',
    keywords: meta.keywords ?? '',
    isFeatured: meta.isFeatured === 'true',
  };
}

export async function readMarkdownDirectory(
  directory: string | undefined,
  label: string,
): Promise<{ filename: string; raw: string }[]> {
  if (!directory) throw new Error(`${label} directory is required`);
  const resolved = path.resolve(directory);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`${label} directory not found: ${resolved}`);
  const filenames = (await fs.readdir(resolved))
    .filter((filename) => filename.trimEnd().endsWith('.md'))
    .sort();
  return Promise.all(
    filenames.map(async (filename) => ({
      filename,
      raw: await fs.readFile(path.join(resolved, filename), 'utf8'),
    })),
  );
}
