import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cityPlaces } from '../../src/shared/city/places';
import { judge, parseProposal, readMeasure, VERDICT_HUMAN_SECONDS, type Counts, type Prediction } from '../../src/shared/city/verdict';

// Ways a verdict could call a layout change wrongly, written before the code:
// 1. A prediction is judged on a few minutes of play, so noise reads as a result.
// 2. Overlapping intervals are called a change.
// 3. A change in the wrong direction is called met.
// 4. An hour of play is read as 3,600 independent trials, so every interval is needlessly tight.
// 5. Counts recorded under a retired place ID fall out of the district they belong to.
// 6. A malformed proposal (unknown district, measure or direction) is accepted and silently reads nothing.
const places = cityPlaces();
const north: Prediction = { id: 'north', says: 'north up', expect: 'up', measure: { kind: 'share', key: 'human-s', where: { districts: ['north-west', 'north', 'north-east'] } } };
/** Human seconds split between a north place and a centre place. */
const play = (northS: number, centreS: number): Counts => ({ 'street:quay-road:0': { 'human-s': northS }, 'lot:centre:1': { 'human-s': centreS } });
const HOUR = 3600;

describe('verdicts', () => {
  it('waits until both layouts have enough human play', () => {
    const short = VERDICT_HUMAN_SECONDS / 2;
    expect(judge(north, play(0, short), play(short, 0), places).outcome).toBe('waiting');
    expect(judge(north, play(0, HOUR), {}, places).outcome).toBe('waiting');
    expect(judge(north, {}, play(HOUR, 0), places).outcome).toBe('waiting');
  });

  it('calls a change only when the intervals part, and in the predicted direction', () => {
    expect(judge(north, play(HOUR * .10, HOUR * .90), play(HOUR * .12, HOUR * .88), places).outcome).toBe('unclear');
    expect(judge(north, play(HOUR * .10, HOUR * .90), play(HOUR * .60, HOUR * .40), places).outcome).toBe('met');
    expect(judge(north, play(HOUR * .60, HOUR * .40), play(HOUR * .10, HOUR * .90), places).outcome).toBe('missed');
    expect(judge({ ...north, expect: 'down' }, play(HOUR * .60, HOUR * .40), play(HOUR * .10, HOUR * .90), places).outcome).toBe('met');
  });

  it('reads play time in minutes, so an hour of play is not 3,600 trials', () => {
    const r = readMeasure(north.measure, play(HOUR / 2, HOUR / 2), places)!;
    expect(r.value).toBeCloseTo(.5);
    expect(r.n).toBe(60);
    expect(r.hi - r.lo).toBeGreaterThan(.2);
  });

  it('files counts under retired place IDs in the district where that ground now lies', () => {
    // lot:north:1 was layout 2's big open ground north of Records; layout 3 builds over it.
    expect(places.byId.has('lot:north:1')).toBe(false);
    const r = readMeasure(north.measure, { 'lot:north:1': { 'human-s': HOUR }, 'lot:centre:1': { 'human-s': HOUR } }, places)!;
    expect(r.value).toBeCloseTo(.5);
  });

  it('reads a rate per hour of exposure with its interval', () => {
    const r = readMeasure({ kind: 'rate', key: 'pickup:ironclad', per: ['human-s', 'bot-s'] }, { 'lot:centre:1': { 'pickup:ironclad': 10, 'human-s': HOUR, 'bot-s': HOUR } }, places)!;
    expect(r.value).toBeCloseTo(5);
    expect(r.lo).toBeLessThan(5);
    expect(r.hi).toBeGreaterThan(5);
    expect(readMeasure({ kind: 'rate', key: 'pickup:ironclad', per: 'human-s' }, {}, places)).toBeUndefined();
  });
});

describe('proposals', () => {
  const good = { id: 'proposal:x', title: 'X', status: 'draft', fromLayout: 2, toLayout: 3, summary: 's', goals: ['g'], predictions: [north] };

  it('rejects a proposal that would read nothing', () => {
    expect(() => parseProposal(null)).toThrow(/not an object/);
    expect(() => parseProposal({ ...good, predictions: undefined })).toThrow(/predictions/);
    expect(() => parseProposal({ ...good, predictions: [{ ...north, expect: 'sideways' }] })).toThrow(/neither up nor down/);
    expect(() => parseProposal({ ...good, predictions: [{ ...north, measure: { kind: 'vibes', key: 'human-s' } }] })).toThrow(/unknown measure/);
    expect(() => parseProposal({ ...good, predictions: [{ ...north, measure: { kind: 'share', key: 'human-s' } }] })).toThrow(/needs a scope/);
    expect(() => parseProposal({ ...good, predictions: [{ ...north, measure: { kind: 'share', key: 'human-s', where: { districts: ['docks'] } } }] })).toThrow(/no district "docks"/);
    expect(() => parseProposal({ ...good, fromLayout: 'two' })).toThrow(/fromLayout/);
  });

  it('accepts every proposal in design/city/proposals, each prediction readable', () => {
    const dir = new URL('../../design/city/proposals/', import.meta.url);
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    expect(files).toContain('overhaul-v3.json');
    for (const f of files) {
      const proposal = parseProposal(JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
      expect(proposal.predictions.length, f).toBeGreaterThan(0);
      for (const scope of proposal.predictions.map(p => p.measure.where?.places ?? []).flat()) expect(places.successor(scope), `${f}: ${scope}`).toBeDefined();
    }
  });
});
