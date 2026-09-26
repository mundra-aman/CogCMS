import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

let server: MongoMemoryReplSet | null = null;

export async function setup(project: TestProject): Promise<void> {
  const testRoot = path.join(process.cwd(), '.next', 'test-mongo');
  const dbPath = path.join(testRoot, randomUUID());
  const downloadDir = path.join(testRoot, 'binaries');
  await Promise.all([mkdir(dbPath, { recursive: true }), mkdir(downloadDir, { recursive: true })]);
  server = await MongoMemoryReplSet.create({
  binary: {
    downloadDir,
    version: '7.0.14',
  },
  instanceOpts: [{ dbPath }],
  replSet: { count: 1 },
});
  project.provide('mongoUri', server.getUri());
}

export async function teardown(): Promise<void> {
  await server?.stop();
  server = null;
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
