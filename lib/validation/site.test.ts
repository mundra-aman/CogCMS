import { describe, expect, it } from 'vitest';
import { createSiteSchema, updateSiteSchema } from './site';

describe('site validation', () => {
  const valid = {
    name: 'CogNerd',
    slug: 'cognerd-website',
    primaryDomain: 'https://www.cognerd.ai/',
  };

  it('normalizes origins and supplies safe defaults', () => {
    const result = createSiteSchema.parse(valid);
    expect(result.primaryDomain).toBe('https://www.cognerd.ai');
    expect(result.status).toBe('active');
    expect(result.defaultLocale).toBe('en');
  });

  it('rejects non-kebab slugs and origins with paths', () => {
    expect(createSiteSchema.safeParse({ ...valid, slug: 'Cog Nerd' }).success).toBe(false);
    expect(
      createSiteSchema.safeParse({ ...valid, primaryDomain: 'https://example.com/blog' }).success,
    ).toBe(false);
    expect(
      createSiteSchema.safeParse({ ...valid, primaryDomain: 'https://user:pass@example.com' })
        .success,
    ).toBe(false);
  });

  it('rejects protocol-relative and dot-segment public paths', () => {
    expect(
      createSiteSchema.safeParse({ ...valid, publicPaths: { blogs: '//evil.example' } }).success,
    ).toBe(false);
    expect(
      createSiteSchema.safeParse({ ...valid, publicPaths: { blogs: '/safe/../admin' } }).success,
    ).toBe(false);
  });

  it('rejects server-owned and webhook fields', () => {
    expect(createSiteSchema.safeParse({ ...valid, createdBy: '0'.repeat(24) }).success).toBe(false);
    expect(createSiteSchema.safeParse({ ...valid, webhookSecret: 'secret' }).success).toBe(false);
  });

  it('requires at least one update field', () => {
    expect(updateSiteSchema.safeParse({}).success).toBe(false);
  });
});
