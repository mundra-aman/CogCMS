import { describe, it, expect } from 'vitest';
import { transformBlogHtml } from './transform';

describe('transformBlogHtml', () => {
  it('injects ids on h2/h3 and builds a toc', async () => {
    const { html, toc } = await transformBlogHtml('<h2>Intro</h2><h3>Details</h3><p>x</p>');
    expect(toc).toEqual([
      { id: 'intro', text: 'Intro', level: 2 },
      { id: 'details', text: 'Details', level: 3 },
    ]);
    expect(html).toContain('id="intro"');
    expect(html).toContain('id="details"');
  });

  it('dedupes duplicate heading ids', async () => {
    const { toc } = await transformBlogHtml('<h2>Intro</h2><h2>Intro</h2>');
    expect(toc.map((t) => t.id)).toEqual(['intro', 'intro-2']);
  });

  it('wraps tables in a scroll container', async () => {
    const { html } = await transformBlogHtml('<table><tr><td>a</td></tr></table>');
    expect(html).toContain('class="blog-table-scroll"');
    expect(html).toContain('<table>');
  });

  it('highlights code blocks and adds a language header', async () => {
    const { html } = await transformBlogHtml(
      '<pre data-language="javascript">const a = 1;</pre>',
    );
    expect(html).toContain('blog-code');
    expect(html).toContain('JAVASCRIPT');
    expect(html).toContain('copy-code');
    expect(html).toContain('shiki');
  });

  it('handles code blocks without a language', async () => {
    const { html } = await transformBlogHtml('<pre>plain text</pre>');
    expect(html).toContain('blog-code');
    expect(html).toContain('plain text');
  });

  it('returns empty for empty input', async () => {
    expect(await transformBlogHtml('')).toEqual({ html: '', toc: [] });
  });

  it('escapes HTML metacharacters in the code-block language label', async () => {
    // &lt; in the attribute value → node-html-parser decodes it to literal '<'
    // which is then interpolated unescaped into the blog-code HTML string
    const { html } = await transformBlogHtml(
      '<pre data-language="x&lt;script&gt;alert(1)&lt;/script&gt;">code</pre>',
    );
    // The rendered output must NOT contain a raw <script tag injected via label
    expect(html).not.toMatch(/<script/i);
    // The blog-code__lang span content must not contain raw < or >
    const labelMatch = html.match(/<span class="blog-code__lang">([\s\S]*?)<\/span>/);
    expect(labelMatch).not.toBeNull();
    const labelContent = labelMatch![1];
    expect(labelContent).not.toContain('<');
    expect(labelContent).not.toContain('>');
  });
});
