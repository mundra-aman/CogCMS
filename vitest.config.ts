import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': root } },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'lib/**/*.test.ts',
            'app/**/*.test.ts',
            'contracts/**/*.test.ts',
            'packages/**/*.test.ts',
            'scripts/**/*.test.ts',
            'tests/unit/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/setup/global.ts'],
          setupFiles: ['tests/setup/integration.ts'],
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
