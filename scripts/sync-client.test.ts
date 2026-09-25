import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncClient } from '@/scripts/sync-client';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('client copy-in sync', () => {
  it('copies runtime client and contracts with provenance and consumer-relative imports', async () => {
    const targetRepo = await mkdtemp(path.join(tmpdir(), 'cms-client-sync-'));
    created.push(targetRepo);
    const result = await syncClient({ sourceRoot: process.cwd(), targetRepo, sha: 'abc1234' });
    expect(result.clientFiles).toEqual(['index.ts']);
    expect(result.contractFiles).toContain('post.ts');
    const generated = await readFile(path.join(targetRepo, 'lib/cms/client/index.ts'), 'utf8');
    expect(generated.startsWith('// GENERATED from CogNerd_CMS@abc1234')).toBe(true);
    expect(generated).toContain("from '../contracts/index'");
    expect(generated).not.toContain('client.test');
    const contract = await readFile(path.join(targetRepo, 'lib/cms/contracts/post.ts'), 'utf8');
    expect(contract.startsWith('// GENERATED from CogNerd_CMS@abc1234')).toBe(true);
    expect(contract).toContain("from './author'");
  });
});
