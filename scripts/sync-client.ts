import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type SyncOptions = { sourceRoot: string; targetRepo: string; sha: string };

async function sourceFiles(directory: string): Promise<string[]> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'),
    )
    .map((entry) => entry.name)
    .sort();
}

function generated(source: string, sha: string, kind: 'client' | 'contract'): string {
  let body = source;
  if (kind === 'client') {
    body = body.replace("from '../../../contracts/v1/index'", "from '../contracts/index'");
  } else {
    body = body.replace(/from '@\/contracts\/v1\/([^']+)'/g, "from './$1'");
    body = body.replace(/from '@\/contracts\/v1'/g, "from './index'");
  }
  return `// GENERATED from CogNerd_CMS@${sha}. Do not edit; run npm run sync:client.\n${body}`;
}

async function copySet(
  sourceDirectory: string,
  targetDirectory: string,
  files: string[],
  sha: string,
  kind: 'client' | 'contract',
): Promise<void> {
  await mkdir(targetDirectory, { recursive: true });
  await Promise.all(
    files.map(async (file) => {
      const source = await readFile(path.join(sourceDirectory, file), 'utf8');
      await writeFile(path.join(targetDirectory, file), generated(source, sha, kind), 'utf8');
    }),
  );
}

export async function syncClient(options: SyncOptions): Promise<{
  clientFiles: string[];
  contractFiles: string[];
}> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const targetRepo = path.resolve(options.targetRepo);
  const clientSource = path.join(sourceRoot, 'packages/cms-client/src');
  const contractSource = path.join(sourceRoot, 'contracts/v1');
  const clientFiles = await sourceFiles(clientSource);
  const contractFiles = await sourceFiles(contractSource);
  await copySet(
    clientSource,
    path.join(targetRepo, 'lib/cms/client'),
    clientFiles,
    options.sha,
    'client',
  );
  await copySet(
    contractSource,
    path.join(targetRepo, 'lib/cms/contracts'),
    contractFiles,
    options.sha,
    'contract',
  );
  return { clientFiles, contractFiles };
}

async function main() {
  const targetRepo = process.argv[2];
  if (!targetRepo) throw new Error('Usage: npm run sync:client -- <target-repo>');
  const sourceRoot = process.cwd();
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: sourceRoot,
    encoding: 'utf8',
  }).trim();
  const result = await syncClient({ sourceRoot, targetRepo, sha });
  console.log(
    `Synced ${result.clientFiles.length} client and ${result.contractFiles.length} contract files to ${path.resolve(targetRepo)}.`,
  );
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
