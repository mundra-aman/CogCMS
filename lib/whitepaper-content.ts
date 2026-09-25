export interface ContentBlock {
  type: 'h1' | 'h2' | 'h3' | 'paragraph' | 'ul' | 'ol' | 'table' | 'divider';
  text?: string;
  items?: string[];
  headers?: string[];
  rows?: string[][];
}

function stripInlineHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToMarkdownLike(html: string) {
  let out = html;

  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');
  out = out.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<hr\s*\/?>/gi, '\n---\n');

  out = out.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, text) => {
    return `\n# ${stripInlineHtml(text)}\n\n`;
  });
  out = out.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, text) => {
    return `\n## ${stripInlineHtml(text)}\n\n`;
  });
  out = out.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, text) => {
    return `\n### ${stripInlineHtml(text)}\n\n`;
  });

  out = out.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(
      (m) => `- ${stripInlineHtml(m[1])}`,
    );
    return items.length > 0 ? `\n${items.join('\n')}\n\n` : '\n';
  });

  out = out.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(
      (m, i) => `${i + 1}. ${stripInlineHtml(m[1])}`,
    );
    return items.length > 0 ? `\n${items.join('\n')}\n\n` : '\n';
  });

  out = out.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => {
    const normalized = stripInlineHtml(text);
    return normalized ? `\n${normalized}\n\n` : '\n';
  });

  out = out.replace(/<[^>]*>/g, ' ');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

export function parseBlocks(markdown: string): ContentBlock[] {
  const lines = markdown.split('\n');
  const blocks: ContentBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) });
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2) });
      i++;
      continue;
    }

    if (line === '---' || line === '***' || line === '___') {
      blocks.push({ type: 'divider' });
      i++;
      continue;
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const headers = tableLines[0]
          .split('|')
          .filter(Boolean)
          .map((c) => c.trim());
        const rows: string[][] = [];
        for (let j = 1; j < tableLines.length; j++) {
          if (/^\|[\s\-:|]+\|$/.test(tableLines[j])) continue;
          const row = tableLines[j]
            .split('|')
            .filter(Boolean)
            .map((c) => c.trim());
          if (row.length > 0) rows.push(row);
        }
        blocks.push({ type: 'table', headers, rows });
      }
      continue;
    }

    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) {
        i++;
        break;
      }
      if (
        l.startsWith('#') ||
        l.startsWith('- ') ||
        /^\d+\.\s/.test(l) ||
        l.startsWith('|') ||
        l === '---'
      ) {
        break;
      }
      paraLines.push(lines[i].trimEnd());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n').trim() });
    }
  }

  return blocks;
}

export function contentToBlocks(content: string) {
  const hasHtml = /<[^>]+>/.test(content);
  return parseBlocks(hasHtml ? htmlToMarkdownLike(content) : content);
}
