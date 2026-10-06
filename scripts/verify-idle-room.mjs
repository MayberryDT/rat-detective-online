// E2E: the public room plays only while a human holds a seat (Tyler, 3 October 2026: the empty city cost about
// 16 USD a day). Starts a local `wrangler dev`, then checks four phases against the canonical room's own SQLite
// files and its 5-second `room diagnostics` log line (emitted only by a running tick):
//   1. empty: /status shows no bots, no tick, and the room's storage does not change;
//   2. a human joins: bots roll, snapshots stream, the tick logs and storage grows;
//   3. the human leaves: after the 30 s reconnect grace the room stops on its own;
//   4. idle: no bots, no tick, no alarm and not one row written for longer than the bot heartbeat.
// Usage: node scripts/verify-idle-room.mjs [--output file.json]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { getFreePort, spawnProcess, stopProcess, waitForHttpOk } from './lib/process.mjs';
import { readSocketMessage, PROTOCOL_VERSION } from './lib/network-codec.mjs';

const { values } = parseArgs({ options: { output: { type: 'string' } } });
const RECONNECT_GRACE_MS = 30_000, IDLE_WINDOW_MS = 20_000, PLAY_MS = 15_000;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const persistTo = mkdtempSync(join(tmpdir(), 'rat-idle-room-'));
const port = await getFreePort(), inspectorPort = await getFreePort();
const origin = `http://127.0.0.1:${port}`;
const logs = [];
const wrangler = spawnProcess('npx', ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1',
  '--inspector-port', String(inspectorPort), '--persist-to', persistTo, '--local', '--show-interactive-dev-session', 'false'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [wrangler.stdout, wrangler.stderr]) stream.on('data', chunk => {
  for (const line of String(chunk).split('\n')) if (line.trim()) logs.push({ at: Date.now(), line });
});
const ticksBetween = (from, to) => logs.filter(entry => entry.at >= from && entry.at < to && entry.line.includes('room diagnostics')).length;

/** Every GameRoom database (rows, and workerd's metadata with the alarm), as a logical dump. A WAL checkpoint moves
 * pages between files without changing a row, so equal dumps mean nothing was written. */
function roomStorage() {
  const root = join(persistTo, 'v3', 'do');
  const dirs = existsSync(root) ? readdirSync(root).filter(name => name.includes('GameRoom')) : [];
  const files = dirs.flatMap(dir => readdirSync(join(root, dir)).filter(name => name.endsWith('.sqlite')).map(name => join(root, dir, name)));
  const hash = createHash('sha256'), perFile = {};
  for (const file of files.sort()) {
    const dump = execFileSync('sqlite3', ['-readonly', file, '.dump'], { maxBuffer: 1 << 28 });
    hash.update(`${file}:`); hash.update(dump);
    perFile[file.slice(root.length + 1)] = { dumpBytes: dump.length, sha256: createHash('sha256').update(dump).digest('hex').slice(0, 16),
      // workerd keeps the object's alarm here: a row while one is set, none when the room has no wake.
      ...(file.endsWith('metadata.sqlite') ? { dump: String(dump) } : {}) };
  }
  return { files: perFile, digest: hash.digest('hex') };
}
async function status() {
  const response = await fetch(`${origin}/status`);
  assert.equal(response.status, 200);
  return response.json();
}
async function idleWindow(label) {
  const start = Date.now(), board = await status(), before = roomStorage();
  await pause(IDLE_WINDOW_MS);
  const after = roomStorage(), end = Date.now(), last = await status();
  const result = { label, ms: end - start, bots: [board.bots, last.bots], players: [board.players, last.players],
    tickLogs: ticksBetween(start, end), storageBefore: before, storageAfter: after, storageChanged: before.digest !== after.digest };
  assert.equal(board.bots, 0, `${label}: bots at start`); assert.equal(last.bots, 0, `${label}: bots at end`);
  assert.equal(result.tickLogs, 0, `${label}: the tick logged`);
  assert(!result.storageChanged, `${label}: room storage changed while idle ${JSON.stringify({ before: before.files, after: after.files })}`);
  assert(!JSON.stringify(after.files).includes('INSERT INTO _cf_ALARM'), `${label}: the room still has an alarm`);
  return result;
}

let exitCode = 1;
try {
  await waitForHttpOk(`${origin}/health`, { timeoutMs: 90_000 });
  // /status was the city's old one-time activation; it must not start anything now.
  await status();
  const empty = await idleWindow('empty');

  const url = new URL('/ws', origin); url.protocol = 'ws:'; url.searchParams.set('agent', '1');
  const ws = new WebSocket(url, { headers: { Origin: origin } });
  let welcome, chaosFrames = 0;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('welcome timeout')), 20_000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Idle Check',
      appearance: { hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3 } })));
    ws.on('message', raw => {
      const message = readSocketMessage(ws, raw); if (!message) return;
      if (message.type === 'welcome') { welcome = message; clearTimeout(timeout); resolve(); }
      if (message.type === 'chaos') chaosFrames++;
      if (message.type === 'error') reject(new Error(message.message));
    });
    ws.on('error', reject);
  });
  const playStart = Date.now(), playStorage = roomStorage();
  const pinger = setInterval(() => ws.send(JSON.stringify({ type: 'ping', sentAt: Date.now() })), 1000);
  await pause(PLAY_MS);
  clearInterval(pinger);
  const playing = { welcomeBots: Object.keys(welcome.players).filter(id => id.startsWith('rd-ai-')).length,
    status: await status(), chaosFrames, tickLogs: ticksBetween(playStart, Date.now()),
    storageBefore: playStorage, storageAfter: roomStorage() };
  playing.storageChanged = playing.storageBefore.digest !== playing.storageAfter.digest;
  assert(playing.status.bots >= 6 && playing.status.bots <= 9, 'a human should bring 6-9 bots');
  assert(playing.chaosFrames > PLAY_MS / 1000 * 10, 'snapshots should stream while playing');
  assert(playing.tickLogs >= 2, 'the tick should log while playing');
  assert(playing.storageChanged, 'storage should be written while playing');

  const leftAt = Date.now();
  ws.close(1000, 'done');
  // The rat keeps its seat through the reconnect grace; the room then stops itself (tick or alarm).
  await pause(RECONNECT_GRACE_MS + 5_000);
  const afterGrace = await status();
  const left = { graceMs: Date.now() - leftAt, status: afterGrace, lastTickLogMsAfterLeave:
    Math.max(0, ...logs.filter(entry => entry.line.includes('room diagnostics')).map(entry => entry.at - leftAt)) };
  assert.equal(afterGrace.bots, 0, 'bots should leave with the last human');
  assert.equal(afterGrace.players, 0);

  const idle = await idleWindow('after the last human');
  const result = { verifiedAt: new Date().toISOString(), origin, phases: { empty, playing, left, idle } };
  const text = JSON.stringify(result, null, 2) + '\n';
  if (values.output) writeFileSync(values.output, text);
  console.log(text);
  exitCode = 0;
} catch (error) {
  console.error(error);
  console.error(logs.slice(-40).map(entry => entry.line).join('\n'));
} finally {
  await stopProcess(wrangler);
  rmSync(persistTo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
process.exit(exitCode);
