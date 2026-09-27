import { Types } from 'mongoose';
import type { IBlogSnapshot } from '@/models/BlogRevision';
import { fieldKey } from './snapshot';

export const FIELD_LABELS: Record<keyof IBlogSnapshot, string> = {
  title: 'Title',
  slug: 'Slug',
  status: 'Status',
  excerpt: 'Excerpt',
  content: 'Content',
  imageUrl: 'Cover image',
  tag: 'Tag',
  category: 'Category',
  tags: 'Tags',
  authorId: 'Author',
  faqs: 'FAQs',
  keyTakeaways: 'Key takeaways',
  relatedSlugs: 'Related posts',
  tocOverrides: 'Table of contents',
  metaTitle: 'Meta title',
  metaDescription: 'Meta description',
  keywords: 'Keywords',
  isFeatured: 'Featured',
};

export type FieldChange = {
  field: keyof IBlogSnapshot;
  label: string;
  /** Short human-readable values; null for content, which gets a word diff instead. */
  from: string | null;
  to: string | null;
};

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return '(none)';
    if (value.every((item) => typeof item === 'string')) return value.join(', ');
    return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  }
  return String(value);
}

/** Lists the fields that differ between two snapshots, in the given field order. */
export function diffFields(
  from: IBlogSnapshot,
  to: IBlogSnapshot,
  fields: readonly (keyof IBlogSnapshot)[],
): FieldChange[] {
  return fields
    .filter((field) => fieldKey(from, field) !== fieldKey(to, field))
    .map((field) => ({
      field,
      label: FIELD_LABELS[field],
      from: field === 'content' ? null : display(from[field]),
      to: field === 'content' ? null : display(to[field]),
    }));
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Reduces stored HTML to readable text for comparison. This is for display only: the
 * result is rendered as React text (escaped), never as HTML.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|blockquote|tr|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export type DiffSegment = { type: 'same' | 'added' | 'removed'; text: string };

/** Above this many LCS cells (about 16 MB of Int32) the word diff is skipped. */
export const MAX_DIFF_CELLS = 4_000_000;

function tokenize(value: string): string[] {
  return value.split(/(\s+)/).filter((token) => token.length > 0);
}

function push(segments: DiffSegment[], type: DiffSegment['type'], token: string): void {
  const last = segments[segments.length - 1];
  if (last && last.type === type) last.text += token;
  else segments.push({ type, text: token });
}

/**
 * Word-level diff of two texts using a longest-common-subsequence table. The common
 * prefix and suffix are trimmed first, so a small edit in a long post stays cheap.
 * Returns null when the changed middle is too large to compare in memory.
 */
export function diffText(before: string, after: string): DiffSegment[] | null {
  const a = tokenize(before);
  const b = tokenize(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if ((midA.length + 1) * (midB.length + 1) > MAX_DIFF_CELLS) return null;

  // lcs[i][j] = length of the LCS of midA[i..] and midB[j..], stored flat.
  const width = midB.length + 1;
  const lcs = new Int32Array((midA.length + 1) * width);
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        midA[i] === midB[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  for (const token of a.slice(0, start)) push(segments, 'same', token);
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      push(segments, 'same', midA[i]);
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      push(segments, 'removed', midA[i]);
      i += 1;
    } else {
      push(segments, 'added', midB[j]);
      j += 1;
    }
  }
  while (i < midA.length) push(segments, 'removed', midA[i++]);
  while (j < midB.length) push(segments, 'added', midB[j++]);
  for (const token of a.slice(endA)) push(segments, 'same', token);
  return segments;
}
