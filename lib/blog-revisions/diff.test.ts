import { describe, expect, it } from 'vitest';
import { diffFields, diffText, htmlToText, MAX_DIFF_CELLS } from '@/lib/blog-revisions/diff';
import { pickSnapshot, SNAPSHOT_FIELDS } from '@/lib/blog-revisions/snapshot';

const base = pickSnapshot({
  title: 'Old title',
  slug: 'post',
  content: '<p>Hello</p>',
  status: 'publish',
  tags: ['a'],
  isFeatured: false,
});

describe('diffFields', () => {
  it('lists only changed fields, with readable values', () => {
    const next = { ...base, title: 'New title', tags: ['a', 'b'], isFeatured: true };
    expect(diffFields(base, next, SNAPSHOT_FIELDS)).toEqual([
      { field: 'title', label: 'Title', from: 'Old title', to: 'New title' },
      { field: 'tags', label: 'Tags', from: 'a', to: 'a, b' },
      { field: 'isFeatured', label: 'Featured', from: 'No', to: 'Yes' },
    ]);
  });

  it('flags content without inlining it, and respects the field list', () => {
    const next = { ...base, content: '<p>Bye</p>', slug: 'moved' };
    expect(diffFields(base, next, ['content'])).toEqual([
      { field: 'content', label: 'Content', from: null, to: null },
    ]);
  });

  it('returns nothing for identical snapshots', () => {
    expect(diffFields(base, { ...base }, SNAPSHOT_FIELDS)).toEqual([]);
  });
});

describe('htmlToText', () => {
  it('drops tags and scripts, keeps paragraph breaks, decodes common entities', () => {
    expect(
      htmlToText('<h2>Intro</h2><p>Fish &amp; chips<br>today</p><script>x()</script><p>End</p>'),
    ).toBe('Intro\nFish & chips\ntoday\nEnd');
  });
});

describe('diffText', () => {
  const join = (type: string, segments: ReturnType<typeof diffText>) =>
    (segments ?? [])
      .filter((segment) => segment.type === type)
      .map((segment) => segment.text.trim())
      .join('|');

  it('marks removed and added words and keeps the rest', () => {
    const segments = diffText('the quick brown fox', 'the slow brown fox jumps');
    expect(join('removed', segments)).toBe('quick');
    expect(join('added', segments)).toBe('slow|jumps');
    expect(segments?.map((segment) => segment.text).join('')).toContain('brown fox');
  });

  it('reconstructs both texts exactly from the segments', () => {
    const before = 'one two three four five';
    const after = 'one 2 three five six';
    const segments = diffText(before, after)!;
    const rebuild = (skip: string) =>
      segments
        .filter((s) => s.type !== skip)
        .map((s) => s.text)
        .join('');
    expect(rebuild('added')).toBe(before);
    expect(rebuild('removed')).toBe(after);
  });

  it('is cheap for small edits in long texts (common prefix and suffix are trimmed)', () => {
    const long = Array.from({ length: 20_000 }, (_, i) => `w${i}`).join(' ');
    const edited = long.replace('w10000', 'changed');
    const segments = diffText(long, edited);
    expect(join('removed', segments)).toBe('w10000');
    expect(join('added', segments)).toBe('changed');
  });

  it('gives up instead of using unbounded memory on huge rewrites', () => {
    const size = Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 10;
    const a = Array.from({ length: size }, (_, i) => `a${i}`).join(' ');
    const b = Array.from({ length: size }, (_, i) => `b${i}`).join(' ');
    expect(diffText(a, b)).toBeNull();
  });
});
