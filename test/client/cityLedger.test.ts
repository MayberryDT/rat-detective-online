import { describe, expect, it } from 'vitest';
import { RoundLedger, ASSIST_WINDOW_MS, standings } from '../../src/shared/city/ledger';
import { createAssignment } from '../../src/shared/assignments';

// Ways the running K/D/A and standings could teach the future AI the wrong lesson, written first:
// 1. The killer or the victim is also credited with an assist.
// 2. Old damage (over 10 s) still earns an assist; repeated hits earn several.
// 3. A city kill (trap, launcher) loses the assists of the rats who softened the victim.
// 4. A streak survives a death, or last round's numbers leak into this round.
// 5. Standings rank the wrong rat first, give the wrong sign to the lead, or ignore the mode's own goal.
describe('round ledger', () => {
  it('credits assists only to other recent damagers, once each', () => {
    const l = new RoundLedger();
    l.damage('a', 'v', 1, 0);
    l.damage('b', 'v', 1, 1_000); l.damage('b', 'v', 1, 2_000);
    l.damage('v', 'v', 1, 2_500);
    l.damage('k', 'v', 2, 3_000);
    expect(l.death('k', 'v', 3_000).sort()).toEqual(['a', 'b']);
    expect(l.kda('k')).toMatchObject({ k: 1, a: 0, streak: 1, dmgOut: 2 });
    expect(l.kda('a')).toMatchObject({ k: 0, a: 1 });
    expect(l.kda('b')).toMatchObject({ a: 1, dmgOut: 2 });
    expect(l.kda('v')).toMatchObject({ d: 1, a: 0, dmgIn: 6 }); // Its own explosion hurt it too.
  });

  it('drops damage older than the assist window', () => {
    const l = new RoundLedger();
    l.damage('a', 'v', 1, 0);
    expect(l.death('k', 'v', ASSIST_WINDOW_MS + 1)).toEqual([]);
    l.damage('a', 'w', 1, 0);
    expect(l.death('k', 'w', ASSIST_WINDOW_MS)).toEqual(['a']);
  });

  it('keeps assists when the city does the killing', () => {
    const l = new RoundLedger();
    l.damage('a', 'v', 1, 0);
    expect(l.death(null, 'v', 1_000)).toEqual(['a']);
    expect(l.kda('v').d).toBe(1);
  });

  it('ends a streak at death and forgets everything at a new round', () => {
    const l = new RoundLedger();
    l.death('k', 'x', 0); l.death('k', 'y', 10);
    expect(l.kda('k').streak).toBe(2);
    l.death('z', 'k', 20);
    expect(l.kda('k')).toMatchObject({ k: 2, d: 1, streak: 0 });
    l.shot('k'); l.hit('k', true);
    expect(l.kda('k')).toMatchObject({ shots: 1, hits: 1, hs: 1 });
    l.reset();
    expect(l.kda('k')).toEqual({ k: 0, d: 0, a: 0, streak: 0, dmgOut: 0, dmgIn: 0, hs: 0, shots: 0, hits: 0 });
  });
});

describe('standings', () => {
  it('uses each mode’s own goal and signs the lead against the nearest rival', () => {
    const a = createAssignment('chain-of-custody', 0);
    a.deliveries = { x: 2, y: 1 };
    const s = standings(['x', 'y', 'z'], { assignment: a, kills: { x: 0, y: 9, z: 3 } });
    expect(s.get('x')).toMatchObject({ rank: 1, raw: 2 });
    expect(s.get('x')!.progress).toBeCloseTo(2 / 3);
    expect(s.get('x')!.lead).toBeCloseTo(1 / 3);
    expect(s.get('y')!.lead).toBeCloseTo(-1 / 3);
    expect(s.get('z')).toMatchObject({ rank: 3, progress: 0 });
  });

  it('breaks progress ties by kills', () => {
    const a = createAssignment('excessive-force', 0);
    a.caseKills = { x: 4, y: 4 };
    const s = standings(['x', 'y'], { assignment: a, kills: { x: 5, y: 7 } });
    expect(s.get('y')!.rank).toBe(1);
    expect(s.get('x')!.progress).toBeCloseTo(.4);
  });

  it('reads Jurisdiction in zone time, Closing Time as a share of case time, and no assignment as kills to 20', () => {
    const j = createAssignment('jurisdiction', 0);
    j.jurisdiction!.heldMs = { x: 30_000 };
    expect(standings(['x'], { assignment: j }).get('x')!.progress).toBeCloseTo(.5);
    const c = createAssignment('closing-time', 0);
    const closing = standings(['x', 'y'], { assignment: c, possession: { x: 30, y: 10 } });
    expect(closing.get('x')!.progress).toBeCloseTo(1);
    expect(closing.get('y')!.progress).toBeCloseTo(1 / 3);
    expect(standings(['x'], { kills: { x: 10 } }).get('x')!.progress).toBeCloseTo(.5);
  });
});
