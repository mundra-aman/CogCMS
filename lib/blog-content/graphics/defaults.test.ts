import { describe, it, expect } from 'vitest';
import { GRAPHIC_DEFAULTS } from './defaults';
import { graphicConfigSchema, type GraphicType } from './types';

describe('GRAPHIC_DEFAULTS', () => {
  const types: GraphicType[] = ['stat-cards', 'callout', 'comparison'];

  it('provides a schema-valid default for each graphic type', () => {
    for (const type of types) {
      const cfg = GRAPHIC_DEFAULTS[type]();
      const result = graphicConfigSchema.safeParse(cfg);
      expect(result.success).toBe(true);
      expect(cfg.type).toBe(type);
    }
  });

  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = GRAPHIC_DEFAULTS['stat-cards']();
    const b = GRAPHIC_DEFAULTS['stat-cards']();
    expect(a).not.toBe(b);
    expect(a.type === 'stat-cards' && a.cards).not.toBe(b.type === 'stat-cards' && b.cards);
  });
});
