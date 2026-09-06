import { resolve } from 'node:path';
import {
  DEFAULT_PORT,
  fileMtimeMs,
  getFreePort,
  installShutdown,
  spawnProcess,
  stopProcess,
  waitForHttpOk,
  waitForPath,
} from './lib/process.mjs';

const port = Number(process.env.PORT || DEFAULT_PORT);
const persistTo = resolve(process.env.WRANGLER_PERSIST_TO || '.wrangler/state/dev');
const inspectorPort = Number(process.env.WRANGLER_INSPECTOR_PORT || await getFreePort());
const distIndex = resolve('dist/index.html');

const extra = process.argv.slice(2);
const previousMtime = fileMtimeMs(distIndex);
const startedAt = Date.now() - 1_000;
const vite = spawnProcess('npx', ['vite', 'build', '--watch'], { stdio: 'inherit' });
let wrangler;

const stop = installShutdown([
  () => stopProcess(wrangler),
  () => stopProcess(vite),
]);

let onEarlyExit;
try {
  await Promise.race([
    waitForPath(() => {
      const mtime = fileMtimeMs(distIndex);
      return mtime > previousMtime && mtime >= startedAt;
    }, { timeoutMs: 90_000 }),
    new Promise((_, reject) => {
      onEarlyExit = (code, signal) => {
        reject(new Error(`vite watch exited before initial build (${code ?? signal})`));
      };
      vite.once('exit', onEarlyExit);
    }),
  ]);
} catch (error) {
  await stop();
  throw error;
} finally {
  if (onEarlyExit) vite.off('exit', onEarlyExit);
}

const wranglerArgs = [
  'wrangler', 'dev',
  '--port', String(port),
  '--ip', '127.0.0.1',
  '--inspector-port', String(inspectorPort),
  '--persist-to', persistTo,
  '--local',
  '--show-interactive-dev-session', 'false',
  ...extra,
];
wrangler = spawnProcess('npx', wranglerArgs, { stdio: 'inherit' });

wrangler.on('exit', async code => {
  await stopProcess(vite);
  process.exit(code ?? 1);
});
vite.on('exit', async code => {
  if (code) {
    await stopProcess(wrangler);
    process.exit(code);
  }
});

try {
  await waitForHttpOk(`http://127.0.0.1:${port}/health`, { timeoutMs: 90_000 });
} catch (error) {
  await stop();
  throw error;
}
console.log(`Fullstack watch ready at http://127.0.0.1:${port} (rebuilds client assets on change)`);

await new Promise(() => {});
