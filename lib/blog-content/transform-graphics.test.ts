import { describe, it, expect } from 'vitest';
import { transformBlogHtml } from './transform';
import { encodeConfig } from './graphics/encode';
import type { GraphicConfig } from './graphics/types';

describe('transformBlogHtml — graphics', () => {
  it('expands a blog-graphic placeholder into rendered markup', async () => {
    const cfg: GraphicConfig = {
      type: 'callout',
      animate: false,
      text: 'Hello world',
      accentColor: '#FF751F',
      variant: 'quote',
    };
    const enc = encodeConfig(cfg);
    const { html } = await transformBlogHtml(
      `<p>intro</p><div class="blog-graphic" data-graphic="callout" data-config="${enc}"></div>`,
    );
    expect(html).toContain('blog-graphic-view--callout');
    expect(html).toContain('Hello world');
    expect(html).not.toContain('data-config');
  });

  it('drops a malformed placeholder instead of crashing', async () => {
    const { html } = await transformBlogHtml(
      '<div class="blog-graphic" data-graphic="callout" data-config="!!notbase64!!"></div>',
    );
    expect(html).not.toContain('blog-graphic');
  });

  it('ignores stale inner markup and regenerates from config', async () => {
    const cfg: GraphicConfig = {
      type: 'callout',
      animate: false,
      text: 'Fresh',
      accentColor: '#FF751F',
      variant: 'quote',
    };
    const enc = encodeConfig(cfg);
    const { html } = await transformBlogHtml(
      `<div class="blog-graphic" data-graphic="callout" data-config="${enc}"><p>STALE</p></div>`,
    );
    expect(html).toContain('Fresh');
    expect(html).not.toContain('STALE');
  });
});
