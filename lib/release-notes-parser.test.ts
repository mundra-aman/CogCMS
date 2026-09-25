import { describe, expect, it } from 'vitest';
import {
  buildReleaseNoteMarkdown,
  extractReleaseNoteBody,
  normalizeReleaseNotes,
  parseDateInput,
  parseDateString,
  parseReleaseNoteFile,
} from './release-notes-parser';

describe('release notes parser', () => {
  const body = `Opening **summary**.

## New Features

### Site-aware publishing

- Publish safely
1. Verify the result`;

  it('round-trips the editable body separately from its generated header', () => {
    const markdown = buildReleaseNoteMarkdown('4.0', 'September 3, 2026', body);
    expect(extractReleaseNoteBody(markdown)).toBe(body);

    const parsed = parseReleaseNoteFile(markdown, 'version_4.0_20260903.md');
    expect(parsed).toMatchObject({
      version: '4.0',
      date: 'September 3, 2026',
      slug: 'v4-0',
      intro: ['Opening **summary**.'],
      sections: [
        {
          title: 'New Features',
          items: [
            { type: 'subheading', text: 'Site-aware publishing' },
            { type: 'bullet', text: 'Publish safely' },
            { type: 'numbered', text: 'Verify the result' },
          ],
        },
      ],
    });
  });

  it('rejects impossible date inputs and assigns stable collision suffixes', () => {
    expect(parseDateInput('2026-02-30')).toBeNull();
    const first = parseReleaseNoteFile(
      buildReleaseNoteMarkdown('4.0', 'September 3, 2026', body),
      'one.md',
    );
    const second = { ...first, filename: 'two.md' };
    expect(normalizeReleaseNotes([second, first]).map((note) => note.slug)).toEqual([
      'v4-0',
      'v4-0-2',
    ]);
  });

  it('rejects impossible human dates and normalizes date-only values to UTC', () => {
    expect(parseDateString('February 30, 2026')).toBeNull();
    expect(parseDateInput('2026-09-03')?.toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });
});
