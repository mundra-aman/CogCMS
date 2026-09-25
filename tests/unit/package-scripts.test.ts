import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };

describe('standalone database scripts', () => {
  it.each(['seed:admin', 'ensure:indexes', 'import:release-notes', 'rerender'])(
    '%s loads the optional local .env file',
    (scriptName) => {
      expect(packageJson.scripts[scriptName]).toContain('tsx --env-file-if-exists=.env ');
    },
  );
});
