#!/usr/bin/env node
// Agents only: mirror the live city map into output/city/city.db (SQLite) for deep queries.
// The `read` tool queries it directly: read output/city/city.db?q=SELECT ...
// Usage: node scripts/city-mirror.mjs [--base=https://ratdetective.online] [--out=output/city] [--concurrency=6] [--backoff-ms=500]
// Token: CITY_TOKEN, or ~/.config/rat-detective/city-token (the Worker secret of the same name).
//
// The model and the all-time aggregates are replaced whole, in one transaction. Archive objects download
// a few at a time and each commits with its facts in one transaction, so an interrupted or failed run keeps
// what it finished and the next run fetches only the rest. Transient failures (network, timeouts, 5xx, 429)
// are retried with backoff; anything else stops the run with the request, the status and the cause.
import { DatabaseSync } from 'node:sqlite';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const { values } = parseArgs({ options: { base: { type: 'string', default: 'https://ratdetective.online' }, out: { type: 'string' }, concurrency: { type: 'string', default: '6' }, 'backoff-ms': { type: 'string', default: '500' } } });
const base = values.base.replace(/\/$/, ''), concurrency = Number(values.concurrency), backoffMs = Number(values['backoff-ms']);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('--concurrency must be 1-32');
if (!(backoffMs >= 0)) throw new Error('--backoff-ms must be 0 or more');
const out = resolve(values.out ?? fileURLToPath(new URL('../output/city/', import.meta.url)));
const token = process.env.CITY_TOKEN ?? readFileSync(`${homedir()}/.config/rat-detective/city-token`, 'utf8').trim();
const ATTEMPTS = 4, TIMEOUT_MS = 60_000;
const started = Date.now(), seconds = () => ((Date.now() - started) / 1000).toFixed(1);
const log = message => process.stderr.write(`${message}\n`);

/** The whole chain: Node's fetch hides the network reason in `cause`. */
const describe = error => error instanceof Error ? `${error.name === 'Error' ? '' : `${error.name}: `}${error.message}${error.cause ? ` (${describe(error.cause)})` : ''}` : String(error);
class Fatal extends Error {}
/** A response body, read inside the retry so a dropped connection mid-body is retried too. */
async function get(path, read, auth = false) {
  for (let attempt = 1; ; attempt++) {
    let failure;
    try {
      const response = await fetch(base + path, { headers: auth ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.ok) return await read(response);
      const body = (await response.text()).slice(0, 300);
      failure = new Error(`HTTP ${response.status}${body ? ` ${body}` : ''}`);
      if (response.status < 500 && response.status !== 429) throw new Fatal(failure.message);
    } catch (error) {
      if (error instanceof Fatal) throw new Error(`GET ${path}: ${error.message}`);
      failure = error;
    }
    if (attempt === ATTEMPTS) throw new Error(`GET ${path}: ${describe(failure)} (gave up after ${ATTEMPTS} attempts)`);
    log(`  retrying GET ${path} (${describe(failure)})`);
    await new Promise(done => setTimeout(done, backoffMs * 2 ** (attempt - 1)));
  }
}
const json = (path, auth) => get(path, response => response.json(), auth);

mkdirSync(out, { recursive: true });
const db = new DatabaseSync(resolve(out, 'city.db'));
db.exec(`
  PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS archive_objects (key TEXT PRIMARY KEY, lines INTEGER);
  CREATE TABLE IF NOT EXISTS facts (t INTEGER, type TEXT, room TEXT, round TEXT, mode TEXT, layout INTEGER, incident TEXT, a INTEGER, place TEXT, data TEXT);
  CREATE TABLE IF NOT EXISTS situations (t INTEGER, round TEXT, mode TEXT, incident TEXT, a INTEGER, human INTEGER, alive INTEGER, place TEXT, floor TEXT, x REAL, y REAL, z REAL,
    hp INTEGER, carrying INTEGER, progress REAL, rank INTEGER, lead REAL, k INTEGER, d INTEGER, assists INTEGER, streak INTEGER, shots10s INTEGER, visible INTEGER, nearest REAL, data TEXT);
`);
// Columns added since the first mirrors, so an existing city.db upgrades in place: the release `build` (null on facts
// recorded before build stamps) and `agent` (1 for an agent browser's rat, shot, session or perf report; null before the flag).
for (const [table, column, type] of [['facts', 'build', 'TEXT'], ['facts', 'agent', 'INTEGER'], ['situations', 'build', 'TEXT'], ['situations', 'agent', 'INTEGER']])
  if (!db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
db.exec(`
  CREATE INDEX IF NOT EXISTS facts_type ON facts(type, t);
  CREATE INDEX IF NOT EXISTS facts_round ON facts(round, t);
  CREATE INDEX IF NOT EXISTS facts_build ON facts(build, type, t);
  CREATE INDEX IF NOT EXISTS situations_round ON situations(round, a, t);
  CREATE INDEX IF NOT EXISTS situations_place ON situations(place);
`);
function transaction(work) {
  db.exec('BEGIN');
  try { const result = work(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
}

async function main() {
  // Layers 0-1 and the all-time aggregates: fetched together, swapped in together.
  const [model, placesData, flowsData, heat] = await Promise.all([json('/api/city/v1/model'), json('/api/city/v1/places?days=all'), json('/api/city/v1/flows?days=all'), json('/api/heat/v1?days=all')]);
  const rows = transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS place_counts; CREATE TABLE place_counts (place TEXT, measure TEXT, n INTEGER);
      DROP TABLE IF EXISTS flows; CREATE TABLE flows (src TEXT, dst TEXT, who TEXT, n INTEGER);
      DROP TABLE IF EXISTS cells; CREATE TABLE cells (layer TEXT, cell TEXT, n INTEGER);
      DROP TABLE IF EXISTS places; CREATE TABLE places (id TEXT PRIMARY KEY, kind TEXT, name TEXT, floor TEXT, district TEXT, area INTEGER, x REAL, z REAL);
      DROP TABLE IF EXISTS entities; CREATE TABLE entities (id TEXT PRIMARY KEY, kind TEXT, name TEXT, x REAL, y REAL, z REAL, place TEXT, detail TEXT);
    `);
    let n = 0;
    const addPlace = db.prepare('INSERT INTO places VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of model.places) { addPlace.run(p.id, p.kind, p.name, p.floor, p.district, p.area, p.x, p.z); n++; }
    const addEntity = db.prepare('INSERT INTO entities VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const e of model.entities) { addEntity.run(e.id, e.kind, e.name, e.x, e.y, e.z, e.place, JSON.stringify(e.detail ?? {})); n++; }
    const addCount = db.prepare('INSERT INTO place_counts VALUES (?, ?, ?)');
    for (const [place, measures] of Object.entries(placesData.places)) for (const [measure, count] of Object.entries(measures)) { addCount.run(place, measure, count); n++; }
    const addFlow = db.prepare('INSERT INTO flows VALUES (?, ?, ?, ?)');
    for (const f of flowsData.flows) { addFlow.run(f.src, f.dst, f.who, f.n); n++; }
    const addCell = db.prepare('INSERT INTO cells VALUES (?, ?, ?)');
    for (const [layer, cells] of Object.entries(heat.layers)) for (const [cell, count] of Object.entries(cells)) { addCell.run(layer, cell, count); n++; }
    return n;
  });
  writeFileSync(resolve(out, 'model.json'), JSON.stringify(model, null, 1));
  log(`${seconds()} s  model and aggregates: ${rows} rows`);

  // Layer 2: every archived fact not mirrored yet.
  const seen = new Set(db.prepare('SELECT key FROM archive_objects').all().map(r => r.key));
  const todo = [];
  let listed = 0, cursor;
  do {
    const page = await json(`/api/city/v1/archive?prefix=city/raw/v1/${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, true);
    listed += page.objects.length;
    for (const object of page.objects) if (!seen.has(object.key)) todo.push(object);
    cursor = page.cursor;
  } while (cursor);
  const bytes = todo.reduce((sum, o) => sum + (o.size ?? 0), 0);
  log(`${seconds()} s  archive: ${listed} objects, ${todo.length} new (${(bytes / 1e6).toFixed(1)} MB compressed)`);

  const addFact = db.prepare('INSERT INTO facts (t, type, room, round, mode, layout, incident, a, place, data, build, agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const addSituation = db.prepare(`INSERT INTO situations (t, round, mode, incident, a, human, alive, place, floor, x, y, z, hp, carrying, progress, rank, lead, k, d, assists, streak, shots10s, visible, nearest, data, build, agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const markObject = db.prepare('INSERT INTO archive_objects VALUES (?, ?)');
  /** Streams one object's gzipped JSON lines into SQL; the object is marked mirrored in the same transaction. */
  async function mirror(key, gz) {
    db.exec('BEGIN');
    try {
      let facts = 0, rest = '';
      const decoder = new TextDecoder();
      const insert = line => {
        if (!line) return;
        const f = JSON.parse(line);
        addFact.run(f.t, f.type, f.room, f.round ?? null, f.mode, f.layout, f.incident ?? null, f.a ?? f.victim ?? null, f.place ?? f.vplace ?? null, line, f.build ?? null, f.agent ? 1 : null);
        if (f.type === 'frame') for (const r of f.rats) addSituation.run(f.t, f.round ?? null, f.mode, f.incident ?? null, r.a, r.human ? 1 : 0, r.alive ? 1 : 0, r.place, r.floor,
          r.p[0], r.p[1], r.p[2], r.hp, r.case.carrying ? 1 : 0, r.standing.progress, r.standing.rank, r.standing.lead, r.kda.k, r.kda.d, r.kda.a, r.kda.streak,
          r.fire.last10s, r.danger.visible, r.danger.nearest ?? null, JSON.stringify(r), f.build ?? null, r.agent ? 1 : 0);
        facts++;
      };
      await pipeline(Readable.from([gz]), createGunzip(), async source => {
        for await (const chunk of source) {
          const lines = (rest + decoder.decode(chunk, { stream: true })).split('\n');
          rest = lines.pop();
          for (const line of lines) insert(line);
        }
        insert(rest + decoder.decode());
      });
      markObject.run(key, facts);
      db.exec('COMMIT');
      return facts;
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`archive object ${key}: ${describe(error)}`);
    }
  }

  // Downloads run `concurrency` ahead of the single SQL writer, which takes objects in listing order.
  const downloads = new Map();
  let next = 0, done = 0, facts = 0, reported = 0;
  const fill = () => {
    while (next < todo.length && downloads.size < concurrency) {
      const { key } = todo[next++];
      const download = get(`/api/city/v1/archive/${encodeURIComponent(key)}`, async response => Buffer.from(await response.arrayBuffer()), true);
      download.catch(() => {}); // awaited in order below; this only stops an early failure counting as unhandled
      downloads.set(key, download);
    }
  };
  try {
    for (const { key } of todo) {
      fill();
      const gz = await downloads.get(key);
      downloads.delete(key);
      fill();
      facts += await mirror(key, gz);
      done++;
      if (Date.now() - reported >= 2000 || done === todo.length) {
        reported = Date.now();
        const rate = done / ((Date.now() - started) / 1000);
        log(`${seconds()} s  [${done}/${todo.length}] ${key.slice('city/raw/v1/'.length)} · ${facts} facts · ${rate.toFixed(1)} objects/s`);
      }
    }
  } catch (error) {
    throw new Error(`${describe(error)}\nMirrored ${done} of ${todo.length} new objects before the failure; run again to resume.`);
  }

  const count = t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  console.log(`Mirrored ${done} new archive objects (${facts} facts) in ${seconds()} s. Totals: ${count('facts')} facts, ${count('situations')} situations, ${count('places')} places, ${count('entities')} entities.`);
  console.log(`Query with: read ${out.startsWith(process.cwd()) ? out.slice(process.cwd().length + 1) : out}/city.db?q=SELECT ...`);
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  log(`city-mirror: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  db.close();
}
