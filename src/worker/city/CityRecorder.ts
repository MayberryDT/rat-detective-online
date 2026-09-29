import type { ChaosState } from '../../shared/chaosState';
import type { PlayerData, RoundState, ShotResultOutcome, Vec3Data } from '../../shared/networkProtocol';
import type { PickupEvent, ShotResultEvent } from '../../shared/ChaosSimulation';
import type { GrayboxBox } from '../../shared/grayboxLayout';
import { CITY_BOUNDS } from '../../shared/grayboxLayout';
import { DISPATCH_STATIONS } from '../../shared/chaosState';
import { activeDestination, destinationPoint } from '../../shared/assignments';
import { JURISDICTION_ZONES } from '../../shared/jurisdictionZones';
import { activeZone } from '../../shared/jurisdiction';
import type { PickupKind } from '../../shared/pickups';
import { cityPlaces } from '../../shared/city/places';
import { cityFloor } from '../../shared/city/frame';
import { CITY_SCHEMA_VERSION, p3, type CityFact, type FactContext, type RatSituation, type WorldSituation } from '../../shared/city/facts';
import { RoundLedger, standings } from '../../shared/city/ledger';
import { heatCellIndex, heatCellKey, heatDayKey } from '../HeatMap';
import type { CityStore } from './CityStore';
import type { CityArchive } from './CityArchive';

/** Watches one room and writes the city map's facts (docs/city-map.md, layer 2): situations every
 * second, 5 Hz windows around fights, discrete events, and the aggregates the map reads. */
export const FRAME_MS = 1000;
/** With no human connected (the always-alive bot city), situations are kept every 5 s. */
export const BOT_ONLY_FRAME_MS = 5000;
export const SAMPLE_MS = 200;
export const FLUSH_MS = 60_000;
export const WINDOW_BEFORE_MS = 3000;
export const WINDOW_AFTER_MS = 2000;
const RING = 30;
/** Ball outcomes after which the ball keeps flying. */
const IN_FLIGHT: ReadonlySet<ShotResultOutcome> = new Set<ShotResultOutcome>(['first-step', 'world-bounce', 'ironclad-reflect', 'dispatch-contact', 'pressure-contact', 'case-contact']);
/** Humans kill from far off (a third of Tyler's first 36 kills were past 50 units), so sight reaches across a district. */
const SIGHT_RANGE = 150;
const ANOMALY_COOLDOWN_MS = 10_000;
const PENDING_LIMIT = 50_000;

export interface RecorderDeps {
  room: string;
  store: CityStore;
  archive: CityArchive;
  layout: () => number;
  isBot: (id: string) => boolean;
  /** False while a human's seat is reserved after a disconnect. */
  connected: (id: string) => boolean;
  /** Line of sight between two eye positions; absent means everyone counts as visible. */
  sight?: (from: Vec3Data, to: Vec3Data) => boolean;
  /** Axis-aligned solid boxes a rat must never be inside. */
  solids: readonly GrayboxBox[];
}
export interface HitRecord { attacker?: PlayerData; victim: PlayerData; damage: number; killed: boolean; headshot: boolean; explosive: boolean; incoming: boolean }

type Sample = [number, number, number, number, number, number];
interface Life { start: number; spawnPlace: string; lastPickup?: { kind: PickupKind; at: number }; lastHit?: { at: number; by?: string }; prev?: { x: number; z: number; at: number }; place?: string; carryStart?: number; shots: number[] }

/** Counts under an aggregate key (day|layout|mode), then two labels: no key string is built per count. */
class Tally<B> {
  readonly buckets = new Map<string, Map<string, Map<B, number>>>();
  /** Distinct entries, which is what the pending limit bounds. */
  size = 0;
  // Runs of counts share a key and label (a volley of world bounces), so the last lookup is kept.
  private lastKey = '';
  private lastA = '';
  private lastCounts?: Map<B, number>;
  add(key: string, a: string, b: B, n: number): void {
    let counts = key === this.lastKey && a === this.lastA ? this.lastCounts : undefined;
    if (!counts) {
      let bucket = this.buckets.get(key);
      if (!bucket) this.buckets.set(key, bucket = new Map());
      counts = bucket.get(a);
      if (!counts) bucket.set(a, counts = new Map());
      this.lastKey = key; this.lastA = a; this.lastCounts = counts;
    }
    const was = counts.get(b);
    if (was === undefined) this.size++;
    counts.set(b, (was ?? 0) + n);
  }
  clear(): void { this.buckets.clear(); this.size = 0; this.lastCounts = undefined; }
}

const SOLID_GRID = 8;
/** Solid boxes bucketed on a coarse x/z grid by their shrunken extent, so `inside` tests only nearby boxes. */
export class SolidGrid {
  private readonly cells: GrayboxBox[][] = [];
  private readonly x0: number;
  private readonly z0: number;
  private readonly nx: number;
  private readonly nz: number;
  constructor(solids: readonly GrayboxBox[]) {
    // Half extents minus the .25 margin; a box with none left can never contain a rat.
    const boxes = solids.filter(b => b.w / 2 - .25 > 0 && b.d / 2 - .25 > 0 && b.h / 2 - .25 > 0);
    // The small pad keeps a point on a float boundary in every bucket its exact test could pass.
    const lo = (c: number, size: number) => c - (size / 2 - .25) - 1e-6, hi = (c: number, size: number) => c + (size / 2 - .25) + 1e-6;
    this.x0 = Math.min(Infinity, ...boxes.map(b => lo(b.x, b.w))); this.z0 = Math.min(Infinity, ...boxes.map(b => lo(b.z, b.d)));
    this.nx = boxes.length ? Math.floor((Math.max(...boxes.map(b => hi(b.x, b.w))) - this.x0) / SOLID_GRID) + 1 : 0;
    this.nz = boxes.length ? Math.floor((Math.max(...boxes.map(b => hi(b.z, b.d))) - this.z0) / SOLID_GRID) + 1 : 0;
    for (let i = 0; i < this.nx * this.nz; i++) this.cells.push([]);
    for (const b of boxes) {
      const ix1 = Math.floor((hi(b.x, b.w) - this.x0) / SOLID_GRID), iz0 = Math.floor((lo(b.z, b.d) - this.z0) / SOLID_GRID), iz1 = Math.floor((hi(b.z, b.d) - this.z0) / SOLID_GRID);
      for (let ix = Math.floor((lo(b.x, b.w) - this.x0) / SOLID_GRID); ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) this.cells[ix * this.nz + iz]!.push(b);
    }
  }
  /** The rat's body centre is well inside a solid box. */
  inside(p: Vec3Data): boolean {
    const ix = Math.floor((p.x - this.x0) / SOLID_GRID), iz = Math.floor((p.z - this.z0) / SOLID_GRID);
    if (!(ix >= 0 && ix < this.nx && iz >= 0 && iz < this.nz)) return false;
    const y = p.y + .5;
    for (const b of this.cells[ix * this.nz + iz]!) if (Math.abs(p.x - b.x) < b.w / 2 - .25 && Math.abs(p.z - b.z) < b.d / 2 - .25 && Math.abs(y - b.y) < b.h / 2 - .25) return true;
    return false;
  }
}

const BALL_LAYERS: Record<ShotResultOutcome, string> = { 'first-step': 'ball-first-step', 'rat-body': 'ball-rat-body', 'rat-head': 'ball-rat-head', 'ironclad-reflect': 'ball-ironclad-reflect',
  'case-contact': 'ball-case-contact', 'world-bounce': 'ball-world-bounce', 'dispatch-contact': 'ball-dispatch-contact', 'pressure-contact': 'ball-pressure-contact', 'fake-case': 'ball-fake-case',
  lifetime: 'ball-lifetime', capacity: 'ball-capacity', reset: 'ball-reset', rejected: 'ball-rejected' };
const SHOTS = { human: 'shots-human', bot: 'shots-bot' } as const;
const HITS = { human: 'hits-human', bot: 'hits-bot' } as const;
const BANK_HITS = { human: 'bank-hits-human', bot: 'bank-hits-bot' } as const;

/** Queued bot shots or ball batches that force a pass (see `CityRecorder.drain`). */
const QUEUE_LIMIT = 256;
/** One tick's ball results, with each hit's shooter where they stood at the previous tick (x, y, z; NaN if unknown). */
interface QueuedBalls { events: readonly ShotResultEvent[]; now: number; key: string; shooters?: number[] }

export class CityRecorder {
  private readonly places = cityPlaces();
  private readonly ledger = new RoundLedger();
  private readonly actors = new Map<string, number>();
  private readonly lives = new Map<string, Life>();
  private readonly rings = new Map<string, Sample[]>();
  private readonly windows: Array<{ ids: Set<string>; from: number; until: number }> = [];
  /** Wall bounces per live ball, so a hit knows whether it was banked. Bounded by the sim's ball cap. */
  private readonly bounces = new Map<string, number>();
  private readonly flights = new Map<string, { machine?: string; start: number; apex: number }>();
  private readonly seenLaunches = new Set<string>();
  private readonly anomalyAt = new Map<string, number>();
  private readonly cells = new Tally<number>();
  private readonly placeCounts = new Tally<string>();
  private readonly flows = new Map<string, number>();
  private events: Array<{ t: number; round?: string; type: string; data: string }> = [];
  private readonly alive = new Map<string, boolean>();
  private readonly buffs = new Map<string, { ironclad: boolean; hustle: boolean }>();
  private readonly siteAvailable = new Map<string, boolean>();
  private readonly siteRestockedAt = new Map<string, number>();
  private roundId?: string;
  private mode: FactContext['mode'] = 'none';
  private liveAt?: number;
  private incident?: string;
  private phase?: RoundState['phase'];
  private caseOwner: string | null = null;
  private caseChangeAt = 0;
  private caseReturning = false;
  private deliverySerial = -1;
  private dispatchKey = '';
  private zoneKey = '';
  private scorer: string | null = null;
  private frameAt = 0;
  private sampleAt = 0;
  private flushedAt = 0;
  private started = false;

  private readonly solids: SolidGrid;
  constructor(private readonly deps: RecorderDeps) { this.solids = new SolidGrid(deps.solids); }

  // ---- context and output ----
  private actor(id: string): number {
    let n = this.actors.get(id);
    if (n === undefined) { n = this.actors.size + 1; this.actors.set(id, n); }
    return n;
  }
  private context(now: number): FactContext {
    return { t: now, ...(this.liveAt !== undefined && now >= this.liveAt ? { rm: now - this.liveAt } : {}), room: this.deps.room,
      ...(this.roundId ? { round: this.roundId } : {}), layout: this.deps.layout(), schema: CITY_SCHEMA_VERSION, mode: this.mode,
      ...(this.incident ? { incident: this.incident } : {}) };
  }
  /** Archive every fact; keep the discrete ones (not frames or windows) in SQL for 30 days too. */
  private emit(fact: CityFact): void {
    this.deps.archive.push(fact, fact.t);
    if (fact.type !== 'frame' && fact.type !== 'window') this.events.push({ t: fact.t, round: fact.round, type: fact.type, data: JSON.stringify(fact) });
  }
  /** Aggregate key prefix, rebuilt only when the UTC day, layout or mode changes (it runs for every shot). */
  private keyCache = { dayStart: 0, dayEnd: -1, layout: -1, mode: '', key: '' };
  private key(now: number): string {
    const c = this.keyCache, layout = this.deps.layout();
    if (now < c.dayStart || now >= c.dayEnd || layout !== c.layout || this.mode !== c.mode) {
      const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
      this.keyCache = { dayStart, dayEnd: dayStart + 86_400_000, layout, mode: this.mode, key: `${heatDayKey(now)}|${layout}|${this.mode}` };
    }
    return this.keyCache.key;
  }
  private count(map: Map<string, number>, key: string, n = 1): void { map.set(key, (map.get(key) ?? 0) + n); }
  private cell(now: number, layer: string, p: Vec3Data, n = 1): void {
    const c = heatCellIndex(p.x, p.y, p.z);
    if (c >= 0) this.cells.add(this.key(now), layer, c, n);
  }
  private measure(now: number, place: string, measure: string, n = 1): void { this.placeCounts.add(this.key(now), place, measure, n); }
  private who(id: string): 'human' | 'bot' { return this.deps.isBot(id) ? 'bot' : 'human'; }
  private life(id: string, now: number, p?: Vec3Data): Life {
    let l = this.lives.get(id);
    if (!l) { l = { start: now, spawnPlace: p ? this.places.at(p.x, p.y, p.z).id : 'outside', shots: [] }; this.lives.set(id, l); }
    return l;
  }

  // ---- the queue ----
  // Bots' shots and each tick's ball results arrive between physics steps, where recording them one at a time
  // cost more in cold caches than the work itself. They wait here, and `drain` records them in one pass before
  // anything reads or changes what they touch: a frame, a round change, a spawn or case change starting a life,
  // a hit or pickup starting one, and a flush. Queued work emits no fact (a batch holding a human's ball drains
  // at once), so facts keep their order, and counts keep the aggregate key of when they happened.
  private readonly shotIds: string[] = [];
  private readonly shotKeys: string[] = [];
  /** now, x, y, z per queued shot. */
  private readonly shotData = new Float64Array(QUEUE_LIMIT * 4);
  private shotCount = 0;
  private readonly ballBatches: QueuedBalls[] = [];
  private drain(): void {
    const s = this.shotData;
    for (let i = 0; i < this.shotCount; i++) {
      const id = this.shotIds[i]!, key = this.shotKeys[i]!, now = s[i * 4]!, x = s[i * 4 + 1]!, y = s[i * 4 + 2]!, z = s[i * 4 + 3]!;
      const life = this.lives.get(id) ?? this.life(id, now, { x, y, z });
      life.shots.push(now); if (life.shots.length > 40) life.shots.shift();
      this.ledger.shot(id);
      const c = heatCellIndex(x, y, z);
      if (c >= 0) this.cells.add(key, SHOTS.bot, c, 1);
      this.placeCounts.add(key, this.places.at(x, y, z).id, SHOTS.bot, 1);
    }
    this.shotCount = 0;
    for (const batch of this.ballBatches) this.recordBalls(batch);
    this.ballBatches.length = 0;
  }

  // ---- hooks from the room ----
  shot(player: PlayerData, direction: Vec3Data, now: number): void {
    // Bots fire thousands of times an hour: their rate lives in the counts and situations, not one fact per shot.
    if (this.deps.isBot(player.id)) {
      const i = this.shotCount++, s = this.shotData;
      this.shotIds[i] = player.id; this.shotKeys[i] = this.key(now);
      s[i * 4] = now; s[i * 4 + 1] = player.x; s[i * 4 + 2] = player.y; s[i * 4 + 3] = player.z;
      if (this.shotCount === QUEUE_LIMIT) this.drain();
      return;
    }
    const life = this.life(player.id, now, player), place = this.places.at(player.x, player.y, player.z).id;
    const gap = life.shots.length ? now - life.shots[life.shots.length - 1]! : undefined;
    life.shots.push(now); if (life.shots.length > 40) life.shots.shift();
    this.ledger.shot(player.id);
    this.cell(now, SHOTS.human, player);
    this.measure(now, place, SHOTS.human);
    this.emit({ ...this.context(now), type: 'shot', a: this.actor(player.id), human: true, p: p3(player), place, dir: p3(direction), ...(gap === undefined ? {} : { gapMs: gap }) });
  }

  balls(events: readonly ShotResultEvent[], now: number): void {
    if (!events.length) return;
    let shooters: number[] | undefined, fact = false;
    for (const e of events) {
      if (!e.owner || e.outcome === 'first-step' || e.outcome === 'world-bounce') continue;
      if (e.outcome === 'rat-body' || e.outcome === 'rat-head') { const s = this.last.get(e.owner); (shooters ??= []).push(s?.x ?? NaN, s?.y ?? NaN, s?.z ?? NaN); }
      if (!this.deps.isBot(e.owner)) fact = true;
    }
    this.ballBatches.push({ events, now, key: this.key(now), ...(shooters ? { shooters } : {}) });
    if (fact || this.ballBatches.length === QUEUE_LIMIT) this.drain();
  }

  private recordBalls({ events, now, key, shooters }: QueuedBalls): void {
    let hit = 0;
    for (const e of events) {
      if (e.outcome === 'first-step') continue;
      const at = e.point ?? e.end;
      let bounced = this.bounces.get(e.ballId) ?? 0;
      if (e.outcome === 'world-bounce') {
        this.bounces.set(e.ballId, ++bounced);
        if (this.bounces.size > 1024) this.bounces.delete(this.bounces.keys().next().value!);
      }
      if (!IN_FLIGHT.has(e.outcome)) this.bounces.delete(e.ballId);
      if (e.owner && (e.outcome === 'rat-body' || e.outcome === 'rat-head')) {
        this.ledger.hit(e.owner, e.outcome === 'rat-head');
        const x = shooters![hit++ * 3]!;
        if (!Number.isNaN(x)) {
          const place = this.places.at(x, shooters![hit * 3 - 2]!, shooters![hit * 3 - 1]!).id, who = this.who(e.owner);
          this.placeCounts.add(key, place, HITS[who], 1);
          // Shooting round corners is the game: a banked hit came off at least one wall first.
          if (bounced) this.placeCounts.add(key, place, BANK_HITS[who], 1);
        }
      }
      if (at) { const c = heatCellIndex(at.x, at.y, at.z); if (c >= 0) this.cells.add(key, BALL_LAYERS[e.outcome], c, 1); }
      // World bounces and bots' balls only matter in aggregate; a human's ball ends are facts.
      if (e.outcome === 'world-bounce' || !e.owner || this.deps.isBot(e.owner)) continue;
      const place = at ? this.places.at(at.x, at.y, at.z).id : undefined;
      this.emit({ ...this.context(now), type: 'ball', ...(e.owner ? { a: this.actor(e.owner) } : {}), outcome: e.outcome,
        ...(at ? { p: p3(at), place } : {}), ...(e.victimId ? { victim: this.actor(e.victimId) } : {}), ...(bounced ? { bounces: bounced } : {}) });
    }
  }

  pickups(events: readonly PickupEvent[], players: ReadonlyMap<string, PlayerData>, now: number): void {
    if (!events.length) return;
    if (events.some(e => e.kind !== 'healed' && !this.lives.has(e.playerId))) this.drain();
    for (const e of events) {
      const player = players.get(e.playerId);
      if (!player) continue;
      if (e.kind === 'healed') { this.emit({ ...this.context(now), type: 'heal', a: this.actor(player.id), cause: e.cause, hp: e.hp }); continue; }
      const place = this.places.at(player.x, player.y, player.z).id, life = this.life(player.id, now, player);
      life.lastPickup = { kind: e.pickup, at: now };
      const restocked = this.siteRestockedAt.get(e.pickupId);
      this.cell(now, 'pickups', player);
      this.measure(now, place, `pickup:${e.pickup}`);
      this.emit({ ...this.context(now), type: 'pickup', a: this.actor(player.id), site: e.pickupId, kind: e.pickup, p: p3(player), place,
        hpBefore: this.last.get(player.id)?.hp ?? player.hp, ...(restocked === undefined ? {} : { waitedMs: now - restocked }) });
      this.siteAvailable.set(e.pickupId, false);
    }
  }

  hit(h: HitRecord, now: number): void {
    if (!this.lives.has(h.victim.id)) this.drain();
    const v = h.victim, a = h.attacker, vPlace = this.places.at(v.x, v.y, v.z).id;
    const aPlace = a ? this.places.at(a.x, a.y, a.z).id : undefined;
    const dist = a ? Math.round(Math.hypot(a.x - v.x, a.y - v.y, a.z - v.z) * 10) / 10 : undefined;
    this.ledger.damage(a?.id ?? null, v.id, h.damage, now);
    const life = this.life(v.id, now, v);
    life.lastHit = { at: now, ...(a && a.id !== v.id ? { by: a.id } : {}) };
    this.emit({ ...this.context(now), type: 'damage', ...(a ? { a: this.actor(a.id), ap: p3(a) } : {}), victim: this.actor(v.id), dmg: h.damage, head: h.headshot,
      explosive: h.explosive, incoming: h.incoming, vp: p3(v), ...(dist === undefined ? {} : { dist }), hpAfter: v.hp });
    this.openWindow([v.id, ...(a && a.id !== v.id ? [a.id] : [])], now);
    if (!h.killed) return;
    const killer = a && a.id !== v.id ? a : undefined;
    const assists = this.ledger.death(killer?.id ?? null, v.id, now).map(id => this.actor(id));
    // `incoming` is the ball's travel for the ragdoll (every shot has one), not a missile.
    const cause = h.explosive ? 'explosion' : !killer && !a ? 'city' : h.headshot ? 'headshot' : 'shot';
    this.cell(now, 'deaths', v); this.measure(now, vPlace, 'deaths'); this.measure(now, vPlace, `deaths-${this.who(v.id)}`);
    if (now - life.start < 5000) this.measure(now, life.spawnPlace, 'spawn-deaths-5s');
    if (killer && aPlace) {
      this.cell(now, 'kills', killer); this.measure(now, aPlace, 'kills'); this.measure(now, aPlace, `kills-${this.who(killer.id)}`);
      if (dist !== undefined) this.measure(now, aPlace, 'kill-dist-dm', Math.round(dist * 10));
    }
    this.emit({ ...this.context(now), type: 'death', ...(killer ? { a: this.actor(killer.id), ap: p3(killer), aplace: aPlace } : {}), victim: this.actor(v.id), cause,
      vp: p3(v), vplace: vPlace, ...(killer && dist !== undefined ? { dist } : {}), lifeMs: now - life.start, assists });
    this.alive.set(v.id, false);
  }

  session(what: 'join' | 'leave', id: string, now: number): void {
    this.emit({ ...this.context(now), type: 'session', what, a: this.actor(id), human: !this.deps.isBot(id) });
  }

  // ---- the room tick ----
  /** Each rat's position and health at the previous tick (hooks run before this tick's). */
  private readonly last = new Map<string, { x: number; y: number; z: number; hp: number }>();

  tick(now: number, players: ReadonlyMap<string, PlayerData>, state: ChaosState | undefined, round: RoundState): void {
    // Frames read the queued shots (fire rate, K/D/A) and a new round resets the ledger.
    const a = state?.assignment;
    if (now >= this.frameAt || a && a.roundId !== this.roundId || round.phase !== this.phase) this.drain();
    this.watchRound(now, players, state, round);
    for (const p of players.values()) {
      const last = this.last.get(p.id);
      if (last) { last.x = p.x; last.y = p.y; last.z = p.z; last.hp = p.hp; } else this.last.set(p.id, { x: p.x, y: p.y, z: p.z, hp: p.hp });
    }
    if (now >= this.sampleAt) {
      this.sampleAt = now + SAMPLE_MS;
      this.sample(now, players);
      if (state) this.watchWorld(now, players, state);
    }
    if (now >= this.frameAt) {
      const humans = [...players.keys()].some(id => !this.deps.isBot(id) && this.deps.connected(id));
      this.frameAt = now + (humans ? FRAME_MS : BOT_ONLY_FRAME_MS);
      this.frame(now, players, state, round, humans ? 1 : BOT_ONLY_FRAME_MS / FRAME_MS);
    }
    if (now - this.flushedAt >= FLUSH_MS || this.cells.size + this.placeCounts.size > PENDING_LIMIT) this.flush(now);
    else if (this.deps.archive.due(now)) this.deps.archive.flush(now);
  }

  private watchRound(now: number, players: ReadonlyMap<string, PlayerData>, state: ChaosState | undefined, round: RoundState): void {
    const a = state?.assignment;
    this.incident = state?.dispatch.phase === 'active' ? state.dispatch.incident : undefined;
    if (a && a.roundId !== this.roundId) {
      this.roundId = a.roundId; this.mode = a.id; this.liveAt = a.liveAt;
      this.ledger.reset(); this.actors.clear(); this.deliverySerial = a.deliverySerial;
      const ids = [...players.keys()];
      this.emit({ ...this.context(now), type: 'round', what: 'start', humans: ids.filter(id => !this.deps.isBot(id)).length, bots: ids.filter(id => this.deps.isBot(id)).length });
    }
    if (round.phase !== this.phase) {
      if (this.phase === 'playing' && round.phase === 'won') this.roundEnd(now, players, state, round);
      this.phase = round.phase;
    }
  }

  private roundEnd(now: number, players: ReadonlyMap<string, PlayerData>, state: ChaosState | undefined, round: RoundState): void {
    const ids = [...players.keys()], table = this.standingsFor(ids, players, state);
    this.emit({ ...this.context(now), type: 'round', what: 'end', ...(round.winnerId ? { winner: this.actor(round.winnerId) } : {}),
      ...(state?.assignment?.result ? { method: state.assignment.result.method } : {}),
      ...(this.liveAt !== undefined ? { durationMs: now - this.liveAt } : {}),
      humans: ids.filter(id => !this.deps.isBot(id)).length, bots: ids.filter(id => this.deps.isBot(id)).length,
      standings: ids.map(id => ({ a: this.actor(id), human: !this.deps.isBot(id), standing: table.get(id)!, kda: this.ledger.kda(id) })) });
  }

  private standingsFor(ids: string[], players: ReadonlyMap<string, PlayerData>, state: ChaosState | undefined) {
    return standings(ids, { ...(state?.assignment ? { assignment: state.assignment } : {}), possession: state?.possession ?? {},
      kills: Object.fromEntries(ids.map(id => [id, players.get(id)?.kills ?? 0])) });
  }

  /** 5 Hz: the rings behind fight windows, spawns, launches and landings. */
  private sample(now: number, players: ReadonlyMap<string, PlayerData>): void {
    for (const p of players.values()) {
      let ring = this.rings.get(p.id);
      if (!ring) this.rings.set(p.id, ring = []);
      // Windows copy what they keep, so the oldest sample is reused rather than reallocated.
      const s: Sample = ring.length >= RING ? ring.shift()! : [0, 0, 0, 0, 0, 0];
      s[0] = now; s[1] = Math.round(p.x * 10) / 10; s[2] = Math.round(p.y * 10) / 10; s[3] = Math.round(p.z * 10) / 10; s[4] = Math.round(yaw(p) * 100) / 100; s[5] = p.hp;
      ring.push(s);
      // A rat already alive when the recorder starts (after an eviction) did not just spawn.
      const wasAlive = this.alive.get(p.id);
      if (p.hp > 0 && (wasAlive === false || wasAlive === undefined && this.started)) { this.drain(); this.spawn(p, players, now); }
      this.alive.set(p.id, p.hp > 0);
      const flight = this.flights.get(p.id);
      if (flight) {
        flight.apex = Math.max(flight.apex, p.y);
        const prev = ring[ring.length - 2], vy = prev ? (p.y - prev[2]) / ((now - prev[0]) / 1000) : Infinity;
        if (p.hp <= 0 || now - flight.start > 15_000) this.flights.delete(p.id);
        else if (now - flight.start > 500 && Math.abs(vy) < .4) this.land(p, flight, now);
      }
    }
    this.started = true;
    for (let i = this.windows.length - 1; i >= 0; i--) {
      const w = this.windows[i]!;
      if (now < w.until) continue;
      this.windows.splice(i, 1);
      const samples: Record<string, Sample[]> = {};
      for (const id of w.ids) samples[String(this.actor(id))] = (this.rings.get(id) ?? []).filter(s => s[0] >= w.from && s[0] <= w.until).map(s => [s[0] - w.from, s[1], s[2], s[3], s[4], s[5]]);
      this.emit({ ...this.context(w.from), type: 'window', reason: 'damage', from: w.from, to: w.until, samples });
    }
  }

  private openWindow(ids: string[], now: number): void {
    const open = this.windows.find(w => ids.some(id => w.ids.has(id)) && now <= w.until);
    if (open) { for (const id of ids) open.ids.add(id); open.until = now + WINDOW_AFTER_MS; return; }
    this.windows.push({ ids: new Set(ids), from: now - WINDOW_BEFORE_MS, until: now + WINDOW_AFTER_MS });
  }

  private spawn(p: PlayerData, players: ReadonlyMap<string, PlayerData>, now: number): void {
    const place = this.places.at(p.x, p.y, p.z).id;
    this.lives.set(p.id, { start: now, spawnPlace: place, shots: [] });
    let nearest: number | undefined;
    for (const o of players.values()) if (o.id !== p.id && o.hp > 0) nearest = Math.min(nearest ?? Infinity, Math.hypot(o.x - p.x, o.z - p.z));
    this.cell(now, 'spawns', p); this.measure(now, place, 'spawns');
    this.emit({ ...this.context(now), type: 'spawn', a: this.actor(p.id), p: p3(p), place, ...(nearest === undefined ? {} : { nearest: Math.round(nearest) }) });
  }

  private land(p: PlayerData, flight: { machine?: string; start: number; apex: number }, now: number): void {
    this.flights.delete(p.id);
    const place = this.places.at(p.x, p.y, p.z).id, clip = this.solids.inside(p);
    this.cell(now, 'landings', p); this.measure(now, place, 'landings');
    if (clip) this.measure(now, place, 'landing-clips');
    this.emit({ ...this.context(now), type: 'landing', a: this.actor(p.id), ...(flight.machine ? { machine: flight.machine } : {}), p: p3(p), place,
      airMs: now - flight.start, apex: Math.round(flight.apex * 10) / 10, clip });
  }

  /** Changes in the shared world: the case, Dispatch, zones, launches, pickup sites and buffs. */
  private watchWorld(now: number, players: ReadonlyMap<string, PlayerData>, state: ChaosState): void {
    const c = state.case, owner = c.owner;
    if (owner !== this.caseOwner) {
      const place = this.places.at(c.p.x, c.p.y, c.p.z).id, prev = this.caseOwner;
      const prevLife = prev ? this.lives.get(prev) : undefined, carryMs = prevLife?.carryStart !== undefined ? now - prevLife.carryStart : undefined;
      if (prev && prevLife) delete prevLife.carryStart;
      if (owner) {
        this.drain();
        this.life(owner, now, players.get(owner)).carryStart = now;
        const stolen = prev !== null;
        this.measure(now, place, stolen ? 'case-steal' : 'case-take');
        this.emit({ ...this.context(now), type: 'case', what: stolen ? 'steal' : 'take', a: this.actor(owner), ...(prev ? { from: this.actor(prev) } : {}), p: p3(c.p), place, ...(carryMs === undefined ? {} : { carryMs }) });
      } else if (prev) {
        this.measure(now, place, 'case-drop');
        this.emit({ ...this.context(now), type: 'case', what: 'drop', a: this.actor(prev), p: p3(c.p), place, ...(carryMs === undefined ? {} : { carryMs }) });
      }
      this.caseOwner = owner; this.caseChangeAt = now;
    }
    const returning = c.returningUntil > now;
    if (returning && !this.caseReturning) this.emit({ ...this.context(now), type: 'case', what: 'respawn', p: p3(c.p), place: this.places.at(c.p.x, c.p.y, c.p.z).id });
    this.caseReturning = returning;
    const a = state.assignment;
    if (a && a.deliverySerial !== this.deliverySerial) {
      const by = a.lastDelivery?.playerId, p = by ? players.get(by) : undefined;
      if (by && p && this.deliverySerial >= 0) {
        const place = this.places.at(p.x, p.y, p.z).id;
        this.measure(now, place, 'deliveries');
        this.emit({ ...this.context(now), type: 'case', what: 'deliver', a: this.actor(by), p: p3(p), place });
      }
      this.deliverySerial = a.deliverySerial;
    }
    const d = state.dispatch, dispatchKey = `${d.serial}:${d.phase}:${d.incident ?? ''}:${d.wanted ?? ''}`;
    if (dispatchKey !== this.dispatchKey) {
      const caller = d.caller ? players.get(d.caller) : undefined;
      const pillar = caller && d.phase === 'rolling' ? DISPATCH_STATIONS.reduce((best, s) => Math.hypot(s.x - caller.x, s.y - caller.y, s.z - caller.z) < Math.hypot(best.x - caller.x, best.y - caller.y, best.z - caller.z) ? s : best).id : undefined;
      this.emit({ ...this.context(now), type: 'dispatch', phase: d.phase, ...(d.incident ? { incident: d.incident } : {}), ...(d.caller ? { caller: this.actor(d.caller) } : {}),
        ...(pillar ? { pillar } : {}), ...(d.wanted ? { wanted: this.actor(d.wanted) } : {}) });
      this.dispatchKey = dispatchKey;
    }
    const j = a?.jurisdiction;
    if (j) {
      const zone = activeZone(j), zoneKey = `${j.serial}:${zone}`;
      if (zoneKey !== this.zoneKey) { this.emit({ ...this.context(now), type: 'zone', what: 'activate', zone }); this.zoneKey = zoneKey; }
      if (j.scorerId !== this.scorer) {
        if (j.scorerId) this.emit({ ...this.context(now), type: 'zone', what: 'scorer', zone, scorer: this.actor(j.scorerId) });
        this.scorer = j.scorerId;
      }
    }
    for (const launch of state.pressure?.launches ?? []) {
      if (this.seenLaunches.has(launch.id)) continue;
      this.seenLaunches.add(launch.id);
      if (this.seenLaunches.size > 256) this.seenLaunches.delete(this.seenLaunches.values().next().value!);
      const p = players.get(launch.playerId);
      if (!p) continue;
      const place = this.places.at(p.x, p.y, p.z).id;
      this.flights.set(p.id, { ...(launch.machineId ? { machine: launch.machineId } : {}), start: now, apex: p.y });
      this.measure(now, place, 'launches');
      this.emit({ ...this.context(now), type: 'launch', a: this.actor(p.id), ...(launch.machineId ? { machine: launch.machineId } : {}), boost: !!launch.boost, p: p3(p), place });
    }
    for (const site of state.pickups ?? []) {
      const available = site.availableAt === undefined || site.availableAt <= now;
      const was = this.siteAvailable.get(site.id);
      if (available && was === false) { this.siteRestockedAt.set(site.id, now); this.emit({ ...this.context(now), type: 'restock', site: site.id, kind: site.kind }); }
      if (available && was === undefined) this.siteRestockedAt.set(site.id, now);
      if (available !== was) this.siteAvailable.set(site.id, available);
    }
    for (const p of players.values()) {
      const b = state.buffs?.[p.id], ironclad = (b?.ironcladUntil ?? 0) > now, hustle = (b?.hustleUntil ?? 0) > now, was = this.buffs.get(p.id);
      if (!was) { this.buffs.set(p.id, { ironclad, hustle }); continue; }
      if (was.ironclad && !ironclad) this.emit({ ...this.context(now), type: 'buff-end', a: this.actor(p.id), buff: 'ironclad' });
      if (was.hustle && !hustle) this.emit({ ...this.context(now), type: 'buff-end', a: this.actor(p.id), buff: 'hustle' });
      was.ironclad = ironclad; was.hustle = hustle;
    }
  }

  /** 1 Hz: every rat's situation plus the world's, presence heat, flows and anomalies. */
  /** `seconds` is how long this frame stands for (5 in the bot-only city), so presence stays in seconds. */
  private frame(now: number, players: ReadonlyMap<string, PlayerData>, state: ChaosState | undefined, round: RoundState, seconds: number): void {
    if (round.phase !== 'playing' || !state) return;
    const ids = [...players.keys()], table = this.standingsFor(ids, players, state), rats: RatSituation[] = [];
    const objective = this.objective(state);
    for (const p of players.values()) {
      if (!this.deps.connected(p.id)) continue;
      const life = this.life(p.id, now, p), place = this.places.at(p.x, p.y, p.z), alive = p.hp > 0, who = this.who(p.id);
      const prev = life.prev, dt = prev ? (now - prev.at) / 1000 : 0;
      const v: [number, number] = prev && dt > 0 ? [round1((p.x - prev.x) / dt), round1((p.z - prev.z) / dt)] : [0, 0];
      life.prev = { x: p.x, z: p.z, at: now };
      const b = state.buffs?.[p.id], carrying = state.case.owner === p.id;
      let visible = 0, nearest: number | undefined, nearestVisible: number | undefined;
      for (const o of players.values()) {
        if (o.id === p.id || o.hp <= 0 || !alive) continue;
        const dist = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z);
        nearest = Math.min(nearest ?? Infinity, dist);
        if (dist <= SIGHT_RANGE && (!this.deps.sight || this.deps.sight({ x: p.x, y: p.y + 1.5, z: p.z }, { x: o.x, y: o.y + 1, z: o.z }))) { visible++; nearestVisible = Math.min(nearestVisible ?? Infinity, dist); }
      }
      life.shots = life.shots.filter(t => now - t <= 10_000);
      const lastShot = life.shots[life.shots.length - 1];
      rats.push({ a: this.actor(p.id), human: who === 'human', p: p3(p), floor: cityFloor(p.y), place: place.id, v, yaw: round2(yaw(p)), pitch: round2(pitch(p)),
        hp: p.hp, alive, ...(p.respawnAt !== undefined && !alive ? { respawnIn: Math.max(0, p.respawnAt - now) } : {}), lifeMs: now - life.start,
        buffs: { ...((b?.ironcladUntil ?? 0) > now ? { ironclad: b!.ironcladUntil! - now } : {}), ...((b?.hustleUntil ?? 0) > now ? { hustle: b!.hustleUntil! - now } : {}) },
        ...(life.lastPickup ? { lastPickup: { kind: life.lastPickup.kind, agoMs: now - life.lastPickup.at } } : {}),
        case: { carrying, ...(carrying && life.carryStart !== undefined ? { carryMs: now - life.carryStart } : {}), dist: round1(Math.hypot(state.case.p.x - p.x, state.case.p.y - p.y, state.case.p.z - p.z)) },
        ...(objective ? { objectiveDist: round1(Math.hypot(objective.x - p.x, objective.z - p.z)) } : {}),
        standing: table.get(p.id)!, kda: this.ledger.kda(p.id),
        fire: { last10s: life.shots.length, ...(lastShot === undefined ? {} : { lastAgoMs: now - lastShot }) },
        danger: { visible, ...(nearest === undefined ? {} : { nearest: round1(nearest) }), ...(nearestVisible === undefined ? {} : { nearestVisible: round1(nearestVisible) }),
          ...(life.lastHit ? { lastHitAgoMs: now - life.lastHit.at, ...(life.lastHit.by ? { lastHitBy: this.actor(life.lastHit.by) } : {}) } : {}),
          ...(state.dispatch.wanted === p.id ? { wanted: true as const } : {}) } });
      if (!alive) continue;
      // Presence: one second in this place and cell; a place change is one transit.
      this.cell(now, `${who}s`, p, seconds); this.measure(now, place.id, `${who}-s`, seconds);
      if (Math.hypot(v[0], v[1]) < .3) this.measure(now, place.id, `still-${who}-s`, seconds);
      if (life.place && life.place !== place.id) this.count(this.flows, `${this.key(now)}|${life.place}|${place.id}|${who}`);
      life.place = place.id;
      this.anomalies(p, now);
    }
    this.emit({ ...this.context(now), type: 'frame', world: this.world(now, players, state), rats });
  }

  private objective(state: ChaosState): Vec3Data | undefined {
    const a = state.assignment;
    if (a?.id === 'chain-of-custody') { const d = activeDestination(a); return d ? destinationPoint(d) : undefined; }
    if (a?.id === 'jurisdiction' && a.jurisdiction) { const r = JURISDICTION_ZONES[activeZone(a.jurisdiction)].areas[0]!; return { x: (r.xmin + r.xmax) / 2, y: 0, z: (r.zmin + r.zmax) / 2 }; }
    return state.case.p;
  }

  private world(now: number, players: ReadonlyMap<string, PlayerData>, state: ChaosState): WorldSituation {
    const c = state.case, d = state.dispatch, j = state.assignment?.jurisdiction;
    const pickups: Record<string, number> = {};
    for (const s of state.pickups ?? []) pickups[s.id] = s.availableAt === undefined ? 0 : Math.max(0, s.availableAt - now);
    const pressure: Record<string, number> = {};
    for (const [id, level] of Object.entries(state.pressure?.levels ?? {})) pressure[id] = round1(level);
    const ids = [...players.keys()];
    let zone: WorldSituation['zone'];
    if (j) {
      const id = activeZone(j), z = JURISDICTION_ZONES[id];
      const inside = [...players.values()].filter(p => p.hp > 0 && Math.abs(p.y - z.floorY) < 6 && z.areas.some(r => p.x >= r.xmin && p.x <= r.xmax && p.z >= r.zmin && p.z <= r.zmax)).map(p => this.actor(p.id));
      zone = { id, leftMs: j.remainingMs, inside, ...(j.scorerId ? { scorer: this.actor(j.scorerId) } : {}) };
    }
    return { phase: 'playing', ...(this.liveAt !== undefined ? { clockMs: now - this.liveAt } : {}),
      case: { ...(c.owner ? { owner: this.actor(c.owner) } : {}), loose: !c.owner, returning: c.returningUntil > now, p: p3(c.p), place: this.places.at(c.p.x, c.p.y, c.p.z).id,
        sinceChangeMs: now - this.caseChangeAt, decoys: (state.extraCases ?? []).length },
      dispatch: { phase: d.phase, ...(d.incident && d.phase !== 'ready' ? { incident: d.incident } : {}), ...(d.until > now ? { leftMs: d.until - now } : {}),
        ...(d.caller ? { caller: this.actor(d.caller) } : {}), ...(d.wanted ? { wanted: this.actor(d.wanted) } : {}) },
      pickups, pressure, ...(zone ? { zone } : {}),
      humans: ids.filter(id => !this.deps.isBot(id)).length, bots: ids.filter(id => this.deps.isBot(id)).length,
      corpses: state.corpses.length, balls: state.shots.length };
  }

  private anomalies(p: PlayerData, now: number): void {
    const what = p.y < -9.5 ? 'fell-through'
      : p.x < CITY_BOUNDS.min - 2 || p.x > CITY_BOUNDS.max + 2 || p.z < CITY_BOUNDS.min - 2 || p.z > CITY_BOUNDS.max + 2 ? 'out-of-bounds'
      : this.solids.inside(p) ? 'inside-geometry' : undefined;
    if (!what) return;
    const key = `${p.id}:${what}`;
    if (now - (this.anomalyAt.get(key) ?? -Infinity) < ANOMALY_COOLDOWN_MS) return;
    this.anomalyAt.set(key, now);
    const place = this.places.at(p.x, p.y, p.z).id;
    this.cell(now, 'anomalies', p); this.measure(now, place, `anomaly:${what}`);
    this.emit({ ...this.context(now), type: 'anomaly', what, a: this.actor(p.id), p: p3(p), place });
  }

  /** Resolves once every archive write started so far has finished. */
  settled(): Promise<void> { return this.deps.archive.settled(); }

  /** Aggregates go to SQL; the archive buffer goes to R2 when due. */
  flush(now: number, archive = false): void {
    this.flushedAt = now; this.drain();
    const prefix = (key: string) => { const [day, layout, mode] = key.split('|') as [string, string, string]; return [day, Number(layout), mode] as const; };
    for (const [key, layers] of this.cells.buckets) { const [day, layout, mode] = prefix(key); for (const [layer, counts] of layers) for (const [cell, n] of counts) this.deps.store.addCell(day, layout, mode, layer, heatCellKey(cell), n); }
    for (const [key, places] of this.placeCounts.buckets) { const [day, layout, mode] = prefix(key); for (const [place, counts] of places) for (const [measure, n] of counts) this.deps.store.addPlace(day, layout, mode, place, measure, n); }
    for (const [key, n] of this.flows) { const [day, layout, mode, src, dst, who] = key.split('|') as [string, string, string, string, string, string]; this.deps.store.addFlow(day, Number(layout), mode, src, dst, who, n); }
    for (const e of this.events) this.deps.store.addEvent(e.t, e.round, e.type, e.data);
    this.cells.clear(); this.placeCounts.clear(); this.flows.clear(); this.events = [];
    this.deps.store.pruneEvents(now);
    if (archive || this.deps.archive.due(now)) this.deps.archive.flush(now);
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
/** Body yaw from the mesh rotation (a turn about y). */
const yaw = (p: PlayerData) => 2 * Math.atan2(p.meshQy, p.meshQw);
/** Aim pitch from the view rotation. */
const pitch = (p: PlayerData) => Math.asin(Math.max(-1, Math.min(1, 2 * (p.qw * p.qx - p.qy * p.qz))));
