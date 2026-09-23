import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function loadModel() {
  const source = await readFile(new URL('../HighlightsModel.js', import.meta.url), 'utf8');
  const context = {module: {exports: {}}, Date, JSON, Math, Number, String, Array, Object, isFinite};
  vm.runInNewContext(source, context, {filename: 'HighlightsModel.js'});
  return context.module.exports;
}

test('panel line and filters stay readable without color-only state', async () => {
  const model = await loadModel();
  assert.equal(model.stateLabel('capturing'), 'Capturing');
  assert.equal(model.panelLine({state: 'off', clipCount: 0}), '0 clips');
  assert.match(model.panelLine({state: 'interrupted', clipCount: 2}), /Interrupted/);
  assert.equal(model.durationLabel(65000), '1:05');
  const clips = [
    {title: 'Round win', kind: 'round-win', favorite: 1, status: 'ready'},
    {title: 'Pile-up', kind: 'visible-pileup', favorite: 0, status: 'ready'},
    {title: 'Old', kind: 'double-kill', favorite: 0, status: 'trash'},
  ];
  assert.equal(model.pageClips(clips, 'win', '', false, 0, 10).total, 1);
  assert.equal(model.pageClips(clips, '', '', true, 0, 10).total, 1);
  assert.equal(model.sessionOptions([{id: 'session-a'}], 'session-a')[1].label, 'Date unavailable · Mode unavailable');
  assert.match(model.jobLabel({status: 'running', progress: 0.4}), /40%/);
});

test('session titles show local date, time and recorded modes without session IDs', async () => {
  const model = await loadModel();
  const started_at = new Date(2026, 8, 21, 9, 7).getTime() / 1000;
  const rows = model.sessionOptions([
    {id: 'session-one', started_at, game_modes: ['chain-of-custody']},
    {id: 'session-two', started_at, game_modes: ['closing-time', 'jurisdiction']},
    {id: 'session-three', started_at, game_modes: ['invented']},
  ], 'session-one');
  assert.equal(rows[1].label, '2026-09-21 09:07 · Paper Chase');
  assert.equal(rows[2].label, '2026-09-21 09:07 · Closing Time / Jurisdiction');
  assert.equal(rows[3].label, '2026-09-21 09:07 · Mode unavailable');
  assert.equal(rows[1].id, 'session-one');
});

test('selection stays on the same clip across polling and chooses a valid successor after filtering', async () => {
  const model = await loadModel();
  const a = {id: 'a', title: 'First'}, b = {id: 'b', title: 'Second'};
  assert.equal(model.selectionId([a, b], 'b'), 'b');
  assert.equal(model.selectionId([{id: 'new'}, {...b}, {...a}], 'b'), 'b');
  assert.equal(model.clipById([{...b}, a], 'b').title, 'Second');
  assert.equal(model.selectionId([a], 'b'), 'a');
  assert.equal(model.selectionId([], 'b'), '');
  assert.equal(model.clipById([a], 'b'), null);
});

test('trim editor restores persisted milliseconds and handles untrimmed clips', async () => {
  const model = await loadModel();
  const bounds = model.trimBounds({duration_ms: 15000, trim_in_ms: 1000, trim_out_ms: 13000});
  assert.equal(bounds.start, 1 / 15);
  assert.equal(bounds.end, 13 / 15);
  assert.equal(model.trimBounds({duration_ms: 15000}).end, 1);
  assert.equal(model.trimBounds({duration_ms: 0}).start, 0);
  assert.equal(model.trimBounds(null).end, 1);
});

test('saved clips expose only the kept range with a zero-based playback timeline', async () => {
  const model = await loadModel();
  const clip = {duration_ms: 15000, trim_in_ms: 2000, trim_out_ms: 6000};
  const range = model.playbackRange(clip);
  assert.equal(range.start, 2000);
  assert.equal(range.end, 6000);
  assert.equal(range.duration, 4000);
  assert.equal(model.playbackRange({duration_ms: 15000}).duration, 15000);
});
