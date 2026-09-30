import { describe, expect, it } from 'vitest';
import { CityRecorder, SolidGrid } from '../../src/worker/city/CityRecorder';
import { CityArchive } from '../../src/worker/city/CityArchive';
import type { CityStore } from '../../src/worker/city/CityStore';
import { cityPlaces } from '../../src/shared/city/places';
import type { CityFact } from '../../src/shared/city/facts';
import type { GrayboxBox } from '../../src/shared/grayboxLayout';
import { createPlayer } from '../../src/worker/gameState';
import { DEFAULT_APPEARANCE } from '../../src/shared/ratAppearance';
import type { Vec3Data } from '../../src/shared/networkProtocol';

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
      addCell: () => {}, addPlace: () => {}, addFlow: () => {}, pruneEvents: () => {} } as unknown as CityStore;
    const city = new CityRecorder({ room: 'test', store, archive: new CityArchive('test', undefined, () => {}), layout: () => 3,
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
      addCell: () => {}, addPlace: () => {}, addFlow: () => {}, pruneEvents: () => {} } as unknown as CityStore;
    const archive = { push: (fact: CityFact) => { archived.push(JSON.parse(JSON.stringify(fact)) as CityFact); }, due: () => false, flush: () => {} } as unknown as CityArchive;
    const city = new CityRecorder({ room: 'test', store, archive, layout: () => 3, isBot: id => id.startsWith('bot'), connected: () => true, solids: [], ...(sight ? { sight } : {}) });
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
