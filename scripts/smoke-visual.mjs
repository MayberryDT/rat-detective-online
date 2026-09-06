import { existsSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import { comparePngFiles } from './compare-images.mjs';

const VIEWPORT = { width: 780, height: 493 };
const SEED = Number(process.env.VISUAL_SEED || 20260905);
const STATES = ['alive', 'turned', 'damaged', 'dead', 'respawn'];
const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, process.env.VISUAL_DIST || 'dist-visual');
const BASELINE_DIR = resolve(ROOT, 'test/visual/baselines');
const OUTPUT_DIR = resolve(ROOT, process.env.VISUAL_OUTPUT || 'test-results/visual');
const UPDATE = process.env.UPDATE_VISUAL_BASELINES === '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' });
    const path = result.stdout.trim();
    if (path) return path;
  }
  return null;
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
    server.on('error', reject);
  });
}

function serveDist(directory) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/visual-fixture.html';
    const filePath = resolve(directory, `.${pathname}`);
    if (!filePath.startsWith(directory) || !existsSync(filePath)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  });
  return new Promise(resolveServer => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function waitForJson(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function makeCdpClient(socketUrl) {
  const socket = new WebSocket(socketUrl);
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  function send(method, params = {}) {
    return new Promise(resolve => {
      const callId = ++id;
      pending.set(callId, resolve);
      socket.send(JSON.stringify({ id: callId, method, params }));
    });
  }
  return { socket, ready, send };
}

function baselineName(state) {
  return `seed-${SEED}-${state}.png`;
}

const chromePath = findChrome();
if (!chromePath) {
  console.log(JSON.stringify({
    ok: false,
    skipped: true,
    reason: 'Chrome/Chromium not found. Set CHROME_BIN to capture visual fixtures.',
  }, null, 2));
  process.exit(1);
}

if (!existsSync(join(DIST, 'visual-fixture.html'))) {
  const build = spawnSync('npx', ['vite', 'build', '--config', 'vite.visual.config.ts'], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(BASELINE_DIR, { recursive: true });

const { server, origin } = await serveDist(DIST);
const debugPort = await getFreePort();
const userDataDir = mkdtempSync(join(tmpdir(), 'rat-detective-visual-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  'about:blank',
], { stdio: 'ignore' });

const report = { ok: true, seed: SEED, origin, captures: [], comparisons: [], baselinesRecorded: false };
let exitCode = 0;

try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const fixtureUrl = `${origin}/visual-fixture.html?seed=${SEED}&state=alive`;
  const tabResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(fixtureUrl)}`, { method: 'PUT' });
  const tab = await tabResponse.json();
  const cdp = makeCdpClient(tab.webSocketDebuggerUrl);
  await cdp.ready;
  const { send } = cdp;
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  async function waitReady(state) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const result = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const status = document.querySelector('#fixture-status');
          return {
            text: status?.textContent || '',
            ready: status?.dataset.ready === 'true',
            state: status?.dataset.state || '',
          };
        })()`,
      });
      const value = result.result.result.value;
      if (value.ready && value.state === state) return value;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`Fixture did not become ready for state=${state}`);
  }

  async function clickState(state) {
    const label = state[0].toUpperCase() + state.slice(1);
    const hit = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(label)});
        const rect = button?.getBoundingClientRect();
        return rect && { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      })()`,
    });
    const point = hit.result.result.value;
    if (!point) throw new Error(`Missing ${label} button`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
  }

  await waitReady('alive');

  for (const state of STATES) {
    if (state !== 'alive') {
      await clickState(state);
      await waitReady(state);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    const actualPath = join(OUTPUT_DIR, baselineName(state));
    writeFileSync(actualPath, Buffer.from(screenshot.result.data, 'base64'));
    report.captures.push({ state, path: actualPath });

    const expectedPath = join(BASELINE_DIR, baselineName(state));
    if (UPDATE) {
      copyFileSync(actualPath, expectedPath);
      report.comparisons.push({ state, status: 'recorded', expectedPath, actualPath });
      continue;
    }
    const comparison = comparePngFiles(expectedPath, actualPath);
    report.comparisons.push({ state, ...comparison });
    if (comparison.status !== 'match') report.ok = false;
  }
  cdp.socket.close();
} catch (error) {
  report.ok = false;
  report.error = error.message;
  exitCode = 1;
} finally {
  if (!chrome.killed) chrome.kill('SIGTERM');
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 1_000);
    chrome.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  await new Promise(resolve => server.close(resolve));
}

const missing = report.comparisons.filter(entry => entry.status === 'missing-baseline');
if (UPDATE) {
  report.baselinesRecorded = true;
  report.ok = !report.error;
  exitCode = report.ok ? 0 : 1;
} else if (missing.length === STATES.length) {
  report.ok = false;
  report.incomplete = true;
  report.reason = 'No visual baselines recorded. Captures are in test-results/visual. Run UPDATE_VISUAL_BASELINES=1 after a reviewed capture.';
  exitCode = 1;
} else if (!report.ok) {
  exitCode = 1;
}

writeFileSync(join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(exitCode);
