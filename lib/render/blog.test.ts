import { describe, expect, it } from 'vitest';
import { renderBlogSnapshot } from './blog';
import { PIPELINE_VERSION } from './version';
import { parse } from 'node-html-parser';
import { encodeConfig } from '@/lib/blog-content/graphics/encode';

describe('renderBlogSnapshot', () => {
  it('publishes Quill DOM code with highlighting, copy controls, language and exact text', async () => {
    const snapshot = await renderBlogSnapshot(
      '<div class="ql-code-block-container" spellcheck="false">' +
      '<div class="ql-code-block" data-language="javascript">  const html = &quot;&amp;lt;div&amp;gt;&quot;;</div>' +
      '<div class="ql-code-block" data-language="javascript"><br></div>' +
      '<div class="ql-code-block" data-language="javascript">  console.log(html &lt; 3);</div></div>',
    );
    const root = parse(snapshot.html, { blockTextElements: {} });
    expect(root.querySelectorAll('.blog-code')).toHaveLength(1);
    expect(root.querySelector('.blog-code__lang')?.text).toBe('JAVASCRIPT');
    expect(root.querySelector('.copy-code')).not.toBeNull();
    expect(root.querySelector('pre.shiki code')?.text).toBe('  const html = "&lt;div&gt;";\n\n  console.log(html < 3);');
    expect(root.querySelector('pre.shiki span[style]')).not.toBeNull();
    expect(root.querySelector('.ql-code-block-container')).toBeNull();
  });

  it('preserves separate code blocks, blank edge lines and language changes safely', async () => {
    const snapshot = await renderBlogSnapshot(
      '<div class="ql-code-block-container"><div class="ql-code-block"><br></div>' +
      '<div class="ql-code-block">&lt;script&gt;bad()&lt;/script&gt;</div><div class="ql-code-block"><br></div></div>' +
      '<p>Between</p><div class="ql-code-block-container"><div class="ql-code-block" data-language="python">print(1)</div>' +
      '<div class="ql-code-block" data-language="javascript">let a = 1;</div></div>',
    );
    const root = parse(snapshot.html, { blockTextElements: {} });
    expect(root.querySelectorAll('.blog-code__lang').map(n => n.text)).toEqual(['TEXT', 'PYTHON', 'JAVASCRIPT']);
    expect(root.querySelector('pre code')?.text).toBe('\n<script>bad()</script>\n');
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('p')?.text).toBe('Between');
  });

  it('keeps decoded protocol and attribute payloads out of the published snapshot', async () => {
    const snapshot = await renderBlogSnapshot(
      '<h2>Safe heading</h2><a href="jav&#x61;script:alert(1)">bad link</a><img src="data:image/svg+xml;base64,PHN2Zz4="><img src="/valid.png" alt=\'a" onerror="alert(1)\'><p onclick="\nalert(1)\n">text</p>',
    );
    const root = parse(snapshot.html);
    expect(root.querySelector('a')?.getAttribute('href')).toBeUndefined();
    expect(root.querySelectorAll('img')).toHaveLength(1);
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('a" onerror="alert(1)');
    expect(
      root
        .querySelectorAll('*')
        .every((node) => Object.keys(node.attributes).every((name) => !name.startsWith('on'))),
    ).toBe(true);
    expect(snapshot.toc).toEqual([{ id: 'safe-heading', text: 'Safe heading', level: 2 }]);
  });

  it('regenerates custom graphic presentation after sanitizing source markup', async () => {
    const config = encodeConfig({
      type: 'callout',
      animate: false,
      variant: 'quote',
      accentColor: '#FF751F',
      text: 'Graphic & safe content',
    });
    const snapshot = await renderBlogSnapshot(
      `<div class="blog-graphic" data-graphic="callout" data-config="${config}"><p style="color:red">stale</p></div>`,
    );
    expect(snapshot.html).toContain('blog-graphic-view--callout');
    expect(snapshot.html).toContain('Graphic &amp; safe content');
    expect(snapshot.html).toContain('#FF751F');
    expect(snapshot.html).not.toContain('stale');
  });
  it('sanitizes, formats, transforms, and stores a deterministic snapshot shape', async () => {
    const snapshot = await renderBlogSnapshot(
      '<script>alert(1)</script><p>Table of Contents</p><h2>First heading</h2><p>Hello world</p>',
    );

    expect(snapshot.html).not.toContain('<script');
    expect(snapshot.html).toContain('<h2 id="table-of-contents">Table of Contents</h2>');
    expect(snapshot.html).toContain('<h2 id="first-heading">First heading</h2>');
    expect(snapshot.toc).toEqual([
      { id: 'table-of-contents', text: 'Table of Contents', level: 2 },
      { id: 'first-heading', text: 'First heading', level: 2 },
    ]);
    expect(snapshot.wordCount).toBe(7);
    expect(snapshot.readingTime).toBe(1);
    expect(snapshot.pipelineVersion).toBe(PIPELINE_VERSION);
    expect(snapshot.renderedAt).toBeInstanceOf(Date);
  });

  it('handles empty content', async () => {
    await expect(renderBlogSnapshot('')).resolves.toMatchObject({
      html: '',
      toc: [],
      wordCount: 0,
      readingTime: 0,
      pipelineVersion: PIPELINE_VERSION,
    });
  });
});

describe('non-breaking spaces', () => {
  // Editors paste prose whose every space is &nbsp;. The sanitizer decodes the entity
  // to U+00A0 before the formatter runs, so an entity-only regex left every space
  // unbreakable: TOC entries overflowed their rail and words broke mid-word
  // (live regression, www.cognerd.ai 2026-09-22).
  it('normalizes &nbsp; to breakable spaces in the published html and toc', async () => {
    const snapshot = await renderBlogSnapshot(
      '<h2>Which AI&nbsp;Numbers Matter&nbsp;Most?</h2><p>On&nbsp;June&nbsp;3, the&nbsp;UK imposed a requirement.</p>',
    );
    expect(snapshot.html).not.toMatch(/&nbsp;|\u00a0/);
    expect(snapshot.toc).toEqual([{ id: 'which-ai-numbers-matter-most', text: 'Which AI Numbers Matter Most?', level: 2 }]);
    expect(snapshot.wordCount).toBe(13);
  });
});
