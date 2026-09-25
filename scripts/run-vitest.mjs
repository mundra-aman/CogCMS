import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const workspaceTemp = path.join(process.cwd(), '.next', 'tmp');
mkdirSync(workspaceTemp, { recursive: true });

const child = spawn(
  process.execPath,
  [path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs'), ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      TEMP: workspaceTemp,
      TMP: workspaceTemp,
      TMPDIR: workspaceTemp,
    },
  },
);

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
