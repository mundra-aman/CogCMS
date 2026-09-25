import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const roots = ['app', 'lib', 'models', 'scripts'];
const forbidden = [
  '$' + 'text',
  '$' + 'where',
  '.collation' + '(',
  'partialFilter' + 'Expression',
  '.watch' + '(',
  '.sync' + 'Indexes(',
];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(absolute);
      if (!entry.name.match(/\.(ts|tsx)$/) || entry.name.endsWith('.test.ts')) return [];
      return [absolute];
    }),
  );
  return nested.flat();
}

// Atlas/Vercel amendment permits sessions for atomic shared intake; other existing restrictions remain.
describe('Mongo source guard', () => {
  it('keeps unsupported Mongo primitives out of production code', async () => {
    const files = (await Promise.all(roots.map(sourceFiles))).flat();
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const token of forbidden) {
        if (source.includes(token)) violations.push(`${file}: ${token}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
