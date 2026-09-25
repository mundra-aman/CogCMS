export function buildArticleJsonLd(input: {
  title: string;
  description: string;
  imageUrl?: string;
  url: string;
  datePublished: string;
  dateModified: string;
  authorName: string;
  publisher?: { name: string; url: string; logoUrl?: string };
}) {
  const publisher = input.publisher;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: { '@type': 'Person', name: input.authorName },
    publisher: {
      '@type': 'Organization',
      name: publisher?.name ?? 'CogNerd',
      ...(publisher ? { url: publisher.url } : {}),
      ...(publisher?.logoUrl ? { logo: { '@type': 'ImageObject', url: publisher.logoUrl } } : {}),
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
  };
}

export function buildFaqJsonLd(faqs: { question: string; answer: string }[]) {
  if (!faqs || faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export function buildBreadcrumbJsonLd(
  siteUrl: string,
  title: string,
  slug: string,
  options: { blogsPath?: string; label?: string } = {},
) {
  const origin = siteUrl.replace(/\/+$/, '');
  const blogsPath = `/${(options.blogsPath ?? '/blogs').replace(/^\/+|\/+$/g, '')}`;
  const blogUrl = `${origin}${blogsPath}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
      { '@type': 'ListItem', position: 2, name: options.label ?? 'Blog', item: blogUrl },
      { '@type': 'ListItem', position: 3, name: title, item: `${blogUrl}/${slug}` },
    ],
  };
}
