import { createHighlighter, type Highlighter } from 'shiki';
import { CODE_LANGUAGES } from './code-languages';

const LANGS = CODE_LANGUAGES.filter((l) => l !== 'text');
const THEME = 'github-light';

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: [THEME], langs: LANGS });
  }
  return highlighterPromise;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function highlightCode(code: string, lang: string): Promise<string> {
  const normalized = (lang || '').toLowerCase();
  const useLang = LANGS.includes(normalized) ? normalized : 'text';
  try {
    const hl = await getHighlighter();
    if (useLang === 'text') return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
    return hl.codeToHtml(code, { lang: useLang, theme: THEME });
  } catch {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }
}
