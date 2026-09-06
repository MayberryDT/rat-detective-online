import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getFreePort, spawnProcess, stopProcess, waitForHttpOk } from './lib/process.mjs';

const extraIndex = process.argv.indexOf('--');
const command = extraIndex === -1 ? [] : process.argv.slice(extraIndex + 1);
if (command.length === 0) {
  console.error('Usage: node scripts/with-local-worker.mjs -- <command>...');
  process.exit(2);
}

const persistTo = mkdtempSync(join(tmpdir(), 'rat-detective-ci-'));
const inspectorPort = await getFreePort();
const port = Number(process.env.WORKER_PORT || await getFreePort());
const origin = `http://127.0.0.1:${port}`;

const wrangler = spawnProcess('npx', [
  'wrangler', 'dev',
  '--port', String(port),
  '--ip', '127.0.0.1',
  '--inspector-port', String(inspectorPort),
  '--persist-to', persistTo,
  '--local',
  '--show-interactive-dev-session', 'false',
], { stdio: 'inherit' });

let exitCode = 1;
try {
  await waitForHttpOk(`${origin}/health`, { timeoutMs: 90_000 });
  const result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    env: {
      ...process.env,
      SMOKE_URL: `${origin}/`,
      BROWSER_SMOKE_URL: `${origin}/`,
      SMOKE_WS_URL: `ws://127.0.0.1:${port}/ws`,
    },
  });
  exitCode = result.status ?? 1;
} finally {
  await stopProcess(wrangler);
  rmSync(persistTo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
process.exit(exitCode);
