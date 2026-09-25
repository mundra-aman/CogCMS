import { parse, HTMLElement, NodeType, type Node } from 'node-html-parser';

const ALLOWED_TAGS = new Set(
  'a abbr b blockquote br caption code col colgroup dd del div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img li ol p pre s small span strong sub sup table tbody td th thead tr u ul iframe'.split(
    ' ',
  ),
);
const DROP_CONTENT = new Set(
  'script style svg math template object embed form input button textarea select option base meta link noscript noembed noframes xmp plaintext title'.split(
    ' ',
  ),
);
const VOID_TAGS = new Set(['br', 'col', 'hr', 'img']);
const COMMON_ATTRIBUTES = new Set(['class', 'id', 'title', 'lang', 'dir']);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value: string | undefined, image = false): string | undefined {
  if (!value) return undefined;
  const url = value.trim();
  // Attribute entities are decoded first. Browsers remove embedded tabs/newlines
  // when interpreting schemes, so reject control characters before URL parsing.
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return undefined;
  if (image && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(url))
    return url;
  try {
    const protocol = new URL(url, 'https://sanitizer.invalid/').protocol;
    if (['https:', 'http:', ...(image ? [] : ['mailto:', 'tel:'])].includes(protocol)) return url;
  } catch {
    /* Malformed URLs are omitted. */
  }
  return undefined;
}

function safeVideo(value: string | undefined): string | undefined {
  const src = safeUrl(value, true);
  if (!src) return undefined;
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
    if (
      (['youtube.com', 'www.youtube.com'].includes(url.hostname) &&
        /^\/embed\/[^/]+/.test(url.pathname)) ||
      (url.hostname === 'player.vimeo.com' && /^\/video\/\d+/.test(url.pathname))
    )
      return src;
  } catch {
    /* Video embeds must have an absolute approved origin. */
  }
  return undefined;
}

function serialize(node: Node): string {
  // Re-escape decoded text as well as attributes; never copy raw markup across
  // the parser/browser boundary (including malformed or foreign markup).
  if (node.nodeType === NodeType.TEXT_NODE) return escapeHtml(node.text);
  if (!(node instanceof HTMLElement)) return '';
  const tag = node.rawTagName.toLowerCase();
  if (DROP_CONTENT.has(tag)) return '';
  const children = () => node.childNodes.map(serialize).join('');
  if (!ALLOWED_TAGS.has(tag)) return children();

  const attributes: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(node.attributes)) {
    const name = rawName.toLowerCase();
    if (
      COMMON_ATTRIBUTES.has(name) ||
      (tag === 'div' && ['data-graphic', 'data-config'].includes(name)) ||
      (['pre', 'div'].includes(tag) && name === 'data-language') ||
      (tag === 'li' && name === 'data-list') ||
      (['td', 'th'].includes(tag) &&
        ['colspan', 'rowspan'].includes(name) &&
        /^\d{1,3}$/.test(value))
    )
      attributes[name] = value;
  }
  if (tag === 'a') {
    const href = safeUrl(node.getAttribute('href'));
    if (href) {
      attributes.href = href;
      attributes.rel = 'noopener noreferrer';
    }
  }
  if (tag === 'img') {
    const src = safeUrl(node.getAttribute('src'), true);
    if (!src) return '';
    attributes.src = src;
    attributes.alt = node.getAttribute('alt') ?? '';
  }
  if (tag === 'iframe') {
    const src = safeVideo(node.getAttribute('src'));
    if (!src) return '';
    attributes.src = src;
    attributes.frameborder = '0';
    attributes.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    attributes.allowfullscreen = '';
  }
  const attrs = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
    .join('');
  return `<${tag}${attrs}>${VOID_TAGS.has(tag) ? '' : `${tag === 'iframe' ? '' : children()}</${tag}>`}`;
}

export function sanitizeBlogHtml(html: string): string {
  if (!html) return '';
  return parse(html, { comment: false }).childNodes.map(serialize).join('');
}
