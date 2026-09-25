import { describe, it, expect } from 'vitest';
import { blogInputSchema } from './blog';

describe('blogInputSchema', () => {
  it('accepts a minimal valid blog', () => {
    const r = blogInputSchema.safeParse({ title: 'T', slug: 't', content: '<p>x</p>' });
    expect(r.success).toBe(true);
  });

  it('rejects missing title', () => {
    const r = blogInputSchema.safeParse({ slug: 't', content: '<p>x</p>' });
    expect(r.success).toBe(false);
  });

  it.each(['bad/slug', 'bad\\slug', 'nested%2fescape', 'Bad Slug'])(
    'rejects unsafe slug %s',
    (slug) => {
      const r = blogInputSchema.safeParse({ title: 'T', slug, content: '<p>x</p>' });
      expect(r.success).toBe(false);
    },
  );

  it('rejects a malformed author id', () => {
    const r = blogInputSchema.safeParse({
      title: 'T',
      slug: 't',
      content: '<p>x</p>',
      authorId: 'not-an-object-id',
    });
    expect(r.success).toBe(false);
  });

  it('coerces and validates structured fields', () => {
    const r = blogInputSchema.safeParse({
      title: 'T',
      slug: 't',
      content: '<p>x</p>',
      tags: ['a', 'b'],
      faqs: [{ question: 'q', answer: 'a' }],
      keyTakeaways: ['k'],
      relatedSlugs: ['other'],
    });
    expect(r.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const r = blogInputSchema.safeParse({
      title: 'T',
      slug: 't',
      content: '<p>x</p>',
      evil: 'x',
    });
    expect(r.success).toBe(true);
    expect((r as any).data.evil).toBeUndefined();
  });
});
