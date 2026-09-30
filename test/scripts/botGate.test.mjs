import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Ways the gate's minds section could go wrong: counting another mindVersion's facts; dividing decisions by
// something other than bot time; latency read as an average of each minute's p50 and p90 instead of from every
// reply; dollars per hour over the room's time rather than the time Jev was on; the rest of the report changed.
test('the bot gate reads the minds: decisions per bot-hour by mind, goal success, pooled latency and cost', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bot-gate-')), path = join(dir, 'city.db');
  try {
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE facts (t INTEGER, type TEXT, room TEXT, round TEXT, mode TEXT, layout INTEGER, incident TEXT, a INTEGER, place TEXT, data TEXT);
      CREATE TABLE situations (t INTEGER, round TEXT, a INTEGER, human INTEGER);`);
    const insert = db.prepare('INSERT INTO facts (t, type, room, round, layout, data) VALUES (?, ?, ?, ?, ?, ?)');
    const T = Date.UTC(2026, 8, 29), fact = (f, mindVersion = 1) => insert.run(T + f.t, f.type, 'public-live-v2', 'r1', 3, JSON.stringify({ room: 'public-live-v2', round: 'r1', layout: 3, mindVersion, ...f, t: T + f.t }));
    // One bot alive for an hour, framed every 5 s.
    for (let t = 0; t <= 3_600_000; t += 5000) fact({ t, type: 'frame', rats: [{ a: 1, human: false, alive: true, place: 'street:x', p: [0, 0, 0], lifeMs: t }] });
    for (let i = 0; i < 30; i++) fact({ t: 1000 + i, type: 'decision', a: 1, mind: 'code', goal: 'roam' });
    for (let i = 0; i < 10; i++) fact({ t: 2000 + i, type: 'decision', a: 1, mind: 'jev', goal: 'hunt' });
    for (let i = 0; i < 50; i++) fact({ t: 3000 + i, type: 'decision', a: 1, mind: 'code', goal: 'roam' }, 0);
    for (const outcome of ['reached', 'reached', 'reached', 'died']) fact({ t: 4000, type: 'goal-end', a: 1, goal: 'take-case', outcome });
    fact({ t: 4001, type: 'goal-end', a: 1, goal: 'roam', outcome: 'failed' });
    fact({ t: 1_800_000, type: 'minds', ms: 1_800_000, decisions: 600, fallbacks: 60, answers: 200, staleDrops: 10, dollars: .5, hist: { 100: 6 } });
    fact({ t: 3_600_000, type: 'minds', ms: 1_800_000, decisions: 400, fallbacks: 40, answers: 200, staleDrops: 10, dollars: .7, hist: { 300: 1, 500: 3 } });
    db.close();
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/bot-gate.mjs', `--db=${path}`, '--mind=1']);
    const out = JSON.parse(stdout), minds = out.minds;
    assert.deepEqual(Object.keys(out), ['window', 'botHours', 'humanHours', 'roomHours', 'stuck', 'spread', 'fighting', 'case', 'skillBar', 'minds']);
    assert.ok(Math.abs(minds.decisionsPerBotHour.code - 30) < .05 && Math.abs(minds.decisionsPerBotHour.jev - 10) < .05, JSON.stringify(minds.decisionsPerBotHour));
    assert.equal(minds.jevShare, .25);
    assert.deepEqual(minds.goalSuccess, { 'take-case': { ended: 4, reached: .75, died: .25, replaced: 0, failed: 0 }, roam: { ended: 1, reached: 0, died: 0, replaced: 0, failed: 1 } });
    assert.deepEqual(minds.jev, { hoursOn: 1, latencyP50: 110, latencyP90: 510, dollarsPerHourOn: 1.2, dollarsPerHumanHour: null, fallbackShare: .1, staleShare: .05 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
