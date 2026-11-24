import { decodeConfig } from '@/lib/blog-content/graphics/encode';
import type { GraphicConfig } from '@/lib/blog-content/graphics/types';
import { sanitizeBlogHtml } from '@/lib/sanitize-blog-html';
import { renderGraphic } from '@/lib/blog-content/graphics/render';

export type DiffTokenType = 'added' | 'removed' | 'unchanged';

export interface DiffToken {
  type: DiffTokenType;
  text: string;
}

export interface FieldDiffResult {
  isChanged: boolean;
  oldValue: string;
  newValue: string;
  tokens: DiffToken[];
  additions: number;
  deletions: number;
}

// Preserve spaces and newlines so tokens reassemble without losing layout formatting.
export function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.match(/\S+|\s+/g) || [];
}

// Line-level LCS fallback when word-level matrix size exceeds the circuit breaker budget.
export function computeLineDiff(oldText: string, newText: string): DiffToken[] {
  const linesOld = (oldText || '').split('\n');
  const linesNew = (newText || '').split('\n');
  const n = linesOld.length;
  const m = linesNew.length;

  if (oldText === newText) {
    return oldText ? [{ type: 'unchanged', text: oldText }] : [];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (linesOld[i - 1] === linesNew[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffToken[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesOld[i - 1] === linesNew[j - 1]) {
      result.unshift({ type: 'unchanged', text: linesOld[i - 1] + (i < n ? '\n' : '') });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: linesNew[j - 1] + (j < m ? '\n' : '') });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift({ type: 'removed', text: linesOld[i - 1] + (i < n ? '\n' : '') });
      i--;
    }
  }

  return mergeDiffTokens(result);
}

export function computeWordDiff(oldText: string, newText: string): DiffToken[] {
  const a = tokenizeWords(oldText || '');
  const b = tokenizeWords(newText || '');
  const n = a.length;
  const m = b.length;

  if (oldText === newText) {
    return oldText ? [{ type: 'unchanged', text: oldText }] : [];
  }
  if (n === 0) {
    return m > 0 ? [{ type: 'added', text: newText }] : [];
  }
  if (m === 0) {
    return n > 0 ? [{ type: 'removed', text: oldText }] : [];
  }

  // Drop to line-level diffing on huge articles so O(N*M) allocation does not stall the UI thread.
  if (n * m > 200000) {
    return computeLineDiff(oldText, newText);
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffToken[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'unchanged', text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: b[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift({ type: 'removed', text: a[i - 1] });
      i--;
    }
  }

  return mergeDiffTokens(result);
}

// Merge adjacent same-status tokens to cut React DOM node count.
export function mergeDiffTokens(tokens: DiffToken[]): DiffToken[] {
  const merged: DiffToken[] = [];
  for (const token of tokens) {
    if (merged.length > 0 && merged[merged.length - 1].type === token.type) {
      merged[merged.length - 1].text += token.text;
    } else {
      merged.push({ ...token });
    }
  }
  return merged;
}

export function stripHtmlTags(input: string): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Track nested <div> depth so embedded graphic widgets replace cleanly without orphaned inner tags.
export function replaceBlogGraphics(
  html: string,
  replacer: (config: GraphicConfig, fullMatch: string) => string,
): string {
  if (!html) return '';

  let result = '';
  let i = 0;

  const divOpenRegex = /<div\b/gi;
  const divCloseRegex = /<\/div\s*>/gi;

  while (i < html.length) {
    divOpenRegex.lastIndex = i;
    const matchOpen = divOpenRegex.exec(html);
    if (!matchOpen) {
      result += html.slice(i);
      break;
    }

    const openIdx = matchOpen.index;
    result += html.slice(i, openIdx);

    // Find end of this <div...> opening tag
    const openTagEnd = html.indexOf('>', openIdx);
    if (openTagEnd === -1) {
      result += html.slice(openIdx);
      break;
    }

    const openTag = html.slice(openIdx, openTagEnd + 1);
    const isBlogGraphic = openTag.includes('data-config');

    if (!isBlogGraphic) {
      result += openTag;
      i = openTagEnd + 1;
      continue;
    }

    // Extract data-config attribute
    const configMatch = openTag.match(/data-config=["']([^"']+)["']/i);
    const encoded = configMatch ? configMatch[1] : '';

    // Walk forward tracking nested <div> and </div> until depth reaches 0
    let depth = 1;
    let curr = openTagEnd + 1;

    while (curr < html.length && depth > 0) {
      divOpenRegex.lastIndex = curr;
      divCloseRegex.lastIndex = curr;

      const nextOpen = divOpenRegex.exec(html);
      const nextClose = divCloseRegex.exec(html);

      if (!nextClose) {
        // Tag was unclosed; consume rest
        curr = html.length;
        break;
      }

      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        curr = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        curr = nextClose.index + nextClose[0].length;
      }
    }

    const fullMatch = html.slice(openIdx, curr);
    try {
      const config = decodeConfig(encoded);
      if (config) {
        result += replacer(config, fullMatch);
      } else {
        result += fullMatch;
      }
    } catch {
      result += fullMatch;
    }

    i = curr;
  }

  return result;
}

// Re-sanitize HTML at render boundary before converting embedded graphic configs for Visual Canvas preview.
export function renderVisualBodyHtml(rawHtml: string): string {
  if (!rawHtml || !rawHtml.trim()) {
    return '<p class="text-stone-400 italic">No content</p>';
  }

  const cleanHtml = sanitizeBlogHtml(rawHtml);

  return replaceBlogGraphics(cleanHtml, (config) => {
    return `<div class="blog-graphic my-4" data-graphic="${config.type}">${renderGraphic({ ...config, animate: false })}</div>`;
  });
}

// Preserve paragraph/table structure and represent graphics and media embeds as readable tokens for diffing.
export function htmlToStructuredText(input: string): string {
  if (!input) return '';

  // 1. Convert graphic blocks to clean readable summaries using balanced tag replacement
  let text = replaceBlogGraphics(input, (config) => {
    if (config.type === 'stat-cards') {
      const stats = config.cards
        .map((c) => `${c.prefix || ''}${c.number}${c.suffix || ''} ${c.label}`)
        .join(' | ');
      return `\n[Stat Cards: ${stats}]\n`;
    }
    if (config.type === 'callout') {
      const eyebrow = config.eyebrow ? `${config.eyebrow.toUpperCase()}: ` : '';
      return `\n[Callout: ${eyebrow}${config.text}]\n`;
    }
    if (config.type === 'comparison') {
      const col0 = config.columns?.[0] ? `${config.columns[0].heading}: ${config.columns[0].points.join(', ')}` : '';
      const col1 = config.columns?.[1] ? `${config.columns[1].heading}: ${config.columns[1].points.join(', ')}` : '';
      return `\n[Comparison: (${col0}) vs (${col1})]\n`;
    }
    return '';
  });

  // 2. Convert embedded media (images and video iframes) into structured tokens
  // preserving URLs and descriptive alt text for meaningful diffing and change detection.
  text = text.replace(/<img\b[^>]*>/gi, (match) => {
    const srcMatch = match.match(/\bsrc=["']([^"']+)["']/i);
    const altMatch = match.match(/\balt=["']([^"']*)["']/i);
    const src = srcMatch ? srcMatch[1] : '';
    const alt = altMatch ? altMatch[1].trim() : '';
    if (alt && src) return `\n[Image: ${alt} (${src})]\n`;
    if (src) return `\n[Image: ${src}]\n`;
    if (alt) return `\n[Image: ${alt}]\n`;
    return `\n[Image]\n`;
  });

  text = text.replace(/<iframe\b(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>(?:[\s\S]*?<\/iframe>)?|<iframe\b(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*\/>/gi, (_match, src1, src2) => {
    const src = src1 || src2 || '';
    return `\n[Video: ${src}]\n`;
  });

  text = text.replace(/<video\b(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>(?:[\s\S]*?<\/video>)?|<video\b(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*\/>/gi, (_match, src1, src2) => {
    const src = src1 || src2 || '';
    return `\n[Video: ${src}]\n`;
  });

  // 3. Format tables: separate cells with ' | ' and rows with newlines
  text = text.replace(/<\/td>\s*<td[^>]*>/gi, ' | ');
  text = text.replace(/<\/th>\s*<th[^>]*>/gi, ' | ');
  text = text.replace(/<\/tr>/gi, '\n');

  // 3. Convert block level elements and line breaks to newlines
  text = text.replace(/<(?:p|h[1-6]|li|blockquote|pre|tr|br)[^>]*>/gi, '');
  text = text.replace(/<\/(?:p|h[1-6]|li|blockquote|pre|tr)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // 4. Strip any remaining HTML tags
  text = text.replace(/<[^>]*>/g, ' ');

  // 5. Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 6. Normalize whitespace: keep newlines, collapse multiple spaces per line
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');

  // Collapse 3+ newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

export function computeFieldDiff(oldVal: unknown, newVal: unknown): FieldDiffResult {
  const oldStr = oldVal === undefined || oldVal === null ? '' : String(oldVal);
  const newStr = newVal === undefined || newVal === null ? '' : String(newVal);

  const isChanged = oldStr !== newStr;
  const tokens = isChanged ? computeWordDiff(oldStr, newStr) : [{ type: 'unchanged' as const, text: oldStr }];

  let additions = 0;
  let deletions = 0;

  // Count non-whitespace word tokens (\S+) so UI diff badges reflect edited words rather than spaces.
  for (const token of tokens) {
    const wordCount = (token.text.match(/\S+/g) || []).length;
    if (token.type === 'added') {
      additions += wordCount;
    } else if (token.type === 'removed') {
      deletions += wordCount;
    }
  }

  return {
    isChanged,
    oldValue: oldStr,
    newValue: newStr,
    tokens,
    additions,
    deletions,
  };
}

export function normalizeDateToEpoch(val: unknown, timeZone?: string): number {
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;
  const tz = timeZone && timeZone.trim() ? timeZone.trim() : 'UTC';

  // ISO strings ending with Z or explicit +/- timezone offsets are parsed directly as UTC instants.
  if (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str)) {
    const parsed = Date.parse(str);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // Local datetime strings without timezone (e.g. '2026-11-30T09:00' or '2026-11-30 09:00').
  try {
    const normalized = str.includes('T') ? str : str.replace(' ', 'T');
    const target = Date.parse(`${normalized.slice(0, 16)}:00Z`);
    if (Number.isFinite(target)) {
      let instant = target;
      for (let i = 0; i < 3; i++) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(new Date(instant));
        const p = (name: string) => parts.find((item) => item.type === name)?.value || '';
        const observed = Date.parse(`${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:00Z`);
        instant += target - observed;
      }
      return instant;
    }
  } catch {
    // Fallback if custom timezone is not supported
  }

  const fallback = Date.parse(str);
  return Number.isFinite(fallback) ? fallback : 0;
}

// Normalize DB UTC instants and editor local datetime strings into the same display timezone before diffing.
export function computeDateTimeDiff(
  oldVal: unknown,
  newVal: unknown,
  timeZone?: string,
): FieldDiffResult {
  const tz = timeZone && timeZone.trim() ? timeZone.trim() : 'UTC';

  const oldEpoch = normalizeDateToEpoch(oldVal, tz);
  const newEpoch = normalizeDateToEpoch(newVal, tz);

  const formatDisplay = (val: unknown, epoch: number): string => {
    if (!val || !epoch) return '';
    const d = new Date(epoch);
    try {
      return d.toLocaleString('en-US', {
        timeZone: tz,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  };

  const isChanged = oldEpoch !== newEpoch;
  const oldFormatted = formatDisplay(oldVal, oldEpoch);
  const newFormatted = formatDisplay(newVal, newEpoch);

  return {
    isChanged,
    oldValue: oldFormatted,
    newValue: newFormatted,
    tokens: isChanged
      ? computeWordDiff(oldFormatted, newFormatted)
      : [{ type: 'unchanged', text: oldFormatted }],
    additions: isChanged ? 1 : 0,
    deletions: isChanged ? 1 : 0,
  };
}
