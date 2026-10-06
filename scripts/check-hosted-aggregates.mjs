// Hosted check of the city aggregates around a deploy (docs/live-service.md, "Rolling back past packed aggregates").
//   snapshot: the canonical room's public heat, places and flows over all days, normalized, with totals and a hash;
//   compare:  two snapshots: every key of the first is in the second with a count at least as high (`equal` when identical);
//   play:     one agent=1 seat in the canonical room for --seconds, then waits for the room to stop (bots 0);
//   mode:     POST /api/city/v1/unpack once without an id (bearer CITY_TOKEN): 409 + mode packs, or 200 + rows-mode batch.
// Usage: node scripts/check-hosted-aggregates.mjs snapshot --base <origin> --out <file>
//        node scripts/check-hosted-aggregates.mjs compare <before.json> <after.json>
//        node scripts/check-hosted-aggregates.mjs play --base <origin> [--seconds 90]
//        node scripts/check-hosted-aggregates.mjs mode --base <origin>
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import WebSocket from 'ws';
import { readSocketMessage, PROTOCOL_VERSION } from './lib/network-codec.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { base: { type: 'string' }, out: { type: 'string' }, seconds: { type: 'string', default: '90' } } });
const [command, ...files] = positionals;
const pause = ms => new Promise(r => setTimeout(r, ms));
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;

/** Every count as `kind|…|key → n`. */
function flatten(s) {
  const out = {};
  for (const [layer, cells] of Object.entries(s.heat.layers)) for (const [cell, n] of Object.entries(cells)) out[`cell|${layer}|${cell}`] = n;
  for (const [place, m] of Object.entries(s.places.places)) for (const [measure, n] of Object.entries(m)) out[`place|${place}|${measure}`] = n;
  for (const [measure, n] of Object.entries(s.places.minds ?? {})) out[`mind|${measure}`] = n;
  for (const f of s.flows.flows) out[`flow|${f.src}|${f.dst}|${f.who}`] = (out[`flow|${f.src}|${f.dst}|${f.who}`] ?? 0) + f.n;
  return out;
}

if (command === 'snapshot') {
  const get = async path => { const r = await fetch(values.base + path); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
  const at = new Date().toISOString();
  const [heat, places, flows, health] = [await get('/api/heat/v1?days=all'), await get('/api/city/v1/places?days=all'), await get('/api/city/v1/flows?days=all'), await get('/health')];
  const snap = sorted({ heat, places, flows });
  const counts = flatten(snap), total = Object.values(counts).reduce((t, n) => t + n, 0);
  // Hashed in key order: equal counts may come back in another order (flows with equal n).
  const result = { at, base: values.base, build: health.build, keys: Object.keys(counts).length, total,
    sha256: createHash('sha256').update(JSON.stringify(Object.entries(counts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))).digest('hex'), days: heat.allDays?.length, snapshot: snap };
  writeFileSync(values.out, JSON.stringify(result) + '\n');
  console.log(JSON.stringify({ ...result, snapshot: undefined }));
} else if (command === 'compare') {
  const [a, b] = files.map(f => JSON.parse(readFileSync(f, 'utf8')));
  const ca = flatten(a.snapshot), cb = flatten(b.snapshot);
  const missing = Object.keys(ca).filter(k => !(k in cb)), lower = Object.keys(ca).filter(k => k in cb && cb[k] < ca[k]);
  const added = Object.keys(cb).filter(k => !(k in ca)).length, grown = Object.keys(ca).filter(k => k in cb && cb[k] > ca[k]).length;
  const result = { before: { at: a.at, build: a.build, keys: a.keys, total: a.total }, after: { at: b.at, build: b.build, keys: b.keys, total: b.total },
    equal: !missing.length && !lower.length && !added && !grown, missing: missing.length, lower: lower.length, added, grown, examples: [...missing, ...lower].slice(0, 5) };
  console.log(JSON.stringify(result, null, 2));
  if (missing.length || lower.length) process.exit(1);
} else if (command === 'play') {
  const url = new URL('/ws', values.base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('agent', '1');
  const ws = new WebSocket(url, { headers: { Origin: new URL(values.base).origin } });
  const welcome = await new Promise((done, fail) => {
    const timeout = setTimeout(() => fail(new Error('welcome timeout')), 30_000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Data Check', appearance: { hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3 } })));
    ws.on('message', raw => { const m = readSocketMessage(ws, raw); if (m?.type === 'welcome') { clearTimeout(timeout); done(m); } if (m?.type === 'error') fail(new Error(m.message)); });
    ws.on('error', fail);
  });
  const joinedAt = new Date().toISOString(), bots = Object.keys(welcome.players).filter(id => id.startsWith('rd-ai-')).length;
  const pinger = setInterval(() => ws.send(JSON.stringify({ type: 'ping', sentAt: Date.now() })), 1000);
  await pause(Number(values.seconds) * 1000);
  clearInterval(pinger); ws.close(1000, 'done');
  const leftAt = new Date().toISOString();
  await pause(40_000);
  const status = await (await fetch(`${values.base}/status`)).json();
  console.log(JSON.stringify({ joinedAt, leftAt, welcomeBots: bots, statusAfter: { players: status.players, bots: status.bots } }));
  process.exit(status.bots === 0 ? 0 : 1);
} else if (command === 'mode') {
  const tokenFile = join(homedir(), '.config/rat-detective/city-token');
  const token = process.env.CITY_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
  const r = await fetch(`${values.base}/api/city/v1/unpack`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  console.log(JSON.stringify({ status: r.status, body: await r.json().catch(() => null) }));
} else {
  console.error('Usage: snapshot|compare|play|mode (see the header)');
  process.exit(2);
}
