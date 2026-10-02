import { describe, expect, it } from 'vitest';
import { HighlightDetector, type HighlightHit, type HighlightRat } from '../../src/worker/HighlightDetector';
import { HIGHLIGHT_TUNING, type HighlightMarker } from '../../src/shared/highlights';
import { ASSIGNMENT_DESTINATIONS, createAssignment, type AssignmentState } from '../../src/shared/assignments';
import { parseClientMessage, parseServerMessage } from '../../src/shared/messageValidation';
import type { Vec3Data } from '../../src/shared/networkProtocol';

// Ways the detector could mislead the exhibits, written before the code:
// 1. A threshold is off by its edge: a carrier 12.1 u from the drop-off is "so close", two deaths make a pileup, kills
//    6.1 s apart a multi-kill, a 39 u headshot a long shot, a kill by a living shooter "from beyond".
// 2. A kind never fires from the event that should make it (each catalogue kind on a constructed event).
// 3. One kill becomes several markers (long shot and carrier down as two clips of one moment), or a growing multi-kill
//    is sent and recorded as a double and then a triple.
// 4. A round's winning kill is sent twice (as itself and as the round winner), or moments keep coming after the win.
// 5. A human's moment does not outrank the same bot moment; a kind seen all round keeps its full score.
// 6. The wire accepts an exhibit report of an unknown kind or action, an oversized id, or a malformed marker.

const rat = (id: string, x = 0, z = 0, hp = 5): HighlightRat => ({ id, x, y: .3, z, hp });

function harness(humans: string[] = []) {
  const sent: HighlightMarker[] = [], recorded: HighlightMarker[] = [], corpses = new Map<string, Vec3Data>();
  const d = new HighlightDetector({ send: m => sent.push(m), record: m => recorded.push(m), isHuman: id => humans.includes(id), corpseAt: id => corpses.get(id) });
  const tick = (now: number, rats: HighlightRat[] = [], owner: string | null = null, assignment?: AssignmentState) =>
    d.tick(now, new Map(rats.map(r => [r.id, r])), owner, assignment);
  const kill = (at: number, killer: HighlightRat | undefined, victim: HighlightRat, extra: Partial<HighlightHit> = {}) =>
    d.hit({ at, ...(killer ? { attacker: killer } : {}), victim: { ...victim, hp: 0 }, killed: true, ...extra });
  const kinds = () => sent.map(m => m.kind);
  return { d, sent, recorded, corpses, tick, kill, kinds };
}

/** A kill settles once its body has had `sentFlyingMs` to fly. */
const SETTLE = HIGHLIGHT_TUNING.sentFlyingMs;

function paperChase(): AssignmentState {
  const a = createAssignment('chain-of-custody', 0);
  return { ...a, phase: 'active', destinations: ['icebox'], deliverySerial: 0 };
}

describe('highlight thresholds', () => {
  it('a carrier killed 12.1 u from the drop-off is a carrier down, not so close; 11.9 u is so close', () => {
    const b = ASSIGNMENT_DESTINATIONS.icebox.bounds, z = (b.zmin + b.zmax) / 2;
    for (const [gap, kind] of [[12.1, 'carrier-down'], [11.9, 'so-close']] as const) {
      const h = harness();
      h.kill(0, rat('k', b.xmax + gap + 20, z), rat('c', b.xmax + gap, z), { carrier: true, assignment: paperChase() });
      h.tick(SETTLE);
      expect(h.kinds()).toEqual([kind]);
    }
  });

  it('two deaths in one spot are no pileup, nor three spread over more than 4 s or 18 u; three within are', () => {
    const cases: Array<[Array<[number, number]>, boolean]> = [
      [[[0, 0], [1000, 2]], false],
      [[[0, 0], [2000, 2], [4100, 4]], false],
      [[[0, 0], [1000, 2], [2000, 18.5]], false],
      [[[0, 0], [1000, 6], [3900, 12]], true],
    ];
    for (const [deaths, pileup] of cases) {
      const h = harness();
      deaths.forEach(([at, x], i) => h.kill(at, rat(`k${i}`, x + 30, 0), rat(`v${i}`, x, 0)));
      for (let t = 0; t <= 12_000; t += 500) h.tick(t);
      expect(h.kinds().includes('pileup')).toBe(pileup);
    }
  });

  it('kills 6.1 s apart are no multi-kill; 5.9 s apart are', () => {
    for (const [gap, multi] of [[6100, false], [5900, true]] as const) {
      const h = harness(), k = rat('k', 0, 0);
      h.kill(0, k, rat('a', 50, 0));
      h.kill(gap, k, rat('b', -50, 0));
      for (let t = 0; t <= 20_000; t += 500) h.tick(t);
      expect(h.kinds().includes('multi-kill')).toBe(multi);
    }
  });

  it('a growing multi-kill is sent again under its id and recorded once, as the triple', () => {
    const h = harness(), k = rat('k', 0, 0);
    h.kill(0, k, rat('a', 50, 0));
    h.kill(1000, k, rat('b', -50, 0));
    for (let t = 0; t <= 4000; t += 500) h.tick(t);
    h.kill(5000, k, rat('c', 0, 50));
    for (let t = 4500; t <= 20_000; t += 500) h.tick(t);
    const multi = h.sent.filter(m => m.kind === 'multi-kill');
    expect(multi).toHaveLength(2);
    expect(multi[1]!.id).toBe(multi[0]!.id);
    expect(multi[1]!.score).toBeGreaterThan(multi[0]!.score);
    expect(h.recorded.filter(m => m.kind === 'multi-kill')).toEqual([multi[1]]);
    expect(multi[1]!.actors).toEqual(['k', 'a', 'b', 'c']);
    expect(multi[1]!.leadMs).toBe(HIGHLIGHT_TUNING.maxLeadMs);
  });

  it('a kill is from beyond only when the shooter is dead', () => {
    for (const [hp, beyond] of [[1, false], [0, true]] as const) {
      const h = harness();
      h.kill(0, rat('k', 10, 0, hp), rat('v'));
      h.tick(SETTLE);
      expect(h.kinds()).toEqual(beyond ? ['from-beyond'] : []);
    }
  });

  it('a body sent 21 u is a plain kill; 23 u, or 5.1 u up, is sent flying', () => {
    for (const [end, flying] of [[{ x: 21, y: 1, z: 0 }, false], [{ x: 23, y: 1, z: 0 }, true], [{ x: 3, y: 6.1, z: 0 }, true]] as const) {
      const h = harness();
      h.corpses.set('v', { x: 0, y: 1, z: 0 });
      h.kill(0, rat('k', 5, 0), rat('v'));
      h.corpses.set('v', end);
      h.tick(1000);
      h.corpses.set('v', { x: 0, y: 1, z: 0 });
      h.tick(SETTLE);
      expect(h.kinds()).toEqual(flying ? ['sent-flying'] : []);
      if (flying) expect(h.sent[0]!.trailMs).toBeGreaterThan(HIGHLIGHT_TUNING.trailMs);
    }
  });

  it('a Quick Fix 3.1 s before dying is no last meal; 2.9 s is', () => {
    for (const [at, meal] of [[3100, false], [2900, true]] as const) {
      const h = harness();
      h.d.quickFix('v', 0);
      h.kill(at, rat('k', 5, 0), rat('v'));
      h.tick(at + SETTLE);
      expect(h.kinds()).toEqual(meal ? ['last-meal'] : []);
    }
  });

  it('dying 3.1 s after spawning is no fresh spawn; 2.9 s is', () => {
    for (const [at, fresh] of [[4100, false], [3900, true]] as const) {
      const h = harness();
      h.tick(0, [rat('v', 0, 0, 0)]);
      h.tick(1000, [rat('v')]);
      h.kill(at, rat('k', 5, 0), rat('v'));
      h.tick(at + SETTLE);
      expect(h.kinds()).toEqual(fresh ? ['fresh-spawn'] : []);
    }
  });

  it('a headshot from 39.5 u, or a body shot from 60 u, is no long shot; a headshot from 40.5 u is', () => {
    for (const [range, headshot, long] of [[39.5, true, false], [60, false, false], [40.5, true, true]] as const) {
      const h = harness();
      h.kill(0, rat('k', range, 0), rat('v'), { headshot });
      h.tick(SETTLE);
      expect(h.kinds()).toEqual(long ? ['long-shot'] : []);
    }
  });

  it('a one-bounce bank kill is no bank shot, nor an unreflected laser kill a ricochet; two bounces and one wall are', () => {
    const cases: Array<[Partial<HighlightHit>, string[]]> = [
      [{ bounces: 1 }, []], [{ bounces: 2 }, ['bank-shot']],
      [{ weapon: 'laser', reflections: 0 }, []], [{ weapon: 'laser', reflections: 1 }, ['laser-ricochet']],
      [{ ballRadius: .52 }, []], [{ ballRadius: .96 }, ['big-cheese']],
    ];
    for (const [extra, kinds] of cases) {
      const h = harness();
      h.kill(0, rat('k', 10, 0), rat('v'), extra);
      h.tick(SETTLE);
      expect(h.kinds()).toEqual(kinds);
    }
  });
});

describe('highlight kinds from their events', () => {
  it.each([
    ['splashdown', { environment: 'drowned' }, false],
    ['snapped', { victimTrapped: true }, true],
    ['airborne', { attackerAirborne: true }, true],
    ['airborne', { victimAirborne: true }, true],
    ['carrier-down', { carrier: true }, true],
    ['squashed', { squashAirMs: 2400 }, true],
    ['body-blow', { corpse: true }, true],
  ] as const)('%s on a kill (%j)', (kind, extra, killer) => {
    const h = harness();
    h.kill(0, killer ? rat('k', 3, 0) : undefined, rat('v'), extra);
    expect(h.sent).toEqual([]);
    h.tick(SETTLE);
    expect(h.kinds()).toEqual([kind]);
  });

  it('a squash or a flying body that only hurts is sent at once', () => {
    const h = harness();
    h.d.hit({ at: 0, attacker: rat('lander', 1, 0), victim: rat('v', 0, 0, 4), killed: false, squashAirMs: 3000 });
    h.d.hit({ at: 10, attacker: rat('k', 9, 0), victim: rat('w', 20, 0, 3), killed: false, corpse: true });
    h.d.hit({ at: 20, attacker: rat('k', 9, 0), victim: rat('x', 20, 0, 3), killed: false, headshot: true });
    expect(h.kinds()).toEqual(['squashed', 'body-blow']);
    expect(h.sent[0]!.actors).toEqual(['lander', 'v']);
    expect(h.sent[0]!.leadMs).toBe(4500);
  });

  it('a dud supply is a backfire, one kill is one marker, and a plain kill is none', () => {
    const h = harness();
    h.d.backfire(rat('b'), true, 0);
    h.kill(100, rat('k', 50, 0), rat('v'), { headshot: true, carrier: true });
    h.kill(200, rat('j', 5, 30), rat('w', 0, 30));
    h.tick(100 + SETTLE + 100);
    expect(h.kinds()).toEqual(['backfire', 'long-shot']);
    expect(h.sent[1]!.actors).toEqual(['k', 'v']);
    expect(h.recorded).toEqual(h.sent);
  });

  it('a delivery, and a steal scored within 15 s as steal and score (15.1 s: just the delivery)', () => {
    for (const [scoreAt, kind] of [[2000 + 15_100, 'delivery'], [2000 + 14_900, 'steal-score']] as const) {
      const h = harness(), a = paperChase(), rats = [rat('a'), rat('b', 5, 0)];
      h.tick(0, rats, 'a', a);
      h.tick(1000, rats, null, a);
      h.tick(2000, rats, 'b', a);
      h.tick(scoreAt - 100, rats, 'b', a);
      h.tick(scoreAt, rats, 'b', { ...a, deliverySerial: 1, lastDelivery: { playerId: 'b', playerName: 'B', at: scoreAt }, revision: a.revision + 1 });
      expect(h.kinds()).toEqual([kind]);
      if (kind === 'steal-score') expect(h.sent[0]!.actors).toEqual(['b', 'a']);
    }
  });

  it('a case kill or a Jurisdiction carrier starting to score counts as scoring a steal', () => {
    const ef = createAssignment('excessive-force', 0), zone = createAssignment('jurisdiction', 0), rats = [rat('a'), rat('b', 5, 0)];
    const scored: AssignmentState[] = [{ ...ef, caseKills: { b: 1 }, revision: ef.revision + 1 },
      { ...zone, jurisdiction: { ...zone.jurisdiction!, scorerId: 'b' }, revision: zone.revision + 1 }];
    for (const [before, after] of [[ef, scored[0]!], [zone, scored[1]!]] as const) {
      const h = harness();
      h.tick(0, rats, 'a', before);
      h.tick(500, rats, null, before);
      h.tick(1000, rats, 'b', before);
      h.tick(3000, rats, 'b', after);
      expect(h.kinds()).toEqual(['steal-score']);
    }
  });

  it('the winning kill is the round winner, once, and nothing follows the win', () => {
    const h = harness(), w = rat('w', 45, 0);
    h.kill(1000, w, rat('v'), { headshot: true });
    h.kill(1100, rat('k', 5, 30), rat('x', 0, 30), { victimTrapped: true });
    h.d.roundWon(w, 1200);
    h.kill(1300, rat('k', 5, 30), rat('y', 0, 30), { victimTrapped: true });
    h.d.backfire(rat('b'), true, 1400);
    h.tick(10_000);
    expect(h.kinds()).toEqual(['snapped', 'round-winner']);
    expect(h.sent[1]!.actors).toEqual(['w', 'v']);
    expect(h.sent[1]!.at).toBe(1000);
  });
});

describe('highlight scores', () => {
  it('ranks a human\'s moment 1.5 times the same bot moment, and a kind seen this round lower', () => {
    const bot = harness(), human = harness(['b']);
    bot.d.backfire(rat('b'), false, 0);
    human.d.backfire(rat('b'), false, 0);
    expect(human.sent[0]!.score).toBe(Math.round(bot.sent[0]!.score * HIGHLIGHT_TUNING.human));
    bot.d.backfire(rat('b'), false, 10);
    expect(bot.sent[1]!.score).toBeLessThan(bot.sent[0]!.score);
    bot.d.reset();
    bot.d.backfire(rat('b'), false, 20);
    expect(bot.sent[2]!.score).toBe(bot.sent[0]!.score);
  });
});

describe('highlight wire', () => {
  it('rejects exhibit reports of unknown kinds, actions or oversized ids', () => {
    const report = (fields: Record<string, unknown>) => parseClientMessage(JSON.stringify({ type: 'exhibit', id: 'h1', kind: 'pileup', action: 'saved', ...fields }));
    expect(report({})).toEqual({ type: 'exhibit', id: 'h1', kind: 'pileup', action: 'saved' });
    expect(report({ kind: 'kill-cam' })).toBeNull();
    expect(report({ action: 'liked' })).toBeNull();
    expect(report({ id: 'x'.repeat(65) })).toBeNull();
    expect(report({ id: '' })).toBeNull();
  });

  it('reads a marker back and rejects one with too long a lead or no actors', () => {
    const marker: HighlightMarker = { type: 'highlight', id: 'a-1', kind: 'pileup', at: 1_700_000_000_000, actors: ['k', 'v'], p: { x: 1, y: 2, z: 3 }, score: 95, leadMs: 4000, trailMs: 2000 };
    expect(parseServerMessage(JSON.stringify(marker))).toEqual(marker);
    expect(parseServerMessage(JSON.stringify({ ...marker, leadMs: HIGHLIGHT_TUNING.maxLeadMs + 1 }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...marker, actors: [] }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...marker, kind: 'kill-cam' }))).toBeNull();
  });
});
