import { describe, expect, it } from 'vitest';
import { parse } from 'node-html-parser';
import { sanitizeBlogHtml } from './sanitize-blog-html';

describe('sanitizeBlogHtml', () => {
  it('returns an empty string for empty input', () => {
    expect(sanitizeBlogHtml('')).toBe('');
  });

  it('strips script tags and their contents', () => {
    const out = sanitizeBlogHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('<p>hi</p>');
  });

  it('strips inline event handlers', () => {
    expect(sanitizeBlogHtml('<p onclick="x()">a</p>')).toBe('<p>a</p>');
  });

  it('strips javascript: hrefs and leaves a bare anchor', () => {
    const out = sanitizeBlogHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toBe('<a>x</a>');
  });

  it('strips style attributes', () => {
    expect(sanitizeBlogHtml('<p style="color:red">a</p>')).toBe('<p>a</p>');
  });

  it('keeps a YouTube embed iframe and normalises its attributes', () => {
    const out = sanitizeBlogHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe>');
    expect(out).toContain('src="https://www.youtube.com/embed/abc"');
    expect(out).toContain('allowfullscreen');
  });

  it('drops iframes from any other host', () => {
    expect(sanitizeBlogHtml('<iframe src="https://evil.example/x"></iframe>')).toBe('');
  });

  it('reduces images to src and alt', () => {
    const out = sanitizeBlogHtml('<img src="https://x/y.png" alt="A" width="10" onerror="x()">');
    expect(out).toBe('<img src="https://x/y.png" alt="A">');
  });

  it('adds rel="noopener noreferrer" to anchors and drops other attributes', () => {
    const out = sanitizeBlogHtml('<a href="https://x" target="_blank">t</a>');
    expect(out).toBe('<a href="https://x" rel="noopener noreferrer">t</a>');
  });

  it.each([
    'jav&#x61;script:alert(1)',
    'java&#9;script:alert(1)',
    '&#106;avascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
  ])('rejects decoded unsafe URLs: %s', (url) => {
    const root = parse(sanitizeBlogHtml(`<a href="${url}">link</a><img src="${url}">`));
    expect(root.querySelector('a')?.getAttribute('href')).toBeUndefined();
    expect(root.querySelector('img')).toBeNull();
  });

  it('escapes reconstructed attributes without creating event handlers', () => {
    const root = parse(
      sanitizeBlogHtml(
        `<img src='/image.png' alt='a" onerror="alert(1)'><a href='https://example.com/?q=" onclick="alert(1)'>link</a><iframe src='https://www.youtube.com/embed/abc?x=" onload="alert(1)'></iframe>`,
      ),
    );
    for (const node of root.querySelectorAll('*')) {
      expect(Object.keys(node.attributes).some((name) => name.startsWith('on'))).toBe(false);
    }
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('a" onerror="alert(1)');
  });

  it('removes active elements, multiline event attributes and arbitrary attributes', () => {
    const html = sanitizeBlogHtml(
      '<script>alert(1)</script><svg><a href="/evil">svg</a></svg><p onclick="\nalert(1)\n" style="color:red" autofocus contenteditable>safe</p><details ontoggle="alert(1)">text</details>',
    );
    expect(html).toBe('<p>safe</p>text');
  });

  it('preserves supported formatting, text entities and custom graphic metadata', () => {
    const html =
      '<h2 id="section">A &amp; B</h2><p class="ql-align-center"><strong>Bold</strong><em>emphasis</em><br><s>old</s><sub>2</sub></p><ol><li data-list="ordered">one</li></ol><pre data-language="javascript">a &lt; b</pre><table><tbody><tr><td colspan="2">cell</td></tr></tbody></table><div class="blog-graphic" data-graphic="callout" data-config="eyJ0ZXh0IjoidGVzdCJ9"></div>';
    expect(sanitizeBlogHtml(html)).toBe(html);
  });

  it('preserves safe links, uploaded images, raster data images and approved video embeds', () => {
    const root = parse(
      sanitizeBlogHtml(
        '<a href="/blogs/a?q=1&amp;x=2">relative</a><a href="mailto:hello@example.com">email</a><img src="https://media.cognerd.in/photo.webp" alt="A &amp; B"><img src="data:image/png;base64,aGVsbG8="><iframe src="https://www.youtube.com/embed/abc"></iframe><iframe src="https://player.vimeo.com/video/123"></iframe><iframe src="https://youtube.com.evil.test/embed/abc"></iframe><iframe src="https://www.youtube.com/watch?v=abc"></iframe><img src="data:image/svg+xml;base64,PHN2Zz4=">',
      ),
    );
    expect(root.querySelectorAll('a').map((node) => node.getAttribute('href'))).toEqual([
      '/blogs/a?q=1&x=2',
      'mailto:hello@example.com',
    ]);
    expect(root.querySelectorAll('img')).toHaveLength(2);
    expect(root.querySelectorAll('iframe').map((node) => node.getAttribute('src'))).toEqual([
      'https://www.youtube.com/embed/abc',
      'https://player.vimeo.com/video/123',
    ]);
    expect(root.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('does not turn encoded text or malformed foreign markup into executable tags', () => {
    const output = sanitizeBlogHtml(
      '&lt;img src=x onerror=alert(1)&gt;<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    );
    const root = parse(output);
    expect(root.querySelector('img')).toBeNull();
    expect(root.text).toContain('<img src=x onerror=alert(1)>');
  });
});
