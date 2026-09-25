import { describe, it, expect } from 'vitest';
import { slugifyHeading, dedupeSlug } from './slugify';

describe('slugifyHeading', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyHeading('Hello World!')).toBe('hello-world');
  });
  it('falls back to "section" for empty', () => {
    expect(slugifyHeading('   ')).toBe('section');
  });
});

describe('dedupeSlug', () => {
  it('appends -2, -3 for collisions', () => {
    const used = new Set<string>();
    expect(dedupeSlug('intro', used)).toBe('intro');
    expect(dedupeSlug('intro', used)).toBe('intro-2');
    expect(dedupeSlug('intro', used)).toBe('intro-3');
  });
});
