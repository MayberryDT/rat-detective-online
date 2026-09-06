import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync, statSync } from 'node:fs';

export const DEFAULT_ORIGIN = 'http://127.0.0.1:5173';
export const DEFAULT_WS_URL = 'ws://127.0.0.1:5173/ws';
export const DEFAULT_PORT = 5173;

export function getFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
}

export function spawnProcess(command, args, options = {}) {
  const detached = options.detached ?? true;
  const child = spawn(command, args, {
    stdio: options.stdio ?? 'inherit',
    env: { ...process.env, ...options.env },
    cwd: options.cwd,
    detached,
  });
  child.processGroup = detached;
  child.on('error', error => {
    if (options.onError) options.onError(error);
    else console.error(error);
  });
  return child;
}

export async function waitForHttpOk(url, { timeoutMs = 60_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.ok) return response;
      lastError = new Error(`${url} -> ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

export async function waitForPath(check, { timeoutMs = 60_000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(intervalMs);
  }
  throw new Error('Timed out waiting for a required path');
}

export function fileMtimeMs(path) {
  try {
    return existsSync(path) ? statSync(path).mtimeMs : 0;
  } catch {
    return 0;
  }
}

function processExited(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

function groupIsRunning(child) {
  if (!child?.pid) return false;
  if (!child.processGroup) return !processExited(child);
  try { process.kill(-child.pid, 0); return true; } catch { return false; }
}

function sendSignal(child, signal) {
  if (!child?.pid) return;
  try {
    if (child.processGroup) process.kill(-child.pid, signal);
    else if (!processExited(child)) child.kill(signal);
  } catch {
    // The owned process or group has already exited.
  }
}

export function stopProcess(child, signal = 'SIGTERM') {
  if (!groupIsRunning(child)) return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(escalation);
      clearInterval(poll);
      resolve();
    };
    // A wrapper can exit before a descendant that ignores TERM. Keep checking
    // the owned group after leader exit instead of abandoning those children.
    const poll = setInterval(() => { if (!groupIsRunning(child)) finish(); }, 50);
    const escalation = setTimeout(() => {
      sendSignal(child, 'SIGKILL');
      setTimeout(finish, 100); // Allow delivery/reaping without waiting on zombies.
    }, 2_000);
    sendSignal(child, signal);
    if (!groupIsRunning(child)) finish();
  });
}

export function installShutdown(handlers) {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    for (const handler of handlers) {
      try {
        await handler();
      } catch {
        // Keep shutting down remaining processes.
      }
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stop().finally(() => process.exit(0));
    });
  }
  return stop;
}

export function resolveSmokeHttpUrl(raw) {
  return raw || process.env.BROWSER_SMOKE_URL || process.env.SMOKE_URL || `${DEFAULT_ORIGIN}/`;
}

export function resolveSmokeWsUrl(raw) {
  const value = raw || process.env.SMOKE_WS_URL || DEFAULT_WS_URL;
  const url = new URL(value, DEFAULT_ORIGIN);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/ws';
  return url;
}
