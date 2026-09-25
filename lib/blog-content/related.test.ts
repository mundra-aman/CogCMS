import { describe, it, expect } from 'vitest';
import { selectRelated, type BlogLike } from './related';

const mk = (slug: string, over: Partial<BlogLike> = {}): BlogLike => ({
  slug, title: slug, createdAt: '2026-01-01', status: 'publish', ...over,
});

describe('selectRelated', () => {
  it('honors pinned slugs first, in order', () => {
    const current = mk('a', { relatedSlugs: ['c', 'b'] });
    const all = [current, mk('b'), mk('c'), mk('d')];
    expect(selectRelated(current, all).map((r) => r.slug)).toEqual(['c', 'b', 'd']);
  });

  it('auto-fills by shared category/tags, most-shared first', () => {
    const current = mk('a', { category: 'eng', tags: ['ai'] });
    const all = [
      current,
      mk('b', { category: 'eng', tags: ['ai'] }), // 2 shared
      mk('c', { category: 'eng' }),               // 1 shared
      mk('d', { category: 'news' }),              // 0 shared
    ];
    expect(selectRelated(current, all).map((r) => r.slug)).toEqual(['b', 'c', 'd']);
  });

  it('excludes self and drafts', () => {
    const current = mk('a', { category: 'eng' });
    const all = [current, mk('b', { category: 'eng', status: 'draft' }), mk('c', { category: 'eng' })];
    expect(selectRelated(current, all).map((r) => r.slug)).toEqual(['c']);
  });

  it('caps at the limit', () => {
    const current = mk('a', { category: 'eng' });
    const all = [current, mk('b', { category: 'eng' }), mk('c', { category: 'eng' }),
      mk('d', { category: 'eng' }), mk('e', { category: 'eng' })];
    expect(selectRelated(current, all, 2)).toHaveLength(2);
  });
});
