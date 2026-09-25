import { describe, it, expect } from 'vitest';
import { buildArticleJsonLd, buildFaqJsonLd, buildBreadcrumbJsonLd } from './jsonld';

describe('jsonld', () => {
  it('builds an Article object with author', () => {
    const a = buildArticleJsonLd({
      title: 'T',
      description: 'D',
      url: 'https://x/blogs/t',
      datePublished: '2026-01-01',
      dateModified: '2026-01-02',
      authorName: 'Jane',
    });
    expect(a['@type']).toBe('Article');
    expect((a as any).author.name).toBe('Jane');
    expect((a as any).headline).toBe('T');
  });

  it('uses the configured site publisher instead of a hardcoded organization', () => {
    const article = buildArticleJsonLd({
      title: 'T',
      description: 'D',
      url: 'https://acme.test/insights/t',
      datePublished: '2026-01-01',
      dateModified: '2026-01-02',
      authorName: 'Jane',
      publisher: {
        name: 'Acme Labs',
        url: 'https://acme.test',
        logoUrl: 'https://acme.test/logo.png',
      },
    }) as any;
    expect(article.publisher).toEqual({
      '@type': 'Organization',
      name: 'Acme Labs',
      url: 'https://acme.test',
      logo: { '@type': 'ImageObject', url: 'https://acme.test/logo.png' },
    });
  });

  it('builds FAQPage from faqs', () => {
    const f = buildFaqJsonLd([{ question: 'Q?', answer: 'A.' }]) as any;
    expect(f['@type']).toBe('FAQPage');
    expect(f.mainEntity[0].name).toBe('Q?');
    expect(f.mainEntity[0].acceptedAnswer.text).toBe('A.');
  });

  it('returns null for empty faqs', () => {
    expect(buildFaqJsonLd([])).toBeNull();
  });

  it('builds a breadcrumb', () => {
    const b = buildBreadcrumbJsonLd('https://x', 'T', 't') as any;
    expect(b['@type']).toBe('BreadcrumbList');
    expect(b.itemListElement).toHaveLength(3);
    expect(b.itemListElement[2].item).toBe('https://x/blogs/t');
  });

  it('uses a configured blog path in breadcrumbs', () => {
    const breadcrumb = buildBreadcrumbJsonLd('https://x', 'T', 't', {
      blogsPath: '/insights',
      label: 'Insights',
    }) as any;
    expect(breadcrumb.itemListElement[1]).toMatchObject({
      name: 'Insights',
      item: 'https://x/insights',
    });
    expect(breadcrumb.itemListElement[2].item).toBe('https://x/insights/t');
  });
});
