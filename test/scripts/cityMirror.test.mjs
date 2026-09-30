import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

// Ways the mirror could go wrong: a transient 503 aborting the run, a permanent failure losing what was
// already mirrored or leaving half an object behind, a rerun fetching or inserting objects twice, the
// aggregates doubling on every run, a paged listing read only in part, the token not sent.
const TOKEN = 'mirror-test-token';
const rat = (a, place) => ({ a, human: a === 1, alive: true, place, floor: 'street', p: [a, 0, 2], hp: 5, case: { carrying: false }, standing: { progress: .1, rank: a, lead: 0 },
  kda: { k: 0, d: 0, a: 0, streak: 0 }, fire: { last10s: 2 }, danger: { visible: 1, nearest: 12.5 } });
const lines = facts => gzipSync(facts.map(f => JSON.stringify(f)).join('\n'));
const OBJECTS = {
  'city/raw/v1/room/2026/09/29/00-00-00-a.jsonl.gz': [{ t: 1, type: 'shot', room: 'room', mode: 'jurisdiction', layout: 3, a: 1, place: 'street:x' }, { t: 2, type: 'frame', room: 'room', mode: 'jurisdiction', layout: 3, rats: [rat(1, 'street:x'), rat(2, 'lot:y')] }],
  'city/raw/v1/room/2026/09/29/00-05-00-b.jsonl.gz': [{ t: 3, type: 'death', room: 'room', round: 'r1', mode: 'jurisdiction', layout: 3, victim: 2, vplace: 'lot:y' }],
  'city/raw/v1/room/2026/09/29/00-10-00-c.jsonl.gz': [{ t: 4, type: 'ball', room: 'room', mode: 'jurisdiction', layout: 3, a: 1, place: 'street:x', outcome: 'rat-body' }, { t: 5, type: 'spawn', room: 'room', mode: 'jurisdiction', layout: 3, a: 2, place: 'lot:y' }],
};
const KEYS = Object.keys(OBJECTS);

function server(objects = OBJECTS) {
  const keys = Object.keys(objects), requests = [], failures = new Map();
  const http = createServer((req, res) => {
    const url = new URL(req.url, 'http://mirror'), send = (status, body) => { res.writeHead(status); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    requests.push(url.pathname + url.search);
    const failing = failures.get(url.pathname);
    if (failing && failing.times-- > 0) return send(failing.status, 'upstream trouble');
    if (url.pathname === '/api/city/v1/model') return send(200, { places: [{ id: 'street:x', kind: 'street', name: 'X Street', floor: 'street', district: 'D', area: 4, x: 0, z: 0 }], entities: [{ id: 'pillar', kind: 'dispatch', name: 'Pillar', x: 1, y: 0, z: 1, place: 'street:x' }] });
    if (url.pathname === '/api/city/v1/places') return send(200, { places: { 'street:x': { 'shots-bot': 7, deaths: 2 } } });
    if (url.pathname === '/api/city/v1/flows') return send(200, { flows: [{ src: 'street:x', dst: 'lot:y', who: 'bot', n: 3 }] });
    if (url.pathname === '/api/heat/v1') return send(200, { layers: { humans: { 'street:0:0': 3 }, bots: { 'street:1:0': 1 } } });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, 'no token');
    // Two pages, as R2 lists at most 1,000 keys a time.
    if (url.pathname === '/api/city/v1/archive') return send(200, url.searchParams.get('cursor') === 'page-2'
      ? { objects: keys.slice(2).map(key => ({ key, size: 90 })) } : { objects: keys.slice(0, 2).map(key => ({ key, size: 90 })), ...(keys.length > 2 ? { cursor: 'page-2' } : {}) });
    const key = decodeURIComponent(url.pathname.slice('/api/city/v1/archive/'.length));
    return objects[key] ? send(200, lines(objects[key])) : send(404, 'Not found');
  });
  return new Promise(ready => http.listen(0, '127.0.0.1', () => ready({ http, requests, failures, base: `http://127.0.0.1:${http.address().port}` })));
}
const mirror = (base, out) => new Promise(done => execFile(process.execPath, ['scripts/city-mirror.mjs', `--base=${base}`, `--out=${out}`, '--concurrency=2', '--backoff-ms=0'],
  { env: { ...process.env, CITY_TOKEN: TOKEN } }, (error, stdout, stderr) => done({ code: error ? error.code : 0, stdout, stderr })));
const archivePath = key => `/api/city/v1/archive/${encodeURIComponent(key)}`;

test('mirrors through transient failures, keeps finished objects when one fails for good, and resumes without duplicates', async () => {
  const { http, requests, failures, base } = await server(), out = await mkdtemp(join(tmpdir(), 'city-mirror-'));
  try {
    failures.set(archivePath(KEYS[1]), { status: 503, times: 1 });
    failures.set(archivePath(KEYS[2]), { status: 500, times: Infinity });
    const first = await mirror(base, out);
    assert.equal(first.code, 1);
    assert.match(first.stderr, new RegExp(`GET ${archivePath(KEYS[2]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: HTTP 500 upstream trouble \\(gave up after 4 attempts\\)`));
    assert.match(first.stderr, /Mirrored 2 of 3 new objects before the failure; run again to resume\./);
    assert.equal(requests.filter(r => r === archivePath(KEYS[1])).length, 2, 'the 503 is retried');
    let db = new DatabaseSync(join(out, 'city.db'), { readOnly: true });
    assert.deepEqual(db.prepare('SELECT key, lines FROM archive_objects ORDER BY key').all().map(r => [r.key, r.lines]), [[KEYS[0], 2], [KEYS[1], 1]]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM facts').get().n, 3);
    db.close();

    failures.delete(archivePath(KEYS[2]));
    requests.length = 0;
    const second = await mirror(base, out);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /Mirrored 1 new archive objects \(2 facts\)/);
    assert.deepEqual(requests.filter(r => r.startsWith('/api/city/v1/archive/')), [archivePath(KEYS[2])], 'finished objects are not fetched again');
    db = new DatabaseSync(join(out, 'city.db'), { readOnly: true });
    const all = sql => db.prepare(sql).all().map(r => Object.values(r));
    assert.deepEqual(all('SELECT t, type, round, a, place FROM facts ORDER BY t'), [[1, 'shot', null, 1, 'street:x'], [2, 'frame', null, null, null], [3, 'death', 'r1', 2, 'lot:y'], [4, 'ball', null, 1, 'street:x'], [5, 'spawn', null, 2, 'lot:y']]);
    assert.deepEqual(all('SELECT data FROM facts WHERE t = 3').flat().map(JSON.parse), [OBJECTS[KEYS[1]][0]]);
    assert.deepEqual(all('SELECT t, a, human, place, x, visible, nearest FROM situations ORDER BY a'), [[2, 1, 1, 'street:x', 1, 1, 12.5], [2, 2, 0, 'lot:y', 2, 1, 12.5]]);
    // The aggregates are replaced on every run, never added to.
    assert.deepEqual(all('SELECT place, measure, n FROM place_counts ORDER BY measure'), [['street:x', 'deaths', 2], ['street:x', 'shots-bot', 7]]);
    assert.deepEqual(all('SELECT layer, cell, n FROM cells ORDER BY layer'), [['bots', 'street:1:0', 1], ['humans', 'street:0:0', 3]]);
    assert.deepEqual(all('SELECT src, dst, who, n FROM flows'), [['street:x', 'lot:y', 'bot', 3]]);
    assert.deepEqual(all('SELECT id FROM places'), [['street:x']]);
    db.close();
  } finally {
    http.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('a rejected token stops the run with the status instead of retrying', async () => {
  const { http, requests, base } = await server(), out = await mkdtemp(join(tmpdir(), 'city-mirror-'));
  try {
    const run = await new Promise(done => execFile(process.execPath, ['scripts/city-mirror.mjs', `--base=${base}`, `--out=${out}`, '--backoff-ms=0'],
      { env: { ...process.env, CITY_TOKEN: 'wrong' } }, (error, stdout, stderr) => done({ code: error ? error.code : 0, stderr })));
    assert.equal(run.code, 1);
    assert.match(run.stderr, /GET \/api\/city\/v1\/archive\?prefix=city\/raw\/v1\/: HTTP 401 no token/);
    assert.equal(requests.filter(r => r.startsWith('/api/city/v1/archive')).length, 1);
  } finally {
    http.close();
    await rm(out, { recursive: true, force: true });
  }
});

// A mirror made before build stamps, the agent flag and code-only rounds must upgrade in place (not lose or refetch its
// facts); an agent browser's rat must not read as a bot or a human, and a code-only round's facts must be findable.
test('an older mirror gains the build, agent and code_only columns in place; new facts fill them', async () => {
  const key = 'city/raw/v1/room/2026/10/02/00-00-00-d.jsonl.gz', build = 'production-2026-10-02-abc1234';
  const { http, base } = await server({ [key]: [
    { t: 10, type: 'shot', room: 'room', mode: 'jurisdiction', layout: 5, build, a: 3, human: false, agent: true, place: 'street:x' },
    { t: 11, type: 'frame', room: 'room', mode: 'jurisdiction', layout: 5, build, rats: [rat(2, 'lot:y'), { ...rat(3, 'street:x'), human: false, agent: true }] },
    { t: 12, type: 'frame', room: 'room', mode: 'jurisdiction', layout: 5, build, codeOnly: true, rats: [rat(1, 'street:x')] },
  ] });
  const out = await mkdtemp(join(tmpdir(), 'city-mirror-'));
  try {
    let db = new DatabaseSync(join(out, 'city.db'));
    db.exec(`CREATE TABLE archive_objects (key TEXT PRIMARY KEY, lines INTEGER);
      CREATE TABLE facts (t INTEGER, type TEXT, room TEXT, round TEXT, mode TEXT, layout INTEGER, incident TEXT, a INTEGER, place TEXT, data TEXT);
      CREATE TABLE situations (t INTEGER, round TEXT, mode TEXT, incident TEXT, a INTEGER, human INTEGER, alive INTEGER, place TEXT, floor TEXT, x REAL, y REAL, z REAL,
        hp INTEGER, carrying INTEGER, progress REAL, rank INTEGER, lead REAL, k INTEGER, d INTEGER, assists INTEGER, streak INTEGER, shots10s INTEGER, visible INTEGER, nearest REAL, data TEXT);
      INSERT INTO archive_objects VALUES ('${KEYS[0]}', 1);
      INSERT INTO facts (t, type, room, layout, data) VALUES (1, 'shot', 'room', 3, '{}');
      INSERT INTO situations (t, a, human, place) VALUES (1, 1, 1, 'street:x');`);
    db.close();
    const run = await mirror(base, out);
    assert.equal(run.code, 0, run.stderr);
    db = new DatabaseSync(join(out, 'city.db'), { readOnly: true });
    const all = sql => db.prepare(sql).all().map(r => Object.values(r));
    assert.deepEqual(all('SELECT t, type, build, agent, code_only FROM facts ORDER BY t'), [[1, 'shot', null, null, null], [10, 'shot', build, 1, null], [11, 'frame', build, null, null], [12, 'frame', build, null, 1]]);
    assert.deepEqual(all('SELECT t, a, human, agent, build, code_only FROM situations ORDER BY t, a'),
      [[1, 1, 1, null, null, null], [11, 2, 0, 0, build, null], [11, 3, 0, 1, build, null], [12, 1, 1, 0, build, 1]]);
    db.close();
  } finally {
    http.close();
    await rm(out, { recursive: true, force: true });
  }
});
