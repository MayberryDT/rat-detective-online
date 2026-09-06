import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_PORT, installShutdown, spawnProcess, stopProcess, waitForHttpOk } from './lib/process.mjs';

const port = Number(process.env.PORT || DEFAULT_PORT);
const persistTo = resolve('.wrangler/state/preview');
const extra = process.argv.slice(2);

const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const wrangler = spawnProcess('npx', [
  'wrangler', 'dev',
  '--port', String(port),
  '--ip', '127.0.0.1',
  '--persist-to', persistTo,
  '--local',
  '--show-interactive-dev-session', 'false',
  ...extra,
], { stdio: 'inherit' });

installShutdown([() => stopProcess(wrangler)]);
wrangler.on('exit', code => process.exit(code ?? 1));

await waitForHttpOk(`http://127.0.0.1:${port}/health`, { timeoutMs: 90_000 });
console.log(`Fullstack preview ready at http://127.0.0.1:${port}`);
await new Promise(() => {});
