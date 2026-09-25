import type { ResolvedSite } from '@/lib/site/context';

export type PublicPathKind = keyof ResolvedSite['publicPaths'];

function normalisePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') return '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    throw new Error('Public paths must use valid URL encoding');
  }
  if (
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    decoded.startsWith('//') ||
    decoded.includes('\\') ||
    decoded.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('Public paths must stay within the configured site origin');
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

/** Build a canonical public URL without leaking CMS route conventions. */
export function publicUrlFor(
  site: Pick<ResolvedSite, 'primaryDomain' | 'publicPaths'>,
  kind: PublicPathKind,
  slug?: string,
): string {
  const origin = new URL(site.primaryDomain).origin;
  const prefix = normalisePath(site.publicPaths[kind]);
  const cleanSlug = slug?.trim();
  let decodedSlug = cleanSlug;
  try {
    decodedSlug = cleanSlug ? decodeURIComponent(cleanSlug) : cleanSlug;
  } catch {
    throw new Error('Public URL slugs must use valid URL encoding');
  }
  if (
    cleanSlug &&
    (decodedSlug === '.' ||
      decodedSlug === '..' ||
      decodedSlug?.includes('/') ||
      decodedSlug?.includes('\\'))
  ) {
    throw new Error('Public URL slugs must be a single safe path segment');
  }
  const suffix = cleanSlug ? `/${encodeURIComponent(cleanSlug)}` : '';
  return `${origin}${prefix}${suffix}`;
}
