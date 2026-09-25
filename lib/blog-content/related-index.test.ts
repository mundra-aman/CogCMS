import { describe, expect, it, vi } from 'vitest';
import { RelatedPostIndex } from '@/lib/blog-content/related-index';
import type { BlogLike } from '@/lib/blog-content/related';

const row = (slug: string): BlogLike => ({
  slug,
  title: slug,
  status: 'publish',
  createdAt: '2026-09-01',
});

describe('related-post index', () => {
  it('caches each site for 60 seconds and supports mutation invalidation', async () => {
    const loader = vi.fn(async () => [row('a'), row('b')]);
    const index = new RelatedPostIndex(loader, 60_000);
    expect((await index.related('site-a', row('a'), 3, 1_000)).map((item) => item.slug)).toEqual([
      'b',
    ]);
    await index.related('site-a', row('a'), 3, 60_999);
    expect(loader).toHaveBeenCalledTimes(1);
    await index.related('site-a', row('a'), 3, 61_001);
    expect(loader).toHaveBeenCalledTimes(2);
    index.invalidate('site-a');
    await index.related('site-a', row('a'), 3, 61_002);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('keeps tenant indexes independent', async () => {
    const loader = vi.fn(async (siteId: string) => [row('current'), row(`${siteId}-related`)]);
    const index = new RelatedPostIndex(loader);
    expect((await index.related('one', row('current')))[0].slug).toBe('one-related');
    expect((await index.related('two', row('current')))[0].slug).toBe('two-related');
  });
});
