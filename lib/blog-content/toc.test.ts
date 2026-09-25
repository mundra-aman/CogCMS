import { describe, expect, it } from 'vitest';
import { applyTocOverrides } from '@/lib/blog-content/toc';

describe('TOC overrides', () => {
  it('renames, hides, and leaves unmatched entries alone', () => {
    const toc = [
      { id: 'intro', text: 'Introduction', level: 2 },
      { id: 'details', text: 'Details', level: 3 },
      { id: 'end', text: 'End', level: 2 },
    ];
    expect(
      applyTocOverrides(toc, [
        { id: 'intro', label: 'Start here' },
        { id: 'details', hidden: true },
        { id: 'missing', label: 'Ignored' },
      ]),
    ).toEqual([
      { id: 'intro', text: 'Start here', level: 2 },
      { id: 'end', text: 'End', level: 2 },
    ]);
  });
});
