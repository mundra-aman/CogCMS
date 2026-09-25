import { describe, it, expect } from 'vitest';
import { encodeConfig, decodeConfig } from './encode';
import type { GraphicConfig } from './types';

const statCards: GraphicConfig = {
  type: 'stat-cards',
  animate: true,
  cards: [
    { number: 250, suffix: 'B+', label: 'Web pages in Common Crawl', barColor: '#c0552f' },
    { number: 13, suffix: 'T', label: 'Tokens used to train GPT-4', barColor: '#c0552f' },
  ],
};

describe('encodeConfig / decodeConfig', () => {
  it('round-trips a stat-cards config', () => {
    const decoded = decodeConfig(encodeConfig(statCards));
    expect(decoded).toEqual(statCards);
  });

  it('round-trips unicode and quote characters in text', () => {
    const callout: GraphicConfig = {
      type: 'callout',
      animate: false,
      text: 'He said "café costs €5" — really?',
      accentColor: '#FF751F',
      variant: 'quote',
    };
    expect(decodeConfig(encodeConfig(callout))).toEqual(callout);
  });

  it('returns null for non-base64 garbage', () => {
    expect(decodeConfig('!!!not base64!!!')).toBeNull();
  });

  it('returns null when the decoded JSON fails schema validation (unknown type)', () => {
    const bad = encodeConfig({ type: 'pie-chart' } as unknown as GraphicConfig);
    expect(decodeConfig(bad)).toBeNull();
  });

  it('returns null when stat-cards has fewer than 2 cards', () => {
    const bad = encodeConfig({
      type: 'stat-cards',
      animate: true,
      cards: [{ number: 1, label: 'x', barColor: '#000' }],
    } as GraphicConfig);
    expect(decodeConfig(bad)).toBeNull();
  });

  it('returns null when comparison does not have exactly 2 columns', () => {
    const bad = encodeConfig({
      type: 'comparison',
      animate: true,
      accentColor: '#FF751F',
      columns: [{ heading: 'only one', points: ['a'] }],
    } as GraphicConfig);
    expect(decodeConfig(bad)).toBeNull();
  });
});
