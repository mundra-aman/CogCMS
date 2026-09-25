export const WORDS_PER_MINUTE = 238;

export interface ReadingStats {
  wordCount: number;
  readingTime: number;
}

/** Count authored visible text without counting HTML markup. */
export function getReadingStats(html: string): ReadingStats {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = text ? text.split(' ').filter(Boolean).length : 0;
  return {
    wordCount,
    readingTime: wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
  };
}
