import { describe, expect, it } from 'vitest';
import type { ResolvedSite } from './context';
import { publicUrlFor } from './urls';

const site: Pick<ResolvedSite, 'primaryDomain' | 'publicPaths'> = {
  primaryDomain: 'https://www.example.com/',
  publicPaths: {
    blogs: '/insights/',
    whitepapers: 'research',
    faq: '/',
    releaseNotes: '/updates',
  },
};

describe('publicUrlFor', () => {
  it('normalises origins and path prefixes deterministically', () => {
    expect(publicUrlFor(site, 'blogs')).toBe('https://www.example.com/insights');
    expect(publicUrlFor(site, 'whitepapers', 'cloud-guide')).toBe(
      'https://www.example.com/research/cloud-guide',
    );
    expect(publicUrlFor(site, 'faq')).toBe('https://www.example.com');
  });

  it('encodes a safe single-segment slug', () => {
    expect(publicUrlFor(site, 'releaseNotes', 'September notes')).toBe(
      'https://www.example.com/updates/September%20notes',
    );
  });

  it('rejects traversal through either configured paths or slugs', () => {
    for (const path of ['//evil.example', '/safe\\escape', '/../escape', '/safe/%2e%2e/escape']) {
      expect(() =>
        publicUrlFor({ ...site, publicPaths: { ...site.publicPaths, blogs: path } }, 'blogs'),
      ).toThrow(/configured site origin/);
    }
    for (const slug of [
      '..',
      '.',
      '%2e%2e',
      'nested/escape',
      'nested%2fescape',
      'nested\\escape',
    ]) {
      expect(() => publicUrlFor(site, 'blogs', slug)).toThrow(/single safe path segment/);
    }
  });
});
