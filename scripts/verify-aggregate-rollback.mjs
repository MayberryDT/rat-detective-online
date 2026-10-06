// E2E: packed aggregates (docs/plans/data-cost-2026-10.md) keep every count readable across an upgrade, the
// rollback mode and a rollback to the release before packing. Two rooms play on one persisted local state, the
// canonical room and a private one (every GameRoom keeps its own aggregates):
//   A. the old release plays: per-key rows only;
//   B. this release reads them unchanged, then plays: packs on top, no new per-key rows;
//   C. this release with CITY_AGGREGATES=rows reads the same and plays (per-key rows, no packs); then
//      scripts/unpack-city-aggregates.mjs drains every room's packs by object id;
//   D. the old release reads exactly what C ended with;
//   E. this release reads the same again.
// Each phase records, once the rooms have stopped, the canonical room's public aggregates (heat, places, flows over all
// days) and every room's stored totals per key (per-key rows plus unpacked packs, summed in SQLite). The stored
// totals must not change from the end of one phase to the start of the next, nor through the unpack; after it every
// room holds no pack, so the per-key tables alone (all the old release reads) carry them.
// Both checkouts need `npm ci` and `npm run build` (dist/).
// Usage: node scripts/verify-aggregate-rollback.mjs --old <checkout> [--new <checkout>] [--output file.json]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { getFreePort, spawnProcess, stopProcess, waitForHttpOk } from './lib/process.mjs';
import { readSocketMessage, PROTOCOL_VERSION } from './lib/network-codec.mjs';

const { values } = parseArgs({ options: { old: { type: 'string' }, new: { type: 'string', default: '.' }, output: { type: 'string' } } });
if (!values.old) throw new Error('--old <checkout of the release before packing> is required');
const OLD = resolve(values.old), NEW = resolve(values.new);
for (const dir of [OLD, NEW]) assert(existsSync(join(dir, 'dist')) && existsSync(join(dir, 'node_modules/.bin/wrangler')), `${dir}: run npm ci and npm run build`);
const TOKEN = 'rollback-check-token', PLAY_MS = 15_000, STOP_MS = 40_000, PRIVATE = 'graybox-practice-rollback-check';
const pause = ms => new Promise(r => setTimeout(r, ms));
const persistTo = mkdtempSync(join(tmpdir(), 'rat-aggregate-rollback-'));

/** One `wrangler dev` of a checkout on the shared persisted state. */
async function serve(dir, vars = {}) {
  const port = await getFreePort(), inspectorPort = await getFreePort(), logs = [];
  const varArgs = Object.entries({ CITY_TOKEN: TOKEN, ...vars }).flatMap(([k, v]) => ['--var', `${k}:${v}`]);
  const child = spawnProcess(join(dir, 'node_modules/.bin/wrangler'), ['dev', '--port', String(port), '--ip', '127.0.0.1', '--inspector-port', String(inspectorPort),
    '--persist-to', persistTo, '--local', '--show-interactive-dev-session', 'false', ...varArgs], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => logs.push(String(chunk)));
  const origin = `http://127.0.0.1:${port}`;
  try { await waitForHttpOk(`${origin}/health`, { timeoutMs: 120_000 }); } catch (error) { console.error(logs.join('')); await stopProcess(child); throw error; }
  return { origin, logs, stop: () => stopProcess(child) };
}

/** A human seat in each room for PLAY_MS, then the rooms left to stop on their own (reconnect grace, final flush). */
async function play(origin) {
  const seat = room => new Promise((done, fail) => {
    const url = new URL('/ws', origin); url.protocol = 'ws:';
    if (room) url.searchParams.set('room', room);
    const ws = new WebSocket(url, { headers: { Origin: origin } });
    const timeout = setTimeout(() => fail(new Error(`welcome timeout ${room ?? 'canonical'}`)), 20_000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Rollback Check', appearance: { hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3 } })));
    ws.on('message', raw => { const m = readSocketMessage(ws, raw); if (m?.type === 'welcome') { clearTimeout(timeout); done(ws); } if (m?.type === 'error') fail(new Error(m.message)); });
    ws.on('error', fail);
  });
  const sockets = [await seat(), await seat(PRIVATE)];
  const pinger = setInterval(() => { for (const ws of sockets) ws.send(JSON.stringify({ type: 'ping', sentAt: Date.now() })); }, 1000);
  await pause(PLAY_MS);
  clearInterval(pinger); for (const ws of sockets) ws.close(1000, 'done');
  await pause(STOP_MS);
  const status = await (await fetch(`${origin}/status`)).json();
  assert.equal(status.bots, 0, 'the canonical room should stop once the human leaves');
}

const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
/** The canonical room's public aggregates over all days; flows in a fixed order (equal counts may come back in either order). */
async function aggregates(origin) {
  const get = async path => { const r = await fetch(origin + path); assert.equal(r.status, 200, path); return r.json(); };
  const heat = await get('/api/heat/v1?days=all'), places = await get('/api/city/v1/places?days=all'), flows = await get('/api/city/v1/flows?days=all');
  for (const body of [heat, places, flows]) { delete body.from; delete body.to; }
  flows.flows.sort((a, b) => b.n - a.n || `${a.src}|${a.dst}|${a.who}`.localeCompare(`${b.src}|${b.dst}|${b.who}`));
  return sorted({ heat, places, flows });
}

const LEGACY = `SELECT 'cells|'||day||'|'||build||'|'||layout||'|'||mode||'|'||layer||'|'||cell AS k, n FROM city_cells
  UNION ALL SELECT 'places|'||day||'|'||build||'|'||layout||'|'||mode||'|'||place||'|'||measure, n FROM city_places
  UNION ALL SELECT 'flows|'||day||'|'||build||'|'||layout||'|'||mode||'|'||src||'|'||dst||'|'||who, n FROM city_flows
  UNION ALL SELECT 'minds|'||day||'|'||build||'|'||layout||'|'||mode||'|'||measure, n FROM city_minds`;
const PACKED = `SELECT kind||'|'||day||'|'||build||'|'||layout||'|'||mode||'|'||(CASE WHEN kind = 'cells' THEN layer||'|' ELSE '' END)||j.key AS k, j.value AS n
  FROM city_packs, json_each(city_packs.data) AS j`;
/** Every GameRoom's stored totals per key (per-key rows and packs together), its pack and per-key row counts. */
function storage() {
  const root = join(persistTo, 'v3', 'do'), rooms = {};
  for (const dir of existsSync(root) ? readdirSync(root).filter(n => n.includes('GameRoom')) : [])
    for (const file of readdirSync(join(root, dir)).filter(n => n.endsWith('.sqlite') && n !== 'metadata.sqlite')) {
      const path = join(root, dir, file), q = sql => execFileSync('sqlite3', ['-readonly', '-separator', '\t', path, sql], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
      const tables = q("SELECT name FROM sqlite_master WHERE type = 'table'").split('\n');
      if (!tables.includes('city_cells')) continue;
      const packed = tables.includes('city_packs');
      const totals = {};
      for (const line of q(`SELECT k, SUM(n) FROM (${LEGACY}${packed ? ` UNION ALL ${PACKED}` : ''}) GROUP BY k`).split('\n').filter(Boolean)) {
        const [k, n] = line.split('\t'); totals[k] = Number(n);
      }
      rooms[file.slice(0, -'.sqlite'.length)] = { packs: packed ? Number(q('SELECT COUNT(*) FROM city_packs')) : 0, rows: Number(q(`SELECT COUNT(*) FROM (${LEGACY})`)), totals };
    }
  return rooms;
}
const totalsOf = rooms => Object.fromEntries(Object.entries(rooms).map(([id, r]) => [id, r.totals]));
const sum = rooms => Object.values(rooms).reduce((t, r) => t + Object.values(r.totals).reduce((a, n) => a + n, 0), 0);

const phases = {};
let exitCode = 1, server;
try {
  server = await serve(OLD);
  await play(server.origin);
  phases.A = { release: 'old', aggregates: await aggregates(server.origin), storage: storage() };
  await server.stop();
  assert.equal(Object.keys(phases.A.storage).length, 2, 'A: both rooms recorded');
  for (const [id, r] of Object.entries(phases.A.storage)) assert(r.rows > 0 && r.packs === 0, `A ${id}: the old release writes per-key rows only`);

  server = await serve(NEW);
  assert.deepEqual(await aggregates(server.origin), phases.A.aggregates, 'B: this release reads the old rows unchanged');
  const refused = await fetch(`${server.origin}/api/city/v1/unpack`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(refused.status, 409, 'B: unpack is refused in packs mode');
  await play(server.origin);
  phases.B = { release: 'new', aggregates: await aggregates(server.origin), storage: storage() };
  await server.stop();
  for (const [id, r] of Object.entries(phases.B.storage)) {
    assert(r.packs > 0, `B ${id}: play writes packs`);
    assert.equal(r.rows, phases.A.storage[id].rows, `B ${id}: play writes no per-key rows`);
  }
  assert(sum(phases.B.storage) > sum(phases.A.storage), 'B: play adds counts');

  server = await serve(NEW, { CITY_AGGREGATES: 'rows' });
  assert.deepEqual(await aggregates(server.origin), phases.B.aggregates, 'C: rows mode reads the same totals');
  await play(server.origin);
  const played = { aggregates: await aggregates(server.origin), storage: storage() };
  for (const [id, r] of Object.entries(played.storage)) assert.equal(r.packs, phases.B.storage[id].packs, `C ${id}: rows mode writes no packs`);
  assert(sum(played.storage) > sum(phases.B.storage), 'C: play adds counts');
  const ids = Object.keys(played.storage);
  const unpack = JSON.parse(execFileSync(process.execPath, [join(NEW, 'scripts/unpack-city-aggregates.mjs'), '--base', server.origin, '--ids', ids.join(',')],
    { env: { ...process.env, CITY_TOKEN: TOKEN }, encoding: 'utf8' }));
  phases.C = { release: 'new, CITY_AGGREGATES=rows', aggregates: await aggregates(server.origin), storage: storage(), unpack };
  await server.stop();
  assert(unpack.drained && unpack.rooms === 2 && unpack.packsMoved > 0, `C: every room drained ${JSON.stringify(unpack)}`);
  assert.deepEqual(phases.C.aggregates, played.aggregates, 'C: unpack leaves the public totals unchanged');
  assert.deepEqual(totalsOf(phases.C.storage), totalsOf(played.storage), 'C: unpack leaves every room\'s stored totals unchanged');
  for (const [id, r] of Object.entries(phases.C.storage)) assert.equal(r.packs, 0, `C ${id}: no pack left`);

  server = await serve(OLD);
  phases.D = { release: 'old (rolled back)', aggregates: await aggregates(server.origin), storage: storage() };
  await server.stop();
  assert.deepEqual(phases.D.aggregates, phases.C.aggregates, 'D: the old release reads every count');
  assert.deepEqual(totalsOf(phases.D.storage), totalsOf(phases.C.storage), 'D: every room\'s per-key tables hold every total');

  server = await serve(NEW);
  phases.E = { release: 'new (rolled forward)', aggregates: await aggregates(server.origin), storage: storage() };
  await server.stop(); server = undefined;
  assert.deepEqual(phases.E.aggregates, phases.D.aggregates, 'E: rolling forward reads the same');

  const result = { verifiedAt: new Date().toISOString(), old: OLD, new: NEW,
    summary: Object.fromEntries(Object.entries(phases).map(([k, p]) => [k, { release: p.release, storedTotal: sum(p.storage),
      rooms: Object.fromEntries(Object.entries(p.storage).map(([id, r]) => [id.slice(0, 12), { packs: r.packs, rows: r.rows, keys: Object.keys(r.totals).length }])) }])),
    unpack: phases.C.unpack, phases };
  const text = JSON.stringify(result, null, 2) + '\n';
  if (values.output) writeFileSync(values.output, text);
  console.log(JSON.stringify(result.summary, null, 2));
  exitCode = 0;
} catch (error) {
  console.error(error);
  if (server) console.error(server.logs.join('').split('\n').slice(-40).join('\n'));
  if (values.output) writeFileSync(values.output, JSON.stringify({ failedAt: new Date().toISOString(), error: String(error?.stack ?? error), phases }, null, 2) + '\n');
} finally {
  if (server) await server.stop();
  rmSync(persistTo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
process.exit(exitCode);
