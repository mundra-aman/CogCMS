export type BlogLike = {
  slug: string;
  title: string;
  imageUrl?: string;
  category?: string;
  tags?: string[];
  createdAt: string | Date;
  status?: string;
  relatedSlugs?: string[];
};

function time(d: string | Date): number {
  return new Date(d).getTime();
}

function sharedScore(a: BlogLike, b: BlogLike): number {
  let score = 0;
  if (a.category && b.category && a.category === b.category) score += 1;
  const at = new Set(a.tags ?? []);
  for (const t of b.tags ?? []) if (at.has(t)) score += 1;
  return score;
}

export function selectRelated(current: BlogLike, all: BlogLike[], limit = 3): BlogLike[] {
  const bySlug = new Map(all.map((b) => [b.slug, b]));
  const eligible = (b: BlogLike) => b.slug !== current.slug && b.status !== 'draft';
  const result: BlogLike[] = [];
  const seen = new Set<string>([current.slug]);

  // Pinned first, in order
  for (const slug of current.relatedSlugs ?? []) {
    const b = bySlug.get(slug);
    if (b && eligible(b) && !seen.has(slug)) {
      result.push(b);
      seen.add(slug);
    }
  }

  // Auto-fill by shared score desc, then recency desc
  const auto = all
    .filter((b) => eligible(b) && !seen.has(b.slug))
    .map((b) => ({ b, score: sharedScore(current, b) }))
    .sort((x, y) => y.score - x.score || time(y.b.createdAt) - time(x.b.createdAt));

  for (const { b } of auto) {
    if (result.length >= limit) break;
    result.push(b);
    seen.add(b.slug);
  }

  return result.slice(0, limit);
}
