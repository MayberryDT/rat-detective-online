import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';
// Bounded transport probe, not a capacity or browser-render benchmark.
// node scripts/probe-network.mjs http://127.0.0.1:5174 --seconds=45 --output=/tmp/baseline.json
// Optional --token-file=/tmp/private-secret.json reads NETWORK_TEST_TOKEN without logging it.
import { readFile, writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import WebSocket from 'ws';
import { resolveSmokeWsUrl } from './lib/process.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  seconds: { type: 'string', default: '45' }, output: { type: 'string' },
  'shot-ms': { type: 'string', default: '1200' },
  'token-file': { type: 'string' }, pids: { type: 'string', default: '' },
} });
const seconds = Number(values.seconds);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 300) throw new Error('seconds must be 5–300');
const shotMs = Number(values['shot-ms']);
if (!Number.isFinite(shotMs) || shotMs < 350 || shotMs > 5000) throw new Error('shot-ms must be 350–5000');
const url = resolveSmokeWsUrl(positionals[0]);
url.searchParams.set('room', `graybox-practice-probe-${crypto.randomUUID()}`);
url.searchParams.delete('receive');
const token = values['token-file'] ? JSON.parse(await readFile(values['token-file'], 'utf8')).NETWORK_TEST_TOKEN : undefined;
const headers = { Origin: url.origin.replace(/^ws/, 'http'), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const clients = [], players = new Map(), gaps = [], rtts = [], anomalies = [];
const messages = {}, bytes = {};
const loop = monitorEventLoopDelay({ resolution: 10 });
const appearance = { hatType: 'fedora', hatColor: 0xdc4a3c, furColor: 0xe8b84d, coatColor: 0xbe4545 };
let started = 0, lastChaos = 0, sent = 0, shotsSent = 0, disconnects = 0, errors = 0, playing = true, stopping = false;
let peakBalls = 0, lastHost, hostPending = false, hostTimer, timer;
const pids = values.pids.split(',').filter(Boolean).map(Number);
const round = n => Math.round(n * 100) / 100;
function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = p => round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0);
  return { count: sorted.length, mean: round(sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1)),
    p50: at(.5), p95: at(.95), p99: at(.99), max: at(1), over250: sorted.filter(x => x > 250).length };
}
async function sampleHost() {
  if (hostPending || !pids.length) return;
  hostPending = true;
  try {
    const processes = await Promise.all(pids.map(async pid => {
      try {
        const [stat, schedule, status] = await Promise.all(['stat', 'schedstat', 'status'].map(f => readFile(`/proc/${pid}/${f}`, 'utf8')));
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        const [cpuNs, waitNs] = schedule.trim().split(' ').map(Number);
        return { pid, majorFaults: Number(fields[9]), minorFaults: Number(fields[7]), cpuNs, waitNs,
          swapKb: Number(status.match(/VmSwap:\s+(\d+)/)?.[1] || 0) };
      } catch { return { pid, unavailable: true }; }
    }));
    lastHost = { at: Date.now(), processes };
  } finally { hostPending = false; }
}
function onMessage(client, raw) {
  let message;
  try { message = readSocketMessage(client.ws,raw);if(!message)return; } catch { errors++; return; }
  if (message.type === 'welcome') {
    client.id = message.id; Object.values(message.players).forEach(p => players.set(p.id, p)); client.welcome(message);
  }
  if (message.type === 'pong' && started) rtts.push(Date.now() - message.sentAt);
  if (client.index !== 0) return;
  if (started) {
    messages[message.type] = (messages[message.type] || 0) + 1;
    bytes[message.type] = (bytes[message.type] || 0) + raw.length;
  }
  switch (message.type) {
    case 'currentPlayers':
      players.clear(); Object.values(message.players).forEach(p => players.set(p.id, p));
      for (const bot of clients) if (players.has(bot.id)) bot.base = { ...players.get(bot.id) };
      break;
    case 'playerJoined': players.set(message.player.id, message.player); break;
    case 'playerDamaged': if (players.has(message.id)) players.get(message.id).hp = message.hp; break;
    case 'playerDied': if (players.has(message.victimId)) players.get(message.victimId).hp = 0; break;
    case 'playerRespawn':
      if (players.has(message.id)) Object.assign(players.get(message.id), message);
      for (const bot of clients) if (bot.id === message.id) bot.base = { ...message };
      break;
    case 'gameWon': playing = false; break;
    case 'gameReset': playing = true; break;
    case 'error': errors++; break;
    case 'chaos': {
      const now = Date.now();
      if (started && lastChaos) {
        const gap = now - lastChaos; gaps.push(gap);
        if (gap > 250 && anomalies.length < 32) anomalies.push({ at: now, gapMs: gap, host: lastHost });
      }
      lastChaos = now; peakBalls = Math.max(peakBalls, message.state.shots.length); break;
    }
  }
}
async function open(index) {
  const target = new URL(url); if (index) target.searchParams.set('receive', 'welcome-only');
  const client = { index, ws: new WebSocket(target, { headers }), lastMove: 0, lastShot: 0, lastPing: 0 };
  clients.push(client);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Rat ${index}: welcome timeout`)), 10_000);
    client.welcome = message => { clearTimeout(timeout); client.base = { ...message.player }; resolve(); };
    client.ws.on('open', () => client.ws.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: `Probe Rat ${index + 1}`, appearance })));
    client.ws.on('message', raw => onMessage(client, raw));
    client.ws.on('error', () => { errors++; clearTimeout(timeout); reject(new Error(`Rat ${index}: connection failed`)); });
    client.ws.on('close', () => { if (!stopping) disconnects++; });
  });
}
function send(client, message) {
  if (client.ws.readyState !== WebSocket.OPEN) return;
  client.ws.send(JSON.stringify(message)); sent++;
}
let failure;
try {
  for (let i = 0; i < 12; i++) await open(i);
  await sampleHost(); const hostBefore = lastHost;
  loop.enable(); started = Date.now(); lastChaos = 0;
  timer = setInterval(() => {
    const now = Date.now(), t = (now - started) / 1000;
    for (const client of clients) {
      if (now - client.lastPing >= 1000) { client.lastPing = now; send(client, { type: 'ping', sentAt: now }); }
      const player = players.get(client.id); if (!playing || !player || player.hp <= 0) continue;
      const phase = t + client.index;
      const position = { x: client.base.x + Math.sin(phase) * .4, y: client.base.y, z: client.base.z + Math.cos(phase) * .4 };
      if (now - client.lastMove >= (client.index ? 100 : 50)) {
        client.lastMove = now;
        send(client, { type: 'updateMovement', position, rotation: { x: 0, y: 0, z: 0, w: 1 },
          meshRotation: { x: 0, y: Math.sin(phase / 2), z: 0, w: Math.cos(phase / 2) } });
      }
      if (now - client.lastShot >= shotMs) {
        client.lastShot = now; shotsSent++;
        send(client, { type: 'shoot', shotId: crypto.randomUUID(),
          origin: { ...position, y: position.y + 1.45 }, direction: { x: Math.sin(phase), y: 0, z: Math.cos(phase) } });
      }
    }
  }, 25);
  hostTimer = setInterval(() => { void sampleHost(); }, 500);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  clearInterval(timer); clearInterval(hostTimer); await sampleHost(); loop.disable();
  const report = { target: url.origin, room: url.searchParams.get('room'), startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started, clients: 12, mode: 'one-feed-eleven-welcome-only',
    workload: `20Hz human / 10Hz bot poses; each shoots every ${shotMs}ms, pings every 1s`,
    gapsMs: summary(gaps), pingRttMs: summary(rtts), probeLoopDelayMs: { p99: round(loop.percentile(99) / 1e6), max: round(loop.max / 1e6) },
    sent, shotsSent, disconnects, errors, peakBalls, messages, bytes, hostBefore, hostAfter: lastHost, anomalies };
  if (values.output) await writeFile(values.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) { failure = error; }
finally {
  stopping = true; clearInterval(timer); clearInterval(hostTimer); loop.disable();
  await Promise.all(clients.map(client => new Promise(resolve => {
    if (client.ws.readyState === WebSocket.CLOSED) return resolve();
    const timeout = setTimeout(() => { client.ws.terminate(); resolve(); }, 1000);
    client.ws.once('close', () => { clearTimeout(timeout); resolve(); }); client.ws.close();
  })));
}
if (failure) throw failure;
