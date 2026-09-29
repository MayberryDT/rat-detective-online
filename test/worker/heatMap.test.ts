import { describe, expect, it } from 'vitest';
import { HEAT_CELL, HeatDay, heatDayKey, mergeHeat } from '../../src/worker/HeatMap';

// Ways the heat map could lie or break, written before the code:
// 1. NaN/Infinity positions create cells or corrupt the stored JSON.
// 2. Launch flights or bad poses far outside the city create junk cells.
// 3. Negative coordinates bin by truncation, folding two cells into one at 0.
// 4. Sewer, street, upstairs/roof and mid-air presence blur into one floor.
// 5. A day grows without bound.
// 6. A corrupt or tampered stored day crashes the room or poisons counts.
// 7. The cell cap forgets cells loaded back from storage.
// 8. Merging days drops or double counts cells.
// 9. Days split on local time instead of UTC, or off by one at midnight.
describe('heat map cells', () => {
  it('ignores non-finite positions without throwing', () => {
    const day = new HeatDay();
    expect(day.add('humans', Number.NaN, 0, 0)).toBe(false);
    expect(day.add('humans', 0, Number.POSITIVE_INFINITY, 0)).toBe(false);
    expect(day.add('humans', 0, 0, Number.NEGATIVE_INFINITY)).toBe(false);
    expect(JSON.parse(JSON.stringify(day)).layers.humans).toEqual({});
  });

  it('drops positions far outside the city but keeps its edges', () => {
    const day = new HeatDay();
    expect(day.add('bots', 400, 0, 0)).toBe(false);
    expect(day.add('bots', 0, 0, -400)).toBe(false);
    expect(day.add('bots', -195, 0, 165)).toBe(true);
  });

  it('bins negative coordinates downward so cells never straddle zero', () => {
    const day = new HeatDay();
    day.add('humans', -0.5, 0, -0.5);
    day.add('humans', 0.5, 0, 0.5);
    day.add('humans', HEAT_CELL - 0.01, 0, 0);
    day.add('humans', HEAT_CELL, 0, 0);
    expect(day.toJSON().layers.humans).toEqual({ 'street:-1:-1': 1, 'street:0:0': 2, 'street:1:0': 1 });
  });

  it('keeps sewer, street, upstairs and flight presence apart', () => {
    const day = new HeatDay();
    for (const y of [-6.7, -2.01, -2, 0.3, 4.99, 5, 8.7, 36.7, 44.99, 45, 129]) day.add('humans', 1, y, 1);
    expect(day.toJSON().layers.humans).toEqual({
      'sewer:0:0': 2, 'street:0:0': 3, 'upper:0:0': 4, 'air:0:0': 2,
    });
  });

  it('caps distinct cells per day while still counting known cells', () => {
    const day = new HeatDay(undefined, 3);
    expect(day.add('humans', 1, 0, 1)).toBe(true);
    expect(day.add('bots', 1, 0, 1)).toBe(true);
    expect(day.add('deaths', 9, 0, 9)).toBe(true);
    expect(day.add('kills', 50, 0, 50)).toBe(false);
    expect(day.add('humans', 1, 0, 1)).toBe(true);
    const json = day.toJSON();
    expect(json.layers.humans['street:0:0']).toBe(2);
    expect(json.layers.kills).toEqual({});
  });
});

describe('stored heat days', () => {
  it('starts empty from corrupt or foreign storage instead of throwing', () => {
    for (const raw of [undefined, '', '{', 'null', '[]', '42', '{"layers":7}']) {
      expect(HeatDay.parse(raw).toJSON().layers.humans).toEqual({});
    }
  });

  it('keeps valid counts and drops tampered cells, layers and values', () => {
    const raw = JSON.stringify({ layers: {
      humans: { 'street:1:2': 5, 'street:x:2': 3, 'roof:1:2': 3, 'street:1:2:3': 1, 'street:3:3': -4, 'street:4:4': 1.5, 'street:5:5': 'nine', 'street:9999:0': 2 },
      bots: { 'sewer:-3:0': 2 },
      teleports: { 'street:0:0': 9 },
    } });
    const json = HeatDay.parse(raw).toJSON();
    expect(json.layers.humans).toEqual({ 'street:1:2': 5 });
    expect(json.layers.bots).toEqual({ 'sewer:-3:0': 2 });
    expect(Object.keys(json.layers).sort()).toEqual(['bots', 'deaths', 'humans', 'kills']);
  });

  it('remembers loaded cells against the cap', () => {
    const stored = new HeatDay(); stored.add('humans', 1, 0, 1); stored.add('humans', 9, 0, 9);
    const day = HeatDay.parse(JSON.stringify(stored), 2);
    expect(day.add('humans', 50, 0, 50)).toBe(false);
    expect(day.add('humans', 9, 0, 9)).toBe(true);
    expect(day.toJSON().layers.humans['street:2:2']).toBe(2);
  });

  it('sums days cell by cell', () => {
    const a = new HeatDay(), b = new HeatDay();
    a.add('humans', 1, 0, 1); a.add('deaths', 1, 0, 1);
    b.add('humans', 1, 0, 1); b.add('humans', -9, -7, 1);
    expect(mergeHeat([a.toJSON(), b.toJSON()]).layers).toEqual({
      humans: { 'street:0:0': 2, 'sewer:-3:0': 1 }, bots: {}, deaths: { 'street:0:0': 1 }, kills: {},
    });
  });

  it('splits days on UTC midnight', () => {
    expect(heatDayKey(Date.parse('2026-09-28T23:59:59.999Z'))).toBe('2026-09-28');
    expect(heatDayKey(Date.parse('2026-09-29T00:00:00.000Z'))).toBe('2026-09-29');
  });
});
