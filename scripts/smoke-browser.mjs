import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

import { resolveSmokeHttpUrl } from './lib/process.mjs';

const targetUrl = withBrowserSmokeRoom(resolveSmokeHttpUrl(process.argv[2]));
const viewport = { width: 780, height: 493 };
const expectWebglError = process.env.EXPECT_WEBGL_ERROR === '1';
const extraChromeArgs = process.env.CHROME_EXTRA_ARGS
  ? process.env.CHROME_EXTRA_ARGS.split(/\s+/).filter(Boolean)
  : [];
const smokeComplete = Symbol('smokeComplete');

function withBrowserSmokeRoom(rawUrl) {
  const url = new URL(rawUrl);
  if (!url.searchParams.has('room')) {
    url.searchParams.set('room', `browser-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }
  return url.toString();
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;

  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' });
    const path = result.stdout.trim();
    if (path) return path;
  }

  throw new Error('Chrome/Chromium not found. Set CHROME_BIN to run browser smoke.');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
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
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function makeCdpClient(socketUrl) {
  const socket = new WebSocket(socketUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.method === 'Runtime.consoleAPICalled') {
      events.push({
        kind: 'console',
        type: message.params.type,
        text: message.params.args.map((arg) => ('value' in arg ? String(arg.value) : arg.description || arg.type)).join(' '),
      });
    }

    if (message.method === 'Runtime.exceptionThrown') {
      events.push({
        kind: 'exception',
        text: message.params.exceptionDetails.text,
        exception: message.params.exceptionDetails.exception?.description,
      });
    }

    if (message.method === 'Network.loadingFailed') {
      events.push({
        kind: 'network-failed',
        errorText: message.params.errorText,
        type: message.params.type,
        canceled: message.params.canceled,
      });
    }

    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      events.push({
        kind: 'network-status',
        status: message.params.response.status,
        url: message.params.response.url,
        type: message.params.type,
      });
    }

    if (message.method === 'Network.webSocketCreated') {
      events.push({ kind: 'ws-created', url: message.params.url });
    }

    if (message.method === 'Network.webSocketFrameSent') {
      try { events.push({ kind: 'ws-sent', message: JSON.parse(message.params.response.payloadData) }); } catch { /* Non-JSON transport frame. */ }
    }

    if (message.method === 'Network.webSocketFrameReceived') {
      events.push({
        kind: 'ws-received',
        payload: message.params.response.payloadData.slice(0, 180),
      });
    }

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
    return new Promise((resolve) => {
      const callId = ++id;
      pending.set(callId, resolve);
      socket.send(JSON.stringify({ id: callId, method, params }));
    });
  }

  return { socket, ready, send, events };
}

function fail(message, details) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

const chromePath = findChrome();
const port = await getFreePort();
const userDataDir = mkdtempSync(join(tmpdir(), 'rat-detective-browser-smoke-'));
const chromeArgs = [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  `--window-size=${viewport.width},${viewport.height}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  ...extraChromeArgs,
  'about:blank',
];
const chrome = spawn(chromePath, chromeArgs, { stdio: 'ignore' });

try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const smokeUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}browserSmoke=${Date.now()}`;
  const tabResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(smokeUrl)}`, {
    method: 'PUT',
  });
  const tab = await tabResponse.json();
  if (!tab?.webSocketDebuggerUrl) fail('No debuggable Chrome tab found');

  const cdp = makeCdpClient(tab.webSocketDebuggerUrl);
  await cdp.ready;
  const { send, events } = cdp;

  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  let beforeState = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const before = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const button = document.querySelector('#enter-city-btn');
        const input = document.querySelector('#player-name');
        const webglError = document.querySelector('.webgl-error-panel');
        const rect = button?.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          button: Boolean(button),
          input: Boolean(input),
          webglError: Boolean(webglError),
          webglText: webglError?.textContent?.slice(0, 300) || '',
          disabled: Boolean(button?.disabled),
          rect: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom },
          centerVisible: rect
            ? rect.x + rect.width / 2 >= 0
              && rect.x + rect.width / 2 <= innerWidth
              && rect.y + rect.height / 2 >= 0
              && rect.y + rect.height / 2 <= innerHeight
            : false,
        };
      })()`,
    });
    beforeState = before.result.result.value;
    if (expectWebglError && beforeState.webglError) break;
    if (beforeState.button && beforeState.input && !beforeState.disabled) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (expectWebglError) {
    if (!beforeState.webglError) fail('WebGL error panel did not appear', { beforeState, events });

    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = join(tmpdir(), 'rat-detective-webgl-error-smoke.png');
    writeFileSync(screenshotPath, Buffer.from(screenshot.result.data, 'base64'));

    console.log(JSON.stringify({
      ok: true,
      targetUrl,
      mode: 'webgl-error',
      before: beforeState,
      screenshot: screenshotPath,
    }, null, 2));
    cdp.socket.close();
    throw smokeComplete;
  }

  if (!beforeState.button || !beforeState.input) fail('Title screen controls missing', { beforeState, events });
  if (beforeState.disabled) fail('Enter button never became enabled', { beforeState, events });
  if (!beforeState.centerVisible) fail('Enter button center is outside the viewport', beforeState);

  await send('Runtime.evaluate', {
    expression: `document.querySelector('#player-name').value = 'Browser Smoke';`,
  });

  const x = Math.floor(beforeState.rect.x + beforeState.rect.width / 2);
  const y = Math.floor(beforeState.rect.y + beforeState.rect.height / 2);
  const hitTest = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const element = document.elementFromPoint(${x}, ${y});
      return {
        id: element?.id || '',
        tagName: element?.tagName || '',
        parentId: element?.parentElement?.id || '',
      };
    })()`,
  });
  const hitTarget = hitTest.result.result.value;
  if (hitTarget.id !== 'enter-city-btn' && hitTarget.parentId !== 'enter-city-btn') {
    fail('Click point is not over the Enter button', { beforeState, hitTarget });
  }

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 7_000));

  const after = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      const title = document.querySelector('#title-screen');
      const scoreboard = document.querySelector('#scoreboard');
      return {
        titleDisplay: title && getComputedStyle(title).display,
        titleClass: title?.className,
        scoreboardDisplay: scoreboard && getComputedStyle(scoreboard).display,
        canvas: Boolean(canvas),
        pointerLock: document.pointerLockElement === canvas,
        text: document.body.innerText.slice(0, 300),
      };
    })()`,
  });
  const afterState = after.result.result.value;
  const receivedWelcome = events.some((event) => event.kind === 'ws-received' && event.payload.includes('"type":"welcome"'));
  const blockingEvents = events.filter((event) => (
    event.kind === 'exception'
    || event.kind === 'network-failed'
    || event.kind === 'network-status'
    || (event.kind === 'console' && event.type === 'error')
  ));

  if (afterState.titleDisplay !== 'none') fail('Title screen did not dismiss after real click', { beforeState, afterState, events });
  if (afterState.scoreboardDisplay !== 'block') fail('Scoreboard did not appear after joining', { beforeState, afterState, events });
  if (!receivedWelcome) fail('WebSocket welcome was not received', { beforeState, afterState, events });
  if (blockingEvents.length > 0) fail('Browser smoke saw blocking console/network errors', { beforeState, afterState, blockingEvents });

  let gameplay;
  if (process.env.SMOKE_GAMEPLAY === '1') {
    if (!afterState.pointerLock) fail('Gameplay smoke requires real pointer lock', afterState);
    const movement = () => events.filter(event => event.kind === 'ws-sent' && event.message.type === 'updateMovement').map(event => event.message);
    const initial = movement().at(-1);
    if (!initial) fail('No initial movement state');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    await new Promise(resolve => setTimeout(resolve, 400));
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    const moved = movement().at(-1);
    const distance = Math.hypot(moved.position.x - initial.position.x, moved.position.z - initial.position.z);
    if (distance < .05) fail('Real keyboard input did not move the rat', { distance });
    const jumpStart = events.length;
    const groundedY = moved.position.y;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await new Promise(resolve => setTimeout(resolve, 250));
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    const peakY = Math.max(...events.slice(jumpStart).filter(event => event.kind === 'ws-sent' && event.message.type === 'updateMovement').map(event => event.message.position.y));
    if (peakY < groundedY + .2) fail('Real Space input did not produce a jump', { groundedY, peakY });
    const shotStart = events.length;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 390, y: 246, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 390, y: 246, button: 'left', buttons: 0, clickCount: 1 });
    await new Promise(resolve => setTimeout(resolve, 100));
    const shot = events.slice(shotStart).find(event => event.kind === 'ws-sent' && event.message.type === 'shoot')?.message;
    if (!shot || !shot.shotId || !Object.values(shot.origin).every(Number.isFinite)) fail('Real mouse click did not send a resolved shot');
    const directionLength = Math.hypot(shot.direction.x, shot.direction.y, shot.direction.z);
    if (Math.abs(directionLength - 1) > 1e-6) fail('Shot direction was not normalized', shot);
    gameplay = { pointerLock: true, movementDistance: distance, jumpRise: peakY - groundedY, resolvedShot: true, directionLength };
  }

  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = join(tmpdir(), 'rat-detective-browser-smoke.png');
  writeFileSync(screenshotPath, Buffer.from(screenshot.result.data, 'base64'));

  console.log(JSON.stringify({
    ok: true,
    targetUrl,
    before: beforeState,
    after: afterState,
    gameplay,
    screenshot: screenshotPath,
  }, null, 2));

  cdp.socket.close();
} catch (error) {
  if (error !== smokeComplete) {
    console.error(error.message);
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  }
} finally {
  if (!chrome.killed) {
    chrome.kill('SIGTERM');
  }
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1_000);
    chrome.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
