#!/usr/bin/env node
// Agents only: mirror the live city map into output/city/city.db (SQLite) for deep queries.
// The `read` tool queries it directly: read output/city/city.db?q=SELECT ...
// Usage: node scripts/city-mirror.mjs [--base=https://ratdetective.online]
// Token: CITY_TOKEN, or ~/.config/rat-detective/city-token (the Worker secret of the same name).
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const base = process.argv.find(a => a.startsWith('--base='))?.slice(7) ?? 'https://ratdetective.online';
const token = process.env.CITY_TOKEN ?? readFileSync(`${homedir()}/.config/rat-detective/city-token`, 'utf8').trim();
const out = new URL('../output/city/', import.meta.url);
mkdirSync(out, { recursive: true });
const get = async (path, auth = false) => {
  const response = await fetch(base + path, { headers: auth ? { authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response;
};

const db = new DatabaseSync(new URL('city.db', out).pathname);
db.exec(`
  CREATE TABLE IF NOT EXISTS archive_objects (key TEXT PRIMARY KEY, lines INTEGER);
  CREATE TABLE IF NOT EXISTS facts (t INTEGER, type TEXT, room TEXT, round TEXT, mode TEXT, layout INTEGER, incident TEXT, a INTEGER, place TEXT, data TEXT);
  CREATE INDEX IF NOT EXISTS facts_type ON facts(type, t);
  CREATE INDEX IF NOT EXISTS facts_round ON facts(round, t);
  CREATE TABLE IF NOT EXISTS situations (t INTEGER, round TEXT, mode TEXT, incident TEXT, a INTEGER, human INTEGER, alive INTEGER, place TEXT, floor TEXT, x REAL, y REAL, z REAL,
    hp INTEGER, carrying INTEGER, progress REAL, rank INTEGER, lead REAL, k INTEGER, d INTEGER, assists INTEGER, streak INTEGER, shots10s INTEGER, visible INTEGER, nearest REAL, data TEXT);
  CREATE INDEX IF NOT EXISTS situations_round ON situations(round, a, t);
  CREATE INDEX IF NOT EXISTS situations_place ON situations(place);
  DROP TABLE IF EXISTS place_counts; CREATE TABLE place_counts (place TEXT, measure TEXT, n INTEGER);
  DROP TABLE IF EXISTS flows; CREATE TABLE flows (src TEXT, dst TEXT, who TEXT, n INTEGER);
  DROP TABLE IF EXISTS cells; CREATE TABLE cells (layer TEXT, cell TEXT, n INTEGER);
  DROP TABLE IF EXISTS places; CREATE TABLE places (id TEXT PRIMARY KEY, kind TEXT, name TEXT, floor TEXT, district TEXT, area INTEGER, x REAL, z REAL);
  DROP TABLE IF EXISTS entities; CREATE TABLE entities (id TEXT PRIMARY KEY, kind TEXT, name TEXT, x REAL, y REAL, z REAL, place TEXT, detail TEXT);
`);

// Layers 0-1: the model.
const model = await (await get('/api/city/v1/model')).json();
writeFileSync(new URL('model.json', out), JSON.stringify(model, null, 1));
const addPlace = db.prepare('INSERT INTO places VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
for (const p of model.places) addPlace.run(p.id, p.kind, p.name, p.floor, p.district, p.area, p.x, p.z);
const addEntity = db.prepare('INSERT INTO entities VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
for (const e of model.entities) addEntity.run(e.id, e.kind, e.name, e.x, e.y, e.z, e.place, JSON.stringify(e.detail ?? {}));

// Aggregates, all time.
const placesData = await (await get('/api/city/v1/places?days=all')).json();
const addCount = db.prepare('INSERT INTO place_counts VALUES (?, ?, ?)');
for (const [place, measures] of Object.entries(placesData.places)) for (const [measure, n] of Object.entries(measures)) addCount.run(place, measure, n);
const addFlow = db.prepare('INSERT INTO flows VALUES (?, ?, ?, ?)');
for (const f of (await (await get('/api/city/v1/flows?days=all')).json()).flows) addFlow.run(f.src, f.dst, f.who, f.n);
const addCell = db.prepare('INSERT INTO cells VALUES (?, ?, ?)');
for (const [layer, cells] of Object.entries((await (await get('/api/heat/v1?days=all')).json()).layers)) for (const [cell, n] of Object.entries(cells)) addCell.run(layer, cell, n);

// Layer 2: every archived fact not mirrored yet.
const seen = new Set(db.prepare('SELECT key FROM archive_objects').all().map(r => r.key));
const addFact = db.prepare('INSERT INTO facts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const addSituation = db.prepare('INSERT INTO situations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const markObject = db.prepare('INSERT INTO archive_objects VALUES (?, ?)');
let cursor, fresh = 0, lines = 0;
do {
  const page = await (await get(`/api/city/v1/archive?prefix=city/raw/v1/${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, true)).json();
  for (const object of page.objects) {
    if (seen.has(object.key)) continue;
    const text = gunzipSync(Buffer.from(await (await get(`/api/city/v1/archive/${encodeURIComponent(object.key)}`, true)).arrayBuffer())).toString('utf8');
    const facts = text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    db.exec('BEGIN');
    for (const f of facts) {
      addFact.run(f.t, f.type, f.room, f.round ?? null, f.mode, f.layout, f.incident ?? null, f.a ?? f.victim ?? null, f.place ?? f.vplace ?? null, JSON.stringify(f));
      if (f.type === 'frame') for (const r of f.rats) addSituation.run(f.t, f.round ?? null, f.mode, f.incident ?? null, r.a, r.human ? 1 : 0, r.alive ? 1 : 0, r.place, r.floor,
        r.p[0], r.p[1], r.p[2], r.hp, r.case.carrying ? 1 : 0, r.standing.progress, r.standing.rank, r.standing.lead, r.kda.k, r.kda.d, r.kda.a, r.kda.streak,
        r.fire.last10s, r.danger.visible, r.danger.nearest ?? null, JSON.stringify(r));
    }
    markObject.run(object.key, facts.length);
    db.exec('COMMIT');
    fresh++; lines += facts.length;
  }
  cursor = page.cursor;
} while (cursor);

const count = t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
console.log(`Mirrored ${fresh} new archive objects (${lines} facts). Totals: ${count('facts')} facts, ${count('situations')} situations, ${count('places')} places, ${count('entities')} entities.`);
console.log(`Query with: read output/city/city.db?q=SELECT ...`);
