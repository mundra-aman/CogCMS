import { describe, expect, it } from 'vitest';
import { GET as listPosts } from '@/app/api/v1/posts/route';
import { GET as getPost } from '@/app/api/v1/posts/[slug]/route';
import Author from '@/models/Author';
import Blog from '@/models/Blog';
import { createTestSite, createTestUser } from '@/tests/setup/factories';
import { issueTestApiKey, publicApiRequest } from '@/tests/setup/public-api';

const rootContext = { params: Promise.resolve({}) };
const rendered = {
  html: '<h2 id="intro">Intro</h2><h3 id="secret">Secret</h3>',
  toc: [
    { id: 'intro', text: 'Intro', level: 2 },
    { id: 'secret', text: 'Secret', level: 3 },
  ],
  wordCount: 240,
  readingTime: 2,
  pipelineVersion: 1,
  renderedAt: new Date('2026-09-01T00:00:00.000Z'),
};

describe('v1 posts', () => {
  it('filters and projects published list results, validates queries, and returns 304', async () => {
    const user = await createTestUser();
    const [site, other] = await Promise.all([createTestSite(), createTestSite()]);
    const key = await issueTestApiKey(site, user);
    const author = await Author.create({
      siteId: site._id,
      name: 'Ada',
      slug: 'ada',
      status: 'publish',
    });
    await Blog.create({
      siteId: site._id,
      title: 'Newest',
      slug: 'newest',
      content: '<p>Body</p>',
      excerpt: 'New',
      rendered,
      status: 'publish',
      authorId: author._id,
      tag: 'AI',
      category: 'Engineering',
      tags: ['AI'],
      isFeatured: true,
      publishedAt: new Date('2026-09-03'),
    });
    await Blog.create({
      siteId: site._id,
      title: 'Older',
      slug: 'older',
      content: '<p>Body</p>',
      excerpt: 'Old',
      rendered,
      status: 'publish',
      tag: 'News',
      publishedAt: new Date('2026-09-01'),
    });
    await Blog.create({
      siteId: site._id,
      title: 'Draft',
      slug: 'draft',
      content: '<p>Draft</p>',
      rendered,
      status: 'draft',
    });
    await Blog.create({
      siteId: other._id,
      title: 'Other',
      slug: 'other',
      content: '<p>Other</p>',
      rendered,
      status: 'publish',
    });

    const response = await listPosts(
      publicApiRequest(
        'http://localhost:3003/api/v1/posts?tag=AI&featured=true&include=author',
        key,
      ),
      rootContext,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ slug: 'newest', author: { slug: 'ada' } });
    expect(body.data[0]).not.toHaveProperty('content');
    expect(body.data[0]).not.toHaveProperty('rendered');
    expect(body.data[0]).not.toHaveProperty('siteId');

    const slugs = await listPosts(
      publicApiRequest('http://localhost:3003/api/v1/posts?fields=slugs&sort=publishedAt', key),
      rootContext,
    );
    const slugBody = await slugs.json();
    expect(slugBody.data.map((item: { slug: string }) => item.slug)).toEqual(['older', 'newest']);
    expect(Object.keys(slugBody.data[0]).sort()).toEqual(['slug', 'updatedAt']);

    for (const query of [
      'limit=101',
      'featured=yes',
      'sort=title',
      'fields=raw',
      'include=related',
      'unknown=1',
    ]) {
      const invalid = await listPosts(
        publicApiRequest(`http://localhost:3003/api/v1/posts?${query}`, key),
        rootContext,
      );
      expect(invalid.status, query).toBe(400);
    }

    const etag = response.headers.get('etag')!;
    const unchanged = await listPosts(
      publicApiRequest(
        'http://localhost:3003/api/v1/posts?tag=AI&featured=true&include=author',
        key,
        { headers: { 'if-none-match': etag } },
      ),
      rootContext,
    );
    expect(unchanged.status).toBe(304);
  });

  it('returns full opt-in expansions with site-aware JSON-LD and never returns drafts or another site', async () => {
    const user = await createTestUser();
    const site = await createTestSite({
      primaryDomain: 'https://acme.example.com',
      publicPaths: {
        blogs: '/insights',
        whitepapers: '/papers',
        faq: '/faq',
        releaseNotes: '/releases',
      },
      publisher: {
        name: 'Acme Labs',
        url: 'https://acme.example.com',
        logoUrl: 'https://acme.example.com/logo.png',
      },
    });
    const other = await createTestSite();
    const key = await issueTestApiKey(site, user);
    const author = await Author.create({
      siteId: site._id,
      name: 'Ada',
      slug: 'ada',
      status: 'publish',
    });
    await Blog.create({
      siteId: site._id,
      title: 'Current',
      slug: 'current',
      excerpt: 'Excerpt',
      content: '<p>Raw source</p>',
      rendered,
      status: 'publish',
      authorId: author._id,
      tag: 'AI',
      category: 'Engineering',
      tags: ['AI'],
      relatedSlugs: ['pinned'],
      tocOverrides: [
        { id: 'intro', label: 'Start here' },
        { id: 'secret', hidden: true },
      ],
      faqs: [{ question: 'Why?', answer: 'Because.' }],
      keyTakeaways: ['One'],
      metaTitle: 'Meta title',
      metaDescription: 'Meta description',
      keywords: 'ai, cms, ai',
      isFeatured: true,
    });
    await Blog.create({
      siteId: site._id,
      title: 'Pinned',
      slug: 'pinned',
      excerpt: '',
      metaDescription: 'Pinned metadata fallback',
      content: '<p>Pinned</p>',
      rendered,
      status: 'publish',
      category: 'Other',
    });
    await Blog.create({
      siteId: site._id,
      title: 'Auto',
      slug: 'auto',
      excerpt: 'Explicit related excerpt',
      metaDescription: 'Unused metadata description',
      content: '<p>Auto</p>',
      rendered,
      status: 'publish',
      category: 'Engineering',
      tags: ['AI'],
    });
    await Blog.create({
      siteId: site._id,
      title: 'Draft related',
      slug: 'draft-related',
      content: '<p>Draft</p>',
      rendered,
      status: 'draft',
      category: 'Engineering',
    });
    await Blog.create({
      siteId: other._id,
      title: 'Current elsewhere',
      slug: 'current',
      content: '<p>Elsewhere</p>',
      rendered,
      status: 'publish',
    });

    const response = await getPost(
      publicApiRequest(
        'http://localhost:3003/api/v1/posts/current?include=author,related,jsonLd,raw',
        key,
      ),
      { params: Promise.resolve({ slug: 'current' }) },
    );
    expect(response.status).toBe(200);
    const post = (await response.json()).data;
    expect(post).toMatchObject({
      slug: 'current',
      content: '<p>Raw source</p>',
      renderedHtml: rendered.html,
      readingTime: { minutes: 2, words: 240 },
      author: { name: 'Ada' },
      toc: [{ id: 'intro', text: 'Start here', level: 2 }],
      urls: { canonical: 'https://acme.example.com/insights/current' },
      keywords: ['ai', 'cms'],
    });
    expect(post.related.map((item: { slug: string }) => item.slug)).toEqual(['pinned', 'auto']);
    expect(post.related).toMatchObject([
      { slug: 'pinned', excerpt: 'Pinned metadata fallback' },
      { slug: 'auto', excerpt: 'Explicit related excerpt' },
    ]);
    expect(post.jsonLd.article.publisher.name).toBe('Acme Labs');
    expect(post.jsonLd.breadcrumb.itemListElement[1].item).toBe(
      'https://acme.example.com/insights',
    );
    expect(post).not.toHaveProperty('siteId');
    expect(post).not.toHaveProperty('relatedSlugs');
    expect(post).not.toHaveProperty('tocOverrides');

    const noAuthorResponse = await getPost(
      publicApiRequest('http://localhost:3003/api/v1/posts/pinned?include=jsonLd', key),
      { params: Promise.resolve({ slug: 'pinned' }) },
    );
    expect(((await noAuthorResponse.json()).data.jsonLd.article as any).author.name).toBe(
      'Acme Labs Team',
    );

    const draft = await getPost(
      publicApiRequest('http://localhost:3003/api/v1/posts/draft-related', key),
      { params: Promise.resolve({ slug: 'draft-related' }) },
    );
    expect(draft.status).toBe(404);
  });
});
