import Author from '@/models/Author';
import Blog from '@/models/Blog';
import { postResponseSchema } from '@/contracts/v1/post';
import {
  keywordList,
  serializeAuthor,
  serializePostCard,
  serializePostSummary,
} from '@/lib/api/v1/serializers';
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
} from '@/lib/blog-content/jsonld';
import { getRelatedPosts } from '@/lib/blog-content/related-index';
import { applyTocOverrides } from '@/lib/blog-content/toc';
import { apiJson, publishedFilter, withApiKey } from '@/lib/http/api-handler';
import { assertKnownQuery, commaList } from '@/lib/http/api-query';
import { notFound, validationError } from '@/lib/http/errors';
import { publicUrlFor } from '@/lib/site/urls';

export const dynamic = 'force-dynamic';
const ALLOWED_INCLUDES = new Set(['author', 'related', 'jsonLd', 'raw']);

export const GET = withApiKey<{ slug: string }>(
  'content:read',
  async (req, { auth, site, params }) => {
    assertKnownQuery(req.nextUrl.searchParams, ['include']);
    const includes = commaList(req.nextUrl.searchParams.get('include'));
    if (includes.some((value) => !ALLOWED_INCLUDES.has(value))) {
      throw validationError({ include: includes }, 'Invalid query');
    }
    const { slug } = await params;
    const post = await Blog.findOne({ ...publishedFilter(auth.siteId), slug }).exec();
    if (!post) throw notFound('Post');

    const needsAuthor = includes.includes('author') || includes.includes('jsonLd');
    const author =
      needsAuthor && post.authorId
        ? await Author.findOne({ ...publishedFilter(auth.siteId), _id: post.authorId }).exec()
        : null;
    const authorView = author ? serializeAuthor(author) : null;
    const canonical = publicUrlFor(site, 'blogs', post.slug);
    const related = includes.includes('related')
      ? (await getRelatedPosts(auth.siteId, post, 3)).map(serializePostCard)
      : undefined;
    const jsonLd = includes.includes('jsonLd')
      ? {
          article: buildArticleJsonLd({
            title: post.title,
            description: post.metaDescription || post.excerpt,
            imageUrl: post.imageUrl || undefined,
            url: canonical,
            datePublished: (post.publishedAt ?? post.createdAt).toISOString(),
            dateModified: post.updatedAt.toISOString(),
            authorName: author?.name ?? `${site.publisher.name} Team`,
            publisher: {
              name: site.publisher.name,
              url: site.publisher.url,
              logoUrl: site.publisher.logoUrl,
            },
          }),
          faq: buildFaqJsonLd(post.faqs),
          breadcrumb: buildBreadcrumbJsonLd(site.primaryDomain, post.title, post.slug, {
            blogsPath: site.publicPaths.blogs,
            label:
              site.publicPaths.blogs === '/blogs'
                ? 'Blog'
                : site.publicPaths.blogs.split('/').filter(Boolean).at(-1)?.replace(/-/g, ' ') ||
                  'Blog',
          }),
        }
      : undefined;

    const result = {
      ...serializePostSummary(post, includes.includes('author') ? authorView : undefined),
      renderedHtml: post.rendered.html,
      toc: applyTocOverrides(post.rendered.toc, post.tocOverrides),
      readingTime: { minutes: post.rendered.readingTime, words: post.rendered.wordCount },
      metaTitle: post.metaTitle ?? '',
      metaDescription: post.metaDescription ?? '',
      keywords: keywordList(post.keywords),
      keyTakeaways: [...post.keyTakeaways],
      faqs: post.faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
      urls: { canonical },
      ...(related ? { related } : {}),
      ...(jsonLd ? { jsonLd } : {}),
      ...(includes.includes('raw') ? { content: post.content } : {}),
    };
    return apiJson(req, postResponseSchema, { data: result });
  },
);
