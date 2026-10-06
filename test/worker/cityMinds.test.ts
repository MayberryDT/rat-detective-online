import { describe, expect, it } from 'vitest';
import { CityRecorder } from '../../src/worker/city/CityRecorder';
import type { CityArchive } from '../../src/worker/city/CityArchive';
import type { CityStore } from '../../src/worker/city/CityStore';
import { cityDigest } from '../../src/worker/city/digest';
import type { CityFact } from '../../src/shared/city/facts';
import { cityModel } from '../../src/shared/city/model';
import { MIND_VERSION, type Decision, type Goal, type MindAnswer, type Plan } from '../../src/shared/bots/intent';
import { createAssignment } from '../../src/shared/assignments';
import type { ChaosState } from '../../src/shared/chaosState';
import type { PlayerData, RoundState } from '../../src/shared/networkProtocol';
import { createPlayer } from '../../src/worker/gameState';
import { DEFAULT_APPEARANCE } from '../../src/shared/ratAppearance';

// Decisions, goal ends and the Jev mind's windows (docs/bot-overhaul.md, B5). Ways it could go wrong:
// - the code mind's 180–300 ms beat, or a new combat target under the same goal, floods the archive;
// - a goal ends without its outcome, with the wrong one (a motor give-up called a replacement, a death
//   missed), or twice; a goal counted reached when someone else did the deed or another site was taken;
// - a Jev answer reused over several decisions is recorded each time, or a fresh one under the same goal
//   is dropped; its cost is lost; how Jev fared is missing from the code mind's decisions while Jev was on;
// - facts lack `mindVersion`; the aggregates or the digest lines disagree with what was recorded.
const T = Date.UTC(2026, 8, 29, 12);
function recorder() {
  const facts: CityFact[] = [], sql: string[] = [], counts: Record<string, Record<string, number>> = {}, minds: Record<string, number> = {};
  const store = {
    addPlace: (_day: string, _build: string, _layout: number, _mode: string, place: string, measure: string, n: number) => { const row = counts[place] ??= {}; row[measure] = (row[measure] ?? 0) + n; },
    addMind: (_day: string, _build: string, _layout: number, _mode: string, measure: string, n: number) => { minds[measure] = (minds[measure] ?? 0) + n; },
    addEvent: (_t: number, _round: string | undefined, type: string) => { sql.push(type); }, addCell: () => {}, addFlow: () => {}, commit: () => {}, pruneEvents: () => {},
  } as unknown as CityStore;
  // Decisions and goal ends are archived, not kept in SQL: the archive sees every fact as it is made.
  const archive = { push: (fact: CityFact) => { facts.push(fact); }, due: () => false, flush: () => {}, settled: async () => {} } as unknown as CityArchive;
  const city = new CityRecorder({ room: 'test', build: 'test-build', store, archive, layout: () => 3, isBot: id => id.startsWith('bot'), connected: () => true, solids: [] });
  const decisions = () => facts.flatMap(f => f.type === 'decision' ? [f] : []), ends = () => facts.flatMap(f => f.type === 'goal-end' ? [f] : []);
  return { city, facts, sql, counts, minds, decisions, ends };
}
const bot = (id: string, x = 0, z = 0) => createPlayer(id, 'Bot', DEFAULT_APPEARANCE, { x, y: 0, z });
function decide(goal: Goal, { plan = {}, answer = {}, failed = false }: { plan?: Partial<Plan>; answer?: Partial<MindAnswer>; failed?: boolean } = {}): Decision {
  const scores = { roam: 1.5, hunt: 1, [goal]: 3 };
  return { plan: { goal, mode: 'explore', key: goal, ...plan }, answer: { source: 'code', scores, ...answer }, personality: 'camper', weighted: scores,
    stance: 'focus', trigger: 'beat', ...(failed ? { failed: true as const } : {}) };
}
const killed = (victim: PlayerData, attacker?: PlayerData) => ({ ...(attacker ? { attacker } : {}), victim: Object.assign(victim, { hp: 0 }), damage: 5, killed: true, headshot: false, explosive: false, incoming: true });
function world(): ChaosState {
  return { time: T, assignment: { ...createAssignment('excessive-force', 0, 'round-1', () => 0), phase: 'active' as const },
    case: { owner: null, previousOwner: null, pickupAfter: 0, returningUntil: 0, p: { x: 40, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } },
    dispatch: { phase: 'ready', started: 0, until: 0, serial: 0 }, pickups: [], possession: {}, corpses: [], shots: [], impacts: [], notice: { serial: 0, text: '' } };
}
const playing: RoundState = { phase: 'playing' };

describe('the minds in the city recorder', () => {
  it('records every decision moment, whether it keeps the goal or not, and ends a goal replaced, failed or died', () => {
    const { city, decisions, ends, facts } = recorder(), b = bot('bot-1');
    city.decision(b, decide('hunt', { plan: { mode: 'combat', key: 'combat:a', follow: 'a' } }), T);
    city.decision(b, decide('hunt', { plan: { mode: 'combat', key: 'combat:b', follow: 'b' } }), T + 250);
    city.decision(b, decide('roam'), T + 500);
    city.decision(b, decide('roam'), T + 750);
    city.decision(b, decide('roam', { failed: true }), T + 900);
    city.hit(killed(b), T + 1400);
    city.flush(T + 2000);
    expect(decisions().map(d => [d.goal, d.t, d.mind])).toEqual([['hunt', T, 'code'], ['hunt', T + 250, 'code'], ['roam', T + 500, 'code'], ['roam', T + 750, 'code'], ['roam', T + 900, 'code']]);
    expect(decisions()[0]).toMatchObject({ personality: 'camper', motor: 'combat', trigger: 'beat', target: false, stance: 'focus', top: [['hunt', 3, 3], ['roam', 1.5, 1.5]] });
    expect(ends().map(e => [e.goal, e.outcome, e.durationMs, e.mind])).toEqual([['hunt', 'replaced', 500, 'code'], ['roam', 'failed', 400, 'code'], ['roam', 'died', 500, 'code']]);
    expect(facts.every(f => f.mindVersion === MIND_VERSION && f.build === 'test-build')).toBe(true);
  });

  it('counts a goal reached only when the bot itself did what it was for', () => {
    const { city, ends } = recorder(), state = world(), taker = bot('bot-1', 30), hunter = bot('bot-2'), prey = bot('bot-3', 5), other = bot('bot-4', 9),
      medic = bot('bot-5', -20), walker = bot('bot-6', 0, 60);
    const players = new Map([taker, hunter, prey, other, medic, walker].map(p => [p.id, p]));
    city.tick(T, players, state, playing);
    city.decision(taker, decide('take-case', { plan: { mode: 'case', key: 'case' } }), T + 10);
    city.decision(hunter, decide('hunt', { plan: { mode: 'combat', key: 'combat:bot-3', follow: 'bot-3' } }), T + 10);
    city.decision(other, decide('hunt', { plan: { mode: 'combat', key: 'combat:bot-3', follow: 'bot-3' } }), T + 10);
    city.decision(medic, decide('heal', { plan: { mode: 'pickup', key: 'pickup:kit' } }), T + 10);
    city.decision(walker, decide('roam', { plan: { destination: { x: 10, y: 0, z: 60 } } }), T + 10);
    // Someone else's pickup, and the walker still on its way: nothing reached yet.
    city.pickups([{ kind: 'collected', pickupId: 'other-kit', pickup: 'quick-fix', playerId: medic.id }], players, T + 100);
    city.tick(T + 200, players, state, playing);
    expect(ends()).toEqual([]);
    state.case.owner = taker.id;
    city.pickups([{ kind: 'collected', pickupId: 'kit', pickup: 'quick-fix', playerId: medic.id }], players, T + 300);
    city.hit(killed(prey, other), T + 350);
    walker.x = 8;
    city.tick(T + 400, players, state, playing);
    expect(ends().map(e => [e.goal, e.outcome]).sort()).toEqual([['heal', 'reached'], ['hunt', 'reached'], ['roam', 'reached'], ['take-case', 'reached']]);
    // The hunter whose quarry someone else killed is still on its goal.
    city.decision(hunter, decide('roam'), T + 500);
    expect(ends().at(-1)).toMatchObject({ goal: 'hunt', outcome: 'replaced', durationMs: 490 });
  });

  it('records each Jev answer with its cost, and how Jev fared when the code mind decided', () => {
    const { city, decisions, ends } = recorder(), b = bot('bot-1');
    const jev = (sentAt: number): Partial<MindAnswer> => ({ source: 'jev', danger: 2, target: 'bot-9', jev: { latencyMs: 180, tokens: 1500, sentAt } });
    city.decision(b, decide('hunt', { answer: jev(T) }), T + 200);
    city.decision(b, decide('hunt', { answer: jev(T + 1000) }), T + 1200);
    city.decision(b, decide('hunt'), T + 1500, 'stale');
    city.decision(b, decide('flee'), T + 1700, 'stale');
    expect(decisions().map(d => [d.mind, d.goal, d.t, d.latencyMs, d.tokens, d.jev])).toEqual([
      ['jev', 'hunt', T + 200, 180, 1500, undefined], ['jev', 'hunt', T + 1200, 180, 1500, undefined],
      ['code', 'hunt', T + 1500, undefined, undefined, 'stale'], ['code', 'flee', T + 1700, undefined, undefined, 'stale']]);
    expect(decisions()[0]).toMatchObject({ danger: 2, target: true });
    expect(ends().map(e => [e.goal, e.outcome, e.mind, e.durationMs])).toEqual([['hunt', 'replaced', 'jev', 1500]]);
  });

  // Decision inputs (docs/bot-learning-plan.md, L1). Ways it could go wrong: a dead rat counted as a rival or as nearer
  // the case; distance to the case measured to where the case was dropped rather than to whoever carries it; the carrier
  // itself never treated as nearer; the carrying bot not marked closer; the rival's health taken from the wrong rat.
  it('records what the bot faced when it decided: distances to the case and carrier, who is nearer, health and rats in view', () => {
    const { city, decisions } = recorder(), state = world(); // the case lies loose at (40, 0, 0)
    const me = bot('bot-1'), near = bot('bot-2', -30), far = bot('bot-3', 0, -50), dead = bot('bot-4', 39);
    near.hp = 2; dead.hp = 0;
    city.tick(T, new Map([me, near, far, dead].map(p => [p.id, p])), state, playing);
    city.decision(me, decide('take-case', { plan: { mode: 'case', key: 'case' } }), T + 10);
    expect(decisions()[0]?.in).toEqual({ case: 40, rival: 30, closer: true, hp: 5, rivalHp: 2, seen: 2, carrying: false });
    // A rival picks it up: the case is where its carrier is.
    state.case.owner = near.id; Object.assign(near, { x: 20, z: 15 });
    city.decision(me, decide('chase-carrier', { plan: { mode: 'combat', key: 'combat:bot-2', follow: 'bot-2' } }), T + 20);
    expect(decisions()[1]?.in).toEqual({ case: 25, carrier: 25, rival: 25, closer: false, hp: 5, rivalHp: 2, seen: 2, carrying: false });
    state.case.owner = me.id; me.hp = 3;
    city.decision(me, decide('keep-case', { plan: { mode: 'evade', key: 'evade' } }), T + 30);
    expect(decisions()[2]?.in).toEqual({ case: 0, rival: 25, closer: true, hp: 3, rivalHp: 2, seen: 2, carrying: true });
  });

  it('adds up decisions, outcomes and Jev windows into the digest\'s lines', () => {
    const { city, counts, minds, facts, sql } = recorder(), a = bot('bot-1'), b = bot('bot-2');
    city.decision(a, decide('hunt', { answer: { source: 'jev', jev: { latencyMs: 190, tokens: 1500, sentAt: T } } }), T);
    city.hit(killed(a), T + 100);
    city.decision(b, decide('hunt'), T + 200);
    city.decision(b, decide('take-case', { plan: { mode: 'case', key: 'case' } }), T + 300);
    city.decision(b, decide('roam'), T + 400);
    city.minds({ ms: 60_000, latencies: [100, 150, 190, 610], p50: 190, p90: 610,
      stats: { decisions: 540, requests: 60, answers: 55, failures: 5, staleDrops: 4, fallbacks: 90, throttled: 2, tokens: 82_500, dollars: 82_500 * .042 / 1e6 } }, T + 500);
    city.flush(T + 600);
    expect(facts.find(f => f.type === 'minds')).toMatchObject({ ms: 60_000, requests: 60, staleDrops: 4, p50: 190, p90: 610, mindVersion: MIND_VERSION });
    // SQL keeps the minute's window, not the hundreds of decisions and goal ends a bot makes an hour.
    expect(sql.filter(type => type === 'minds' || type === 'decision' || type === 'goal-end')).toEqual(['minds']);
    const text = cityDigest({ range: { from: '2026-09-29', to: '2026-09-29' }, days: ['2026-09-29'], places: cityModel().places, counts, modes: {}, flows: [], minds });
    expect(text).toContain('Decisions recorded: 3 by the code mind, 1 by Jev (Jev\'s share 25%)');
    expect(text).toContain('Goal mix, campers (4 decisions): hunt 50%, take-case 25%, roam 25%');
    expect(text).toContain('- hunt: reached 0% of 2 (died 50%, replaced 50%, failed 0%)');
    expect(text).toContain('reply latency p50 190 ms, p90 610 ms over 55 replies; $0.21 per hour on');
    expect(text).toContain('the code mind took 17% of 540 decisions (fallbacks); 7% of replies came back stale; 5 requests failed and 2 were held back');
  });
});
