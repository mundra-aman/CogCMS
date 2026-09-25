'use client';

import { useEffect, useMemo, useState } from 'react';
import { slugifyHeading, dedupeSlug } from '@/lib/blog-content/slugify';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { formatBlogHTML } from '@/lib/blog-content/format-blog-html';

export type TocOverride = { id: string; label?: string; hidden?: boolean };
type Heading = { id: string; text: string; level: 2 | 3 };

// Mirror the server transform's heading→id logic exactly (sanitize + format +
// slugify + dedupe in document order) so override ids match the rendered anchors.
function extractHeadings(html: string): Heading[] {
  if (!html || typeof window === 'undefined') return [];
  const normalized = formatBlogHTML(sanitizeBlogHtml(html));
  const doc = new DOMParser().parseFromString(normalized, 'text/html');
  const used = new Set<string>();
  const out: Heading[] = [];
  doc.querySelectorAll('h2, h3').forEach((el) => {
    const text = (el.textContent || '').trim();
    if (!text) return;
    const id = dedupeSlug(slugifyHeading(text), used);
    out.push({ id, text, level: el.tagName.toLowerCase() === 'h3' ? 3 : 2 });
  });
  return out;
}

export default function TocEditor({
  content,
  value,
  onChange,
}: {
  content: string;
  value: TocOverride[];
  onChange: (v: TocOverride[]) => void;
}) {
  // Debounce heading extraction: parse runs after typing settles (~250 ms),
  // not on every keystroke. First render computes immediately.
  const [headings, setHeadings] = useState<Heading[]>(() => extractHeadings(content));

  useEffect(() => {
    const id = setTimeout(() => setHeadings(extractHeadings(content)), 250);
    return () => clearTimeout(id);
  }, [content]);

  const byId = useMemo(() => new Map(value.map((o) => [o.id, o])), [value]);

  const update = (h: Heading, patch: Partial<TocOverride>) => {
    const merged = { ...(byId.get(h.id) ?? { id: h.id }), ...patch };
    const entry: TocOverride = { id: h.id };
    if (typeof merged.label === 'string' && merged.label !== h.text) entry.label = merged.label;
    if (merged.hidden) entry.hidden = true;
    const rest = value.filter((o) => o.id !== h.id);
    onChange(entry.label !== undefined || entry.hidden ? [...rest, entry] : rest);
  };

  if (headings.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Add H2 / H3 headings to your story — they appear here as your Table of Contents, where you
        can rename or hide each entry.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-gray-400">
        Uncheck to hide an entry from the Table of Contents, or edit the text to rename it. Links
        still point to the original heading.
      </p>
      {headings.map((h) => {
        const ov = byId.get(h.id);
        const hidden = ov?.hidden === true;
        const label = ov?.label ?? h.text;
        return (
          <div key={h.id} className={`flex items-center gap-2 ${h.level === 3 ? 'pl-5' : ''}`}>
            <input
              type="checkbox"
              checked={!hidden}
              onChange={(e) => update(h, { hidden: !e.target.checked })}
              title={hidden ? 'Hidden from TOC' : 'Shown in TOC'}
              className="accent-[#FF751F] flex-shrink-0"
            />
            <input
              value={label}
              onChange={(e) => update(h, { label: e.target.value })}
              disabled={hidden}
              placeholder={h.text}
              className={`flex-1 px-3 py-1.5 rounded-md border bg-gray-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 ${
                hidden ? 'opacity-40 line-through' : ''
              }`}
              style={{ borderColor: 'rgba(0,0,0,0.08)' }}
            />
          </div>
        );
      })}
    </div>
  );
}
