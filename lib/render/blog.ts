import { formatBlogHTML } from '@/lib/blog-content/format-blog-html';
import { transformBlogHtml } from '@/lib/blog-content/transform';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { getReadingStats } from '@/lib/render/reading-time';
import { PIPELINE_VERSION } from '@/lib/render/version';

export interface RenderedBlogSnapshot {
  html: string;
  toc: Array<{ id: string; text: string; level: number }>;
  wordCount: number;
  readingTime: number;
  pipelineVersion: number;
  renderedAt: Date;
}

/** Build the consumer-safe snapshot while leaving the raw source as the editorial authority. */
export async function renderBlogSnapshot(content: string): Promise<RenderedBlogSnapshot> {
  const sanitized = sanitizeBlogHtml(content);
  const formatted = formatBlogHTML(sanitized);
  const transformed = await transformBlogHtml(formatted);
  const stats = getReadingStats(formatted);

  return {
    html: transformed.html,
    toc: transformed.toc,
    wordCount: stats.wordCount,
    readingTime: stats.readingTime,
    pipelineVersion: PIPELINE_VERSION,
    renderedAt: new Date(),
  };
}
