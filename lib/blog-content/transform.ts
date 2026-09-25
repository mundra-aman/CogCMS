import { HTMLElement, parse } from 'node-html-parser';
import { slugifyHeading, dedupeSlug } from './slugify';
import { highlightCode } from './shiki';
import { decodeConfig } from './graphics/encode';
import { renderGraphic } from './graphics/render';

export type TocEntry = { id: string; text: string; level: 2 | 3 };
export type TransformResult = { html: string; toc: TocEntry[] };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeQuillCodeBlocks(root: HTMLElement): void {
  for (const container of root.querySelectorAll('div.ql-code-block-container')) {
    const groups: { language: string; lines: string[] }[] = [];
    for (const line of container.childNodes) {
      if (!(line instanceof HTMLElement) || !line.classList.contains('ql-code-block')) continue;
      const language = line.getAttribute('data-language') || '';
      let group = groups.at(-1);
      if (!group || group.language !== language) {
        group = { language, lines: [] };
        groups.push(group);
      }
      // A Quill line containing only <br> is empty. Join line text explicitly
      // to retain indentation and blank lines without publishing editor markup.
      const empty = line.childNodes.length === 1 && line.firstChild instanceof HTMLElement &&
        line.firstChild.rawTagName.toLowerCase() === 'br';
      group.lines.push(empty ? '' : line.text);
    }
    if (groups.length) container.replaceWith(parse(groups.map(group =>
      `<pre data-language="${escapeHtml(group.language)}">${escapeHtml(group.lines.join('\n'))}</pre>`,
    ).join('')));
  }
}

export async function transformBlogHtml(sanitizedHtml: string): Promise<TransformResult> {
  if (!sanitizedHtml) return { html: '', toc: [] };

  const root = parse(sanitizedHtml, { comment: false });
  const toc: TocEntry[] = [];
  const used = new Set<string>();

  // 0. Graphic blocks — replace each inline placeholder with freshly rendered markup
  //    from its (authoritative) data-config, discarding any stale inner snapshot.
  //    Done first so later passes never see a graphic's internals. Malformed → dropped.
  for (const node of root.querySelectorAll('div.blog-graphic')) {
    const config = decodeConfig(node.getAttribute('data-config') || '');
    if (!config) {
      node.remove();
      continue;
    }
    node.replaceWith(parse(renderGraphic(config)));
  }

  // 1. Heading anchors + TOC
  for (const h of root.querySelectorAll('h2, h3')) {
    const text = h.text.trim();
    if (!text) continue;
    const id = dedupeSlug(slugifyHeading(text), used);
    h.setAttribute('id', id);
    toc.push({ id, text, level: h.rawTagName === 'h3' ? 3 : 2 });
  }

  // 2. Responsive tables (string-based approach for node-html-parser compatibility)
  for (const table of root.querySelectorAll('table')) {
    table.replaceWith(parse(`<div class="blog-table-scroll">${table.outerHTML}</div>`));
  }

  // 3. Code blocks (async — collect then highlight)
  // Safe DOM export uses divs; semantic <pre> content remains supported too.
  normalizeQuillCodeBlocks(root);
  const pres = root.querySelectorAll('pre');
  for (const pre of pres) {
    const lang = pre.getAttribute('data-language') || '';
    // Decode once: chained entity replacements corrupt literal "&lt;" in code.
    const code = parse(pre.innerHTML.replace(/<br\s*\/?>/gi, '\n'), { comment: false }).text;
    const highlighted = await highlightCode(code, lang);
    const label = escapeHtml((lang || 'text').toUpperCase());
    const block = parse(
      `<div class="blog-code">` +
        `<div class="blog-code__header">` +
        `<span class="blog-code__lang">${label}</span>` +
        `<button type="button" class="copy-code" aria-label="Copy code">Copy</button>` +
        `</div>` +
        `<div class="blog-code__body">${highlighted}</div>` +
        `</div>`,
    );
    pre.replaceWith(block);
  }

  return { html: root.toString(), toc };
}
