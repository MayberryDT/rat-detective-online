import { describe, expect, it } from 'vitest';
import { CityRecorder, SolidGrid } from '../../src/worker/city/CityRecorder';
import { CityArchive } from '../../src/worker/city/CityArchive';
import type { CityStore } from '../../src/worker/city/CityStore';
import { cityPlaces } from '../../src/shared/city/places';
import type { CityFact } from '../../src/shared/city/facts';
import type { GrayboxBox } from '../../src/shared/grayboxLayout';
import { createPlayer } from '../../src/worker/gameState';
import { DEFAULT_APPEARANCE } from '../../src/shared/ratAppearance';
import { MAX_HP, type PlayerData, type Vec3Data } from '../../src/shared/networkProtocol';
import { noControls } from '../../src/shared/rat/ratBody';
import { createAssignment } from '../../src/shared/assignments';
import type { ChaosState } from '../../src/shared/chaosState';
import type { PickupState } from '../../src/shared/pickups';

// The recorder files a rat as inside geometry (anomalies, landing clips) through a grid index over the
// solids. Ways it could go wrong: a box missing from a grid cell it overlaps (big slabs, boxes on a cell
// edge, negative coordinates), a point on a box's margin counted differently, or boxes too thin to hold a
// rat ever counting.
const box = (x: number, y: number, z: number, w: number, h: number, d: number): GrayboxBox => ({ x, y, z, w, h, d, color: 0, rx: 0, rz: 0 });
/** The recorder's rule before the index: the body centre is more than .25 inside every face. */
const exhaustive = (solids: readonly GrayboxBox[], p: Vec3Data) =>
  solids.some(b => Math.abs(p.x - b.x) < b.w / 2 - .25 && Math.abs(p.z - b.z) < b.d / 2 - .25 && Math.abs(p.y + .5 - b.y) < b.h / 2 - .25);

describe('city recorder solid index', () => {
  it('agrees with testing every box, across slabs, cell edges, margins and thin boxes', () => {
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const fixed = [
      box(-15, -.5, -15, 362, 1, 362), // a ground slab over every grid cell
      box(0, 4, 0, 8.5, 8, 8.5), // faces a quarter inside cell edges
      box(-196, 4, -15, 1, 8, 362), // a boundary wall: only its centre plane is inside
      box(40.25, 2, -60.75, .5, 4, 3), // exactly the minimum width: never inside
    ];
    const solids = [
      ...fixed,
      ...Array.from({ length: 400 }, () => box(random() * 360 - 196, random() * 30 - 8, random() * 360 - 196, .3 + random() * 30, .3 + random() * 12, .3 + random() * 30)),
    ];
    const grid = new SolidGrid(solids);
    const points: Vec3Data[] = [
      // On the margins of the 8.5 box: .25 inside its faces is the edge of "inside".
      { x: 3.999, y: 3, z: 0 }, { x: 4, y: 3, z: 0 }, { x: -3.999, y: 3, z: -3.999 }, { x: -4, y: 3, z: 0 },
      { x: 0, y: -.5, z: 0 }, { x: -196, y: 3, z: 0 }, { x: 40.25, y: 1.5, z: -60.75 }, { x: 500, y: 0, z: 0 },
      ...Array.from({ length: 20_000 }, () => ({ x: random() * 400 - 216, y: random() * 40 - 10, z: random() * 400 - 216 })),
    ];
    const disagree = points.filter(p => grid.inside(p) !== exhaustive(solids, p));
    expect(disagree).toEqual([]);
    expect(points.filter(p => grid.inside(p)).length).toBeGreaterThan(1000);
    const edges = new SolidGrid(fixed);
    expect(edges.inside({ x: 3.999, y: 3, z: 0 })).toBe(true);
    expect(edges.inside({ x: 4, y: 3, z: 0 })).toBe(false);
    expect(edges.inside({ x: -196, y: 3, z: 0 })).toBe(true);
    expect(edges.inside({ x: -195.75, y: 3, z: 0 })).toBe(false);
    expect(edges.inside({ x: 40.25, y: 1.5, z: -60.75 })).toBe(false);
  });

  it('finds nothing when there are no solids', () => {
    expect(new SolidGrid([]).inside({ x: 0, y: 0, z: 0 })).toBe(false);
  });
});

// A stuck bot's rescue is the bot gate's measure of stuck rats. Ways it could go wrong: no fact, or more
// than one; the actor as a raw id or a number other than the one the rat's other facts use; the position
// or place taken after the teleport (where it was sent) rather than where it was stuck.
describe('city recorder rescues', () => {
  const recorder = () => {
    const facts: CityFact[] = [];
    const store = { addEvent: (_t: number, _round: string | undefined, _type: string, data: string) => { facts.push(JSON.parse(data) as CityFact); },
      addCell: () => {}, addPlace: () => {}, addFlow: () => {}, commit: () => {}, pruneEvents: () => {} } as unknown as CityStore;
    const city = new CityRecorder({ room: 'test', build: 'test', store, archive: new CityArchive('test', undefined, () => {}), layout: () => 3,
      isBot: id => id.startsWith('bot'), connected: () => true, solids: [] });
    return { city, facts };
  };

  it('records one rescue with the rat, where it was stuck and that place', () => {
    const { city, facts } = recorder(), now = Date.UTC(2026, 8, 29, 12);
    city.session('join', 'human', now); city.session('join', 'bot-1', now);
    const bot = createPlayer('bot-1', 'Bot', DEFAULT_APPEARANCE, { x: 61.26, y: 30.04, z: -12.33 });
    city.rescue(bot, now + 5);
    Object.assign(bot, { x: -100, y: .3, z: 120 });
    city.flush(now + 10);
    const joined = facts.find(f => f.type === 'session' && !f.human), rescues = facts.filter(f => f.type === 'rescue');
    expect(rescues).toEqual([expect.objectContaining({ type: 'rescue', t: now + 5, room: 'test', layout: 3, a: joined?.type === 'session' ? joined.a : -1,
      from: [61.3, 30, -12.3], place: cityPlaces().at(61.26, 30.04, -12.33).id })]);
    expect(cityPlaces().at(61.26, 30.04, -12.33).id).not.toBe(cityPlaces().at(-100, .3, 120).id);
  });
});

// Aim recording: how far off a shot was from each rat in sight, and whether it led a crossing rat, plus 20 Hz aim
// traces in fight windows. Ways it could go wrong: angle measured from the feet or to the wrong height (a dead-on
// shot reads as a miss); lead with the wrong sign; a rat behind a wall counted as a target; the camera's pitch lost
// (the view rotation carries none); bot shots flooding SQL or not sampled at all.
describe('city recorder aim', () => {
  const now = Date.UTC(2026, 8, 30, 12);
  const setup = (sight?: (from: Vec3Data, to: Vec3Data) => boolean) => {
    const sql: CityFact[] = [], archived: CityFact[] = [];
    const store = { addEvent: (_t: number, _round: string | undefined, _type: string, data: string) => { sql.push(JSON.parse(data) as CityFact); },
      addCell: () => {}, addPlace: () => {}, addFlow: () => {}, commit: () => {}, pruneEvents: () => {} } as unknown as CityStore;
    const archive = { push: (fact: CityFact) => { archived.push(JSON.parse(JSON.stringify(fact)) as CityFact); }, due: () => false, flush: () => {} } as unknown as CityArchive;
    const city = new CityRecorder({ room: 'test', build: 'test', store, archive, layout: () => 3, isBot: id => id.startsWith('bot'), connected: () => true, solids: [], ...(sight ? { sight } : {}) });
    const human = createPlayer('human', 'Tyler', DEFAULT_APPEARANCE, { x: 0, y: 0, z: 0 });
    const bot = createPlayer('bot-1', 'Bot', DEFAULT_APPEARANCE, { x: 0, y: 0, z: 20 });
    const players = new Map([[human.id, human], [bot.id, bot]]);
    // The bot crosses the human's view to +x at 5 u/s, sampled by the 5 Hz rings.
    for (let ms = 0; ms <= 1000; ms += 50) { bot.x = ms / 1000 * 5; city.tick(now + ms, players, undefined, { phase: 'playing' }); }
    const at = (x: number, y: number, z: number) => { const d = Math.hypot(x, y - 1.5, z); return { x: x / d, y: (y - 1.5) / d, z: z / d }; };
    return { city, sql, archived, human, bot, players, at };
  };
  const shots = (facts: CityFact[]) => facts.flatMap(f => f.type === 'shot' ? [f] : []);

  it('reads a dead-on shot as dead on, and leads by the sign of the crossing', () => {
    const { city, archived, human, bot, at } = setup();
    city.shot(human, at(bot.x, 1.3, 20), now + 1001);
    const turn = (dx: number) => at(bot.x + dx, 1.3, 20);
    city.shot(human, turn(1), now + 1002); // ahead of the rat's motion
    city.shot(human, turn(-1), now + 1003); // behind it
    const [dead, ahead, behind] = shots(archived).map(s => s.targets?.[0]);
    expect(dead!.d).toBeCloseTo(20.6, 1);
    expect(dead!.lat).toBeGreaterThan(4.5);
    expect(dead!.e).toBeLessThan(.002);
    expect(dead!.eh).toBeGreaterThan(.02); // the head is higher than the chest
    expect(ahead!.e).toBeGreaterThan(.04);
    expect(ahead!.e).toBeLessThan(.06);
    expect(ahead!.lead).toBeGreaterThan(.03);
    expect(behind!.lead).toBeLessThan(-.03);
  });

  it('never counts a rat behind a wall', () => {
    const { city, archived, human, bot, at } = setup(() => false);
    city.shot(human, at(bot.x, 1.3, 20), now + 1001);
    expect(shots(archived)[0]?.targets).toEqual([]);
  });

  it('keeps the camera pitch in fight windows, and none for bots', () => {
    const { city, archived, human, bot, players } = setup();
    const up = { x: 0, y: Math.sin(.3), z: Math.cos(.3) };
    for (let ms = 1050; ms <= 4000; ms += 50) {
      city.aim(human.id, up, now + ms);
      if (ms === 2000) city.hit({ attacker: human, victim: bot, damage: 1, killed: false, headshot: false, explosive: false, incoming: true }, now + ms);
      city.tick(now + ms, players, undefined, { phase: 'playing' });
    }
    const window = archived.find(f => f.type === 'window');
    expect(window?.type).toBe('window');
    if (window?.type !== 'window') return;
    const humanTrace = Object.values(window.aim ?? {}).find(trace => trace.some(s => s[2] !== null));
    expect(humanTrace?.filter(s => s[2] === .3).length).toBeGreaterThan(40);
    expect(humanTrace?.at(-1)?.[2]).toBe(.3);
    expect(Object.values(window.aim ?? {}).filter(trace => trace.every(s => s[2] === null))).toHaveLength(1);
  });

  it('keeps one bot shot in ten, in the archive only, with its targets', () => {
    const { city, sql, archived, human, bot, at } = setup();
    const toHuman = { x: -bot.x / Math.hypot(bot.x, 20), y: 0, z: -20 / Math.hypot(bot.x, 20) };
    for (let i = 0; i < 20; i++) city.shot(bot, toHuman, now + 1001 + i);
    city.shot(human, at(bot.x, 1.3, 20), now + 1030);
    city.flush(now + 1040);
    expect(shots(sql).map(s => s.human)).toEqual([true]);
    const kept = shots(archived).filter(s => !s.human);
    expect(kept).toHaveLength(2);
    expect(kept.every(s => !s.human && s.sample === 10 && s.targets?.length === 1)).toBe(true);
    expect(kept[0]?.dir[2]).toBeLessThan(-.9);
  });
});

// Controls recording: every rat's presses in fight windows, humans from their client's sends and bots from their motor
// each step, in one shape. Ways it could go wrong: a tap or jump shorter than a slot (or a send) lost; the bots' trace
// in another shape, rate or axis order than the humans'; counts carried into the next slot or across a death; an
// analogue push read as no key.
describe('city recorder controls', () => {
  const now = Date.UTC(2026, 8, 30, 12);
  it('keeps humans\' and bots\' presses in the same 20 Hz shape, taps shorter than a slot included', () => {
    const archived: CityFact[] = [];
    const store = { addEvent: () => {}, addCell: () => {}, addPlace: () => {}, addFlow: () => {}, commit: () => {}, pruneEvents: () => {} } as unknown as CityStore;
    const archive = { push: (fact: CityFact) => { archived.push(JSON.parse(JSON.stringify(fact)) as CityFact); }, due: () => false, flush: () => {} } as unknown as CityArchive;
    const city = new CityRecorder({ room: 'test', build: 'test', store, archive, layout: () => 3, isBot: id => id.startsWith('bot'), connected: () => true, solids: [] });
    const human = createPlayer('human', 'Tyler', DEFAULT_APPEARANCE, { x: 0, y: 0, z: 0 });
    const bot = createPlayer('bot-1', 'Bot', DEFAULT_APPEARANCE, { x: 0, y: 0, z: 20 });
    const players = new Map([[human.id, human], [bot.id, bot]]);
    const pressed = noControls();
    let step = 0;
    // From a second before the window, so the first presses (from no keys) fall outside it.
    for (let ms = -1000; ms <= 5000; ms += 50) {
      // The human holds W; one send at 2 s carries a D tap and a jump made between two sends.
      city.controls(human.id, ms === 2000 ? { f: 1, r: 0, j: 1, fx: 0, rx: 2 } : { f: 1, r: 0, j: 0, fx: 0, rx: 0 }, now + ms);
      // The bot's motor at 60 Hz: an analogue back-left push, with one step of right strafe and jump at 2017 ms.
      for (; -1000 + step * 1000 / 60 <= ms; step++) {
        const tap = step === 181;
        pressed.moveForward = -.6; pressed.moveRight = tap ? 1 : -.5; pressed.jump = tap;
        city.botControls(bot.id, pressed, now - 1000 + step * 1000 / 60);
      }
      if (ms === 3000) city.hit({ attacker: human, victim: bot, damage: 1, killed: false, headshot: false, explosive: false, incoming: true }, now + ms);
      city.tick(now + ms, players, undefined, { phase: 'playing' });
    }
    const window = archived.find(f => f.type === 'window');
    if (window?.type !== 'window') throw Error('no window');
    const traces = Object.values(window.controls ?? {});
    expect(traces).toHaveLength(2);
    const [humanTrace, botTrace] = traces[0]![0]![1] === 1 ? traces : [traces[1]!, traces[0]!];
    for (const trace of [humanTrace!, botTrace!]) {
      expect(trace.every(s => s.length === 6 && s.every(Number.isFinite))).toBe(true);
      expect(trace.map(s => s[0])).toEqual(Array.from({ length: 101 }, (_, i) => i * 50));
      // Each press is counted once, in one slot.
      expect(trace.reduce((n, s) => n + s[3], 0)).toBe(1);
    }
    expect(humanTrace!.find(s => s[3] === 1)).toEqual([2000, 1, 0, 1, 0, 2]);
    // The bot's tap: right pressed and let go within one slot, from the back-left diagonal it holds.
    const tapSlot = botTrace!.find(s => s[3] === 1)!;
    expect(tapSlot).toEqual([2050, -.6, -.5, 1, 0, 2]);
    expect(botTrace!.filter(s => s !== tapSlot).every(s => s[1] === -.6 && s[2] === -.5 && s[3] + s[4] + s[5] === 0)).toBe(true);
  });
});

// Pickups passed (docs/bot-learning-plan.md, L1): a usable supply within reach that the rat did not take. Ways it could go
// wrong: a fact every sample of one approach instead of one; a Quick Fix counted for a rat at full health, or a timed
// supply not counted at full health; a claimed supply, or one someone else took, counted as passed; a supply behind a
// wall or on another floor counted; a rat that dies beside it never counted; the nearest point of the approach lost.
describe('city recorder pickups passed', () => {
  const T = Date.UTC(2026, 8, 30, 12);
  const setup = (sight?: (from: Vec3Data, to: Vec3Data) => boolean) => {
    const archived: CityFact[] = [], counts: Record<string, number> = {};
    const store = { addEvent: () => {}, addCell: () => {}, addFlow: () => {}, commit: () => {}, pruneEvents: () => {},
      addPlace: (_day: string, _build: string, _layout: number, _mode: string, _place: string, measure: string, n: number) => { counts[measure] = (counts[measure] ?? 0) + n; } } as unknown as CityStore;
    const archive = { push: (fact: CityFact) => { archived.push(fact); }, due: () => false, flush: () => {} } as unknown as CityArchive;
    const city = new CityRecorder({ room: 'test', build: 'test', store, archive, layout: () => 3, isBot: id => id.startsWith('bot'), connected: () => true, solids: [], ...(sight ? { sight } : {}) });
    const fix: PickupState = { id: 'fix', kind: 'quick-fix', x: 0, y: .7, z: 0 }, alibi: PickupState = { id: 'alibi', kind: 'ironclad', x: 200, y: .7, z: 0 };
    const state: ChaosState = { time: T, assignment: { ...createAssignment('excessive-force', 0, 'round-1', () => 0), phase: 'active' as const },
      case: { owner: null, previousOwner: null, pickupAfter: 0, returningUntil: 0, p: { x: 0, y: 0, z: 100 }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } },
      dispatch: { phase: 'ready', started: 0, until: 0, serial: 0 }, pickups: [fix, alibi], possession: {}, corpses: [], shots: [], impacts: [], notice: { serial: 0, text: '' } };
    let t = T;
    const tick = (rat: PlayerData) => city.tick(t += 200, new Map([[rat.id, rat]]), state, { phase: 'playing' });
    /** Walks `rat` along z = `z` from x = `from` to `to`, a unit per 200 ms (every 5 Hz sample). */
    const walk = (rat: PlayerData, from: number, to: number, z: number) => {
      for (let x = from; from < to ? x <= to : x >= to; x += from < to ? 1 : -1) { rat.x = x; rat.z = z; tick(rat); }
    };
    const passed = () => archived.flatMap(f => f.type === 'pickup-passed' ? [f] : []);
    return { city, fix, counts, tick, walk, passed, now: () => t, flush: () => city.flush(t) };
  };
  const rat = (id: string, hp: number, y = .3) => Object.assign(createPlayer(id, 'Rat', DEFAULT_APPEARANCE, { x: -30, y, z: 0 }), { hp });

  it('records one fact per approach, at its nearest point, for a hurt rat passing a Quick Fix and any rat passing a timed supply', () => {
    const { walk, tick, passed, counts, flush } = setup(), hurt = rat('human', 3);
    walk(hurt, -30, 30, 5);
    expect(passed()).toEqual([expect.objectContaining({ type: 'pickup-passed', build: 'test', site: 'fix', kind: 'quick-fix', dist: 5, p: [0, .3, 5], hp: 3 })]);
    walk(hurt, 30, -30, 5);
    expect(passed()).toHaveLength(2);
    walk(rat('bot-1', MAX_HP), 170, 230, -8);
    expect(passed()[2]).toMatchObject({ site: 'alibi', kind: 'ironclad', dist: 8, hp: MAX_HP });
    // Dying beside it is passing it too.
    const doomed = rat('bot-2', 2);
    walk(doomed, -30, -3, 4);
    doomed.hp = 0; tick(doomed);
    expect(passed()[3]).toMatchObject({ site: 'fix', dist: 5, hp: 2 });
    flush();
    expect(counts).toMatchObject({ 'passed:quick-fix': 3, 'passed:ironclad': 1 });
  });

  it('records nothing for a Quick Fix at full health, a supply claimed or taken by another, one out of sight or on another floor', () => {
    const { city, fix, walk, passed, now } = setup();
    walk(rat('human', MAX_HP), -30, 30, 5);
    walk(rat('human-upstairs', 3, 8.3), -30, 30, 5);
    const claimer = rat('bot-1', 3);
    walk(claimer, -30, 0, 1);
    city.pickups([{ kind: 'collected', pickupId: 'fix', pickup: 'quick-fix', playerId: claimer.id }], new Map([[claimer.id, claimer]]), now());
    fix.availableAt = now() + 60_000;
    walk(claimer, 0, 30, 1);
    delete fix.availableAt;
    const beaten = rat('bot-2', 3);
    walk(beaten, -30, 0, 3);
    fix.availableAt = now() + 60_000; // someone else took it
    walk(beaten, 0, 30, 3);
    expect(passed()).toEqual([]);
    const walled = setup(() => false);
    walled.walk(rat('human', 3), -30, 30, 5);
    expect(walled.passed()).toEqual([]);
  });
});
