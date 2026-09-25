import { describe, expect, it } from 'vitest';
import { getReadingStats, WORDS_PER_MINUTE } from './reading-time';

describe('getReadingStats', () => {
  it('counts visible words and rounds up at 238 words per minute', () => {
    const words = Array.from({ length: WORDS_PER_MINUTE + 1 }, (_, index) => `word${index}`);
    expect(getReadingStats(`<p>${words.join(' ')}</p>`)).toEqual({
      wordCount: WORDS_PER_MINUTE + 1,
      readingTime: 2,
    });
  });

  it('does not count markup or common entities as extra words', () => {
    expect(getReadingStats('<h2>Hello&nbsp;world</h2><p>Rock &amp; roll</p>')).toEqual({
      wordCount: 5,
      readingTime: 1,
    });
  });

  it.each(['', '<p><br></p>', '<div></div>'])('returns zero for empty visible content', (html) => {
    expect(getReadingStats(html)).toEqual({ wordCount: 0, readingTime: 0 });
  });
});
