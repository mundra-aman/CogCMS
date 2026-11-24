import { describe, expect, it } from 'vitest';
import { encodeConfig } from '@/lib/blog-content/graphics/encode';
import type { GraphicConfig } from '@/lib/blog-content/graphics/types';
import {
  computeWordDiff,
  computeLineDiff,
  computeFieldDiff,
  computeDateTimeDiff,
  stripHtmlTags,
  htmlToStructuredText,
  replaceBlogGraphics,
  renderVisualBodyHtml,
  tokenizeWords,
  mergeDiffTokens,
} from '@/lib/revisions/diff';

describe('Revision Diff Engine', () => {
  it('tokenizes words and whitespace accurately', () => {
    const tokens = tokenizeWords('Hello world!  How are you?');
    expect(tokens).toEqual(['Hello', ' ', 'world!', '  ', 'How', ' ', 'are', ' ', 'you?']);
  });

  it('computes word diffs with additions and deletions', () => {
    const oldText = 'The fast brown fox jumps';
    const newText = 'The quick brown fox leaps';

    const diff = computeWordDiff(oldText, newText);

    expect(diff).toEqual([
      { type: 'unchanged', text: 'The ' },
      { type: 'removed', text: 'fast' },
      { type: 'added', text: 'quick' },
      { type: 'unchanged', text: ' brown fox ' },
      { type: 'removed', text: 'jumps' },
      { type: 'added', text: 'leaps' },
    ]);
  });

  it('handles identical and empty text comparisons', () => {
    expect(computeWordDiff('same text', 'same text')).toEqual([
      { type: 'unchanged', text: 'same text' },
    ]);
    expect(computeWordDiff('', 'new text')).toEqual([
      { type: 'added', text: 'new text' },
    ]);
    expect(computeWordDiff('old text', '')).toEqual([
      { type: 'removed', text: 'old text' },
    ]);
  });

  it('computes line-level diffs correctly', () => {
    const oldLines = 'Line 1\nLine 2\nLine 3';
    const newLines = 'Line 1\nLine 2 modified\nLine 3';

    const diff = computeLineDiff(oldLines, newLines);
    expect(diff.some((d) => d.type === 'removed' && d.text.includes('Line 2'))).toBe(true);
    expect(diff.some((d) => d.type === 'added' && d.text.includes('Line 2 modified'))).toBe(true);
  });

  it('merges adjacent diff tokens of the same type', () => {
    const tokens = [
      { type: 'added' as const, text: 'Hello ' },
      { type: 'added' as const, text: 'World' },
      { type: 'unchanged' as const, text: '!' },
    ];
    const merged = mergeDiffTokens(tokens);
    expect(merged).toEqual([
      { type: 'added', text: 'Hello World' },
      { type: 'unchanged', text: '!' },
    ]);
  });

  it('strips HTML tags cleanly for comparison', () => {
    const html = '<p>Hello <strong>bold</strong> world!</p>';
    expect(stripHtmlTags(html)).toBe('Hello bold world!');
  });

  it('converts rich HTML into structured readable text preserving paragraphs and tables', () => {
    const html = '<h1>Title</h1><p>Paragraph 1</p><table><tr><td>col 1</td><td>col 2</td></tr><tr><td>1.1</td><td>2.1</td></tr></table><p>Paragraph 2</p>';
    const structured = htmlToStructuredText(html);
    expect(structured).toContain('Title\nParagraph 1');
    expect(structured).toContain('col 1 | col 2\n1.1 | 2.1');
    expect(structured).toContain('Paragraph 2');
  });

  it('computes field-level diff with additions and deletions count accurately without whitespace inflation', () => {
    const result = computeFieldDiff('Old Title', 'New Updated Title');
    expect(result.isChanged).toBe(true);
    expect(result.oldValue).toBe('Old Title');
    expect(result.newValue).toBe('New Updated Title');
    // 'Old Title' -> 'New Updated Title': 'Old' removed (1 word), 'New Updated' added (2 words)
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(1);
  });

  it('detects unchanged fields properly', () => {
    const result = computeFieldDiff('Constant Value', 'Constant Value');
    expect(result.isChanged).toBe(false);
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it('normalizes UTC and local datetime strings properly in computeDateTimeDiff', () => {
    // 2026-11-30T03:30:00.000Z in UTC is exactly 09:00 AM in Asia/Kolkata
    const result = computeDateTimeDiff('2026-11-30T03:30:00.000Z', '2026-11-30T09:00', 'Asia/Kolkata');
    expect(result.isChanged).toBe(false);
    expect(result.oldValue).toContain('Nov 30, 2026');
    expect(result.oldValue).toContain('9:00 AM');
    expect(result.oldValue).toBe(result.newValue);

    // Actual change detection
    const changedResult = computeDateTimeDiff('2026-11-30T03:30:00.000Z', '2026-11-30T11:00', 'Asia/Kolkata');
    expect(changedResult.isChanged).toBe(true);
    expect(changedResult.oldValue).toContain('9:00 AM');
    expect(changedResult.newValue).toContain('11:00 AM');
  });

  it('formats structured HTML into readable text preserving tables and breaks', () => {
    const raw = `
      <p>Paragraph 1</p>
      <table><tbody><tr><td>Header 1</td><td>Header 2</td></tr><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table>
      <pre>function test() { return true; }</pre>
    `;
    const structured = htmlToStructuredText(raw);
    expect(structured).toContain('Paragraph 1');
    expect(structured).toContain('Header 1 | Header 2');
    expect(structured).toContain('Cell 1 | Cell 2');
    expect(structured).toContain('function test() { return true; }');
  });

  it('swallows nested child divs completely in replaceBlogGraphics without leaving orphaned tags', () => {
    const cfg: GraphicConfig = {
      type: 'stat-cards',
      animate: false,
      cards: [
        { prefix: '$', number: 250, suffix: 'M+', label: 'Annual Revenue', barColor: '#ff751f', caption: 'revenue caption' },
        { prefix: '$', number: 140, suffix: 'M+', label: 'Annual Expense', barColor: '#3b82f6', caption: 'expense caption' },
      ],
    };
    const encoded = encodeConfig(cfg);
    const raw = `<p>Before</p><div class="blog-graphic" data-graphic="stat-cards" data-config="${encoded}"><div class="blog-graphic-view"><div class="blog-graphic__stats"><div class="blog-graphic__stat"><div class="blog-graphic__num">$250M+</div><div class="blog-graphic__label">Annual Revenue</div></div><div class="blog-graphic__stat"><div class="blog-graphic__num">$140M+</div><div class="blog-graphic__label">Annual Expense</div></div></div></div></div><p>After</p>`;

    const replaced = replaceBlogGraphics(raw, (c) => `[REPLACED_${c.type}]`);
    expect(replaced).toBe('<p>Before</p>[REPLACED_stat-cards]<p>After</p>');
    expect(replaced).not.toContain('Annual Revenue');
    expect(replaced).not.toContain('Annual Expense');
    expect(replaced).not.toContain('</div>');
  });

  describe('renderVisualBodyHtml defensive sanitization', () => {
    it('preserves legitimate rich text elements and valid links', () => {
      const safe = '<h1>Title</h1><p>Text with <strong>bold</strong> and <a href="https://example.com">valid link</a>.</p>';
      const rendered = renderVisualBodyHtml(safe);
      expect(rendered).toContain('<h1>Title</h1>');
      expect(rendered).toContain('<strong>bold</strong>');
      expect(rendered).toContain('href="https://example.com"');
    });

    it('neutralizes hostile script tags and malicious event handlers at the rendering boundary', () => {
      const hostile = `
        <div>
          <p>Normal text</p>
          <script>window.__pwned = true; alert('xss');</script>
          <img src="https://example.com/pic.jpg" onerror="alert('xss')" />
          <a href="javascript:alert('xss')">Click for free gift</a>
          <iframe src="javascript:alert('iframe')"></iframe>
          <div onmouseover="alert('hover')">Malicious Hover</div>
        </div>
      `;

      const sanitized = renderVisualBodyHtml(hostile);

      // Must not contain any executable script tag
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('__pwned');

      // Must strip onerror handler
      expect(sanitized).not.toContain('onerror');

      // Must neutralize javascript: pseudo-protocol
      expect(sanitized).not.toContain('javascript:');

      // Must drop dangerous iframe
      expect(sanitized).not.toContain('<iframe');

      // Must strip onmouseover
      expect(sanitized).not.toContain('onmouseover');

      // Legitimate markup is retained
      expect(sanitized).toContain('<p>Normal text</p>');
      expect(sanitized).toContain('src="https://example.com/pic.jpg"');
    });

    it('hydrates embedded graphic configs safely alongside sanitized markup', () => {
      const cfg: GraphicConfig = {
        type: 'callout',
        animate: false,
        accentColor: '#ff751f',
        variant: 'info',
        eyebrow: 'Insight',
        text: 'Clean callout message',
      };
      const encoded = encodeConfig(cfg);
      const mixed = `<p>Introduction</p><div data-config="${encoded}"><div>Placeholder</div></div><script>alert(1)</script><p>Conclusion</p>`;

      const result = renderVisualBodyHtml(mixed);
      expect(result).toContain('<p>Introduction</p>');
      expect(result).toContain('data-graphic="callout"');
      expect(result).toContain('Clean callout message');
      expect(result).toContain('<p>Conclusion</p>');
      expect(result).not.toContain('<script');
    });

    it('converts inline images and video iframes into structured diff tokens', () => {
      const html = `
        <p>Before media</p>
        <p><img src="https://media.example.com/banner.png" alt="Architecture Diagram" /></p>
        <p><iframe src="https://player.vimeo.com/video/12345678" allowfullscreen></iframe></p>
        <p>After media</p>
      `;
      const structured = htmlToStructuredText(html);
      expect(structured).toContain('[Image: Architecture Diagram (https://media.example.com/banner.png)]');
      expect(structured).toContain('[Video: https://player.vimeo.com/video/12345678]');
      expect(structured).toContain('Before media');
      expect(structured).toContain('After media');
    });

    it('detects diff changes when only an inline image or video embed changes in body HTML', () => {
      const v1Html = '<p>Intro</p><p><img src="https://example.com/v1.png" alt="Chart" /></p><p>Outro</p>';
      const v2Html = '<p>Intro</p><p><img src="https://example.com/v2.png" alt="Chart" /></p><p>Outro</p>';

      const diff = computeFieldDiff(htmlToStructuredText(v1Html), htmlToStructuredText(v2Html));
      expect(diff.isChanged).toBe(true);
      expect(diff.oldValue).toContain('https://example.com/v1.png');
      expect(diff.newValue).toContain('https://example.com/v2.png');
      expect(diff.tokens.some((t) => t.type === 'removed' && t.text.includes('v1.png'))).toBe(true);
      expect(diff.tokens.some((t) => t.type === 'added' && t.text.includes('v2.png'))).toBe(true);

      const video1 = '<p><iframe src="https://www.youtube.com/embed/oldId"></iframe></p>';
      const video2 = '<p><iframe src="https://player.vimeo.com/video/987654"></iframe></p>';
      const videoDiff = computeFieldDiff(htmlToStructuredText(video1), htmlToStructuredText(video2));
      expect(videoDiff.isChanged).toBe(true);
      expect(videoDiff.tokens.some((t) => t.type === 'removed' && t.text.includes('oldId'))).toBe(true);
      expect(videoDiff.tokens.some((t) => t.type === 'added' && t.text.includes('987654'))).toBe(true);
    });
  });
});
