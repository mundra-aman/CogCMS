import type {
  GraphicConfig,
  StatCardsConfig,
  CalloutConfig,
  ComparisonConfig,
} from './types';

/* Pure HTML builder for a graphic. Used by BOTH the public render transform and the
   editor's Quill blot preview, so the writer sees what the reader sees (minus the
   scroll-triggered animation). Output is trusted markup generated AFTER sanitize:
   the public transform does not re-sanitize it, so every user value is escaped here.
   Animation hooks: `data-reveal` on the wrapper and `data-count-to` on each number;
   GraphicAnimations.tsx reads them. Omitted when `animate` is false. */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderStatCards(cfg: StatCardsConfig): string {
  const cards = cfg.cards
    .map((c) => {
      const prefix = c.prefix ? `<span class="blog-graphic__prefix">${esc(c.prefix)}</span>` : '';
      const suffix = c.suffix ? `<span class="blog-graphic__suffix">${esc(c.suffix)}</span>` : '';
      const countAttr = cfg.animate ? ` data-count-to="${c.number}"` : '';
      const caption = c.caption
        ? `<p class="blog-graphic__caption">${esc(c.caption)}</p>`
        : '';
      return (
        `<div class="blog-graphic__stat">` +
        `<div class="blog-graphic__num">${prefix}` +
        `<span class="blog-graphic__value"${countAttr}>${c.number}</span>${suffix}</div>` +
        `<div class="blog-graphic__label">${esc(c.label)}</div>` +
        `<div class="blog-graphic__bar" style="background:${esc(c.barColor)}"></div>` +
        caption +
        `</div>`
      );
    })
    .join('');
  return wrap('stat-cards', cfg.animate, `<div class="blog-graphic__stats">${cards}</div>`);
}

function renderCallout(cfg: CalloutConfig): string {
  const eyebrow = cfg.eyebrow
    ? `<div class="blog-graphic__eyebrow">${esc(cfg.eyebrow)}</div>`
    : '';
  const attribution = cfg.attribution
    ? `<div class="blog-graphic__attribution">${esc(cfg.attribution)}</div>`
    : '';
  const inner =
    `<div class="blog-graphic__callout blog-graphic__callout--${esc(cfg.variant)}" ` +
    `style="--accent:${esc(cfg.accentColor)}">` +
    eyebrow +
    `<p class="blog-graphic__callout-text">${esc(cfg.text)}</p>` +
    attribution +
    `</div>`;
  return wrap('callout', cfg.animate, inner);
}

function renderComparison(cfg: ComparisonConfig): string {
  const cols = cfg.columns
    .map((col) => {
      const points = col.points
        .map((p) => `<li>${esc(p)}</li>`)
        .join('');
      return (
        `<div class="blog-graphic__col">` +
        `<div class="blog-graphic__col-heading">${esc(col.heading)}</div>` +
        `<ul class="blog-graphic__col-points">${points}</ul>` +
        `</div>`
      );
    })
    .join('');
  const inner =
    `<div class="blog-graphic__comparison" style="--accent:${esc(cfg.accentColor)}">${cols}</div>`;
  return wrap('comparison', cfg.animate, inner);
}

function wrap(type: string, animate: boolean, inner: string): string {
  const reveal = animate ? ' data-reveal' : '';
  return `<div class="blog-graphic-view blog-graphic-view--${type}"${reveal}>${inner}</div>`;
}

export function renderGraphic(config: GraphicConfig): string {
  switch (config.type) {
    case 'stat-cards':
      return renderStatCards(config);
    case 'callout':
      return renderCallout(config);
    case 'comparison':
      return renderComparison(config);
    default:
      return '';
  }
}
