import { describe, it, expect } from 'vitest';
import { renderGraphic } from './render';
import type { GraphicConfig } from './types';

describe('renderGraphic — stat-cards', () => {
  const cfg: GraphicConfig = {
    type: 'stat-cards',
    animate: true,
    cards: [
      { prefix: '$', number: 100, suffix: 'M+', label: 'Cost to train GPT-4', barColor: '#c0552f', caption: 'Per OpenAI.' },
      { number: 13, suffix: 'T', label: 'Tokens', barColor: '#c0552f' },
    ],
  };

  it('renders a card per entry with label, prefix, suffix, bar color and caption', () => {
    const html = renderGraphic(cfg);
    expect(html).toContain('Cost to train GPT-4');
    expect(html).toContain('$');
    expect(html).toContain('M+');
    expect(html).toContain('#c0552f');
    expect(html).toContain('Per OpenAI.');
  });

  it('adds count-up + reveal markers when animate is true', () => {
    const html = renderGraphic(cfg);
    expect(html).toContain('data-reveal');
    expect(html).toContain('data-count-to="100"');
    expect(html).toContain('data-count-to="13"');
  });

  it('omits animation markers when animate is false', () => {
    const html = renderGraphic({ ...cfg, animate: false });
    expect(html).not.toContain('data-reveal');
    expect(html).not.toContain('data-count-to');
  });

  it('escapes HTML in user text', () => {
    const html = renderGraphic({
      type: 'stat-cards',
      animate: false,
      cards: [
        { number: 1, label: '<script>alert(1)</script>', barColor: '#000' },
        { number: 2, label: 'ok', barColor: '#000' },
      ],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderGraphic — callout', () => {
  it('renders text, eyebrow, attribution and variant', () => {
    const html = renderGraphic({
      type: 'callout',
      animate: false,
      eyebrow: 'Note',
      text: 'Big idea',
      attribution: 'Sam Altman',
      accentColor: '#FF751F',
      variant: 'quote',
    });
    expect(html).toContain('Big idea');
    expect(html).toContain('Note');
    expect(html).toContain('Sam Altman');
    expect(html).toContain('quote');
  });
});

describe('renderGraphic — comparison', () => {
  it('renders both column headings and their points', () => {
    const html = renderGraphic({
      type: 'comparison',
      animate: false,
      accentColor: '#FF751F',
      columns: [
        { heading: 'Before', points: ['slow', 'manual'] },
        { heading: 'After', points: ['fast', 'auto'] },
      ],
    });
    expect(html).toContain('Before');
    expect(html).toContain('After');
    expect(html).toContain('slow');
    expect(html).toContain('auto');
  });
});

describe('renderGraphic — unknown', () => {
  it('returns empty string for an unknown type', () => {
    expect(renderGraphic({ type: 'nope' } as unknown as GraphicConfig)).toBe('');
  });
});
