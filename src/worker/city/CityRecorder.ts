import type { ChaosState } from '../../shared/chaosState';
import { MAX_HP, type EnvironmentCause, type PlayerData, type RoundState, type ShotResultOutcome, type Vec3Data } from '../../shared/networkProtocol';
import type { IncidentEvent, PickupEvent, ShotResultEvent } from '../../shared/ChaosSimulation';
import type { GrayboxBox } from '../../shared/grayboxLayout';
import { CITY_BOUNDS } from '../../shared/grayboxLayout';
import { DISPATCH_STATIONS } from '../../shared/chaosState';
import { activeDestination, destinationPoint, type AssignmentId } from '../../shared/assignments';
import type { AdminCommandName, AdminVia } from '../../shared/admin';
import type { IncidentId } from '../../shared/incidentCatalog';
import { JURISDICTION_ZONES } from '../../shared/jurisdictionZones';
import { activeZone } from '../../shared/jurisdiction';
import { BUFF_FIELD, TIMED_PICKUPS, WEAPON_TUNING, entryWeapon, type PickupKind, type PlayerBuffs, type TimedPickup, type WeaponKind } from '../../shared/pickups';
import { cityPlaces } from '../../shared/city/places';
import { cityFloor } from '../../shared/city/frame';
import { CITY_SCHEMA_VERSION, p3, type CityFact, type DecisionInputs, type FactContext, type RatSituation, type ShotTarget, type WorldSituation } from '../../shared/city/facts';
import type { PerfReport } from '../../shared/perfReport';
import type { ExhibitMessage, HighlightMarker } from '../../shared/highlights';
import { decideMeasure, goalMeasure, JEV_COUNTS, latencyBucket, type GoalOutcome, type MindName } from '../../shared/city/minds';
import { MIND_VERSION, codeOnlyRound, type Decision, type Goal, type MotorMode, type Personality } from '../../shared/bots/intent';
import { RoundLedger, standings } from '../../shared/city/ledger';
import { heatCellIndex, heatCellKey, heatDayKey } from '../HeatMap';
import type { CityStore } from './CityStore';
import type { CityArchive } from './CityArchive';
import type { JevOutcome, JevStats } from '../bots/jevMind';
import { ControlTally, type ControlsInput } from '../../shared/rat/controlTally';
import type { RatControls } from '../../shared/rat/ratBody';

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
/** A bot this close to the place its goal was heading for has reached it. */
const ARRIVED = 3;
/** Aim rings: 20 samples a second, 8 s deep, so a fight window gets its whole aim trace. */
const AIM_MS = 50, AIM_RING = 160;
/** A human's camera look older than this is stale; the ring falls back to the body's facing. */
const AIM_FRESH_MS = 300;
/** A player's client sends its controls at least once a second; older than this, a rat's controls are unknown. */
const CONTROLS_FRESH_MS = 1500;
/** One bot shot in this many is kept as a fact with its targets, for comparing bot aim with human aim. */
const BOT_SHOT_SAMPLE = 10;
/** Rats in sight nearest the aim line, measured for each kept shot. */
const SHOT_TARGETS = 3;
/** Heights above a rat's feet: the eye sight lines start from, and the body and head spheres (ServerBotController). */
const EYE = 1.5, CHEST = 1.3, HEAD = 1.9;
/** Pickups passed: a supply this near (horizontally) and this little above or below a rat is in its reach; the rat has
 * gone past it once this far away or this far above or below. */
const PASS_REACH = 12, PASS_LEAVE = 16, PASS_FLOOR = 3, PASS_OFF_FLOOR = 6;
const PASSED: Record<PickupKind, string> = { ironclad: 'passed:ironclad', hustle: 'passed:hustle', 'quick-fix': 'passed:quick-fix', stakeout: 'passed:stakeout',
  'tommy-gun': 'passed:tommy-gun', laser: 'passed:laser', mousetrap: 'passed:mousetrap' };

export interface RecorderDeps {
  room: string;
  /** The release every fact and aggregate is stamped with (`FactContext.build`). */
  build: string;
  store: CityStore;
  archive: CityArchive;
  layout: () => number;
  isBot: (id: string) => boolean;
  /** A headless agent browser (joined with `agent=1`): recorded apart from humans; absent means none. */
  isAgent?: (id: string) => boolean;
  /** False while a human's seat is reserved after a disconnect. */
  connected: (id: string) => boolean;
  /** Line of sight between two eye positions; absent means everyone counts as visible. */
  sight?: (from: Vec3Data, to: Vec3Data) => boolean;
  /** Axis-aligned solid boxes a rat must never be inside. */
  solids: readonly GrayboxBox[];
}
/** `bounces`: a Crossfire bank shot's world bounces. */
export interface HitRecord { attacker?: PlayerData; victim: PlayerData; damage: number; killed: boolean; headshot: boolean; explosive: boolean; incoming: boolean; weapon?: WeaponKind; environment?: EnvironmentCause; bounces?: number }
/** One window of the Jev mind while it was on (`GameRoom.updateJev`). */
export interface MindsWindow { ms: number; stats: JevStats; latencies: readonly number[]; p50?: number; p90?: number }
/** A bot's current goal, from the decision that took it up to its end. */
interface OpenGoal {
  goal: Goal; mode: MotorMode; mind: MindName; personality: Personality | undefined; start: number; place: string;
  /** The rat hunted or chased. */
  quarry?: string;
  /** The pickup site sought. */
  site?: string;
  /** The place a roam, flee, ambush, mischief or evading carrier heads for. */
  to?: Vec3Data;
}
/** Goals whose end is getting to their place. */
const PLACE_GOALS: ReadonlySet<Goal> = new Set<Goal>(['roam', 'flee', 'ambush', 'mischief']);
/** Facts too many to keep in SQL: the archive (and, for decisions, the aggregates) holds them. */
const ARCHIVE_ONLY: ReadonlySet<CityFact['type']> = new Set<CityFact['type']>(['frame', 'window', 'decision', 'goal-end']);

type Sample = [number, number, number, number, number, number];
/** ms, yaw, pitch (NaN: not known). */
type AimSample = [number, number, number];
/** ms, the move axes f and r, then jump presses and forward/back and left/right key changes within the slot. */
type ControlSample = [number, number, number, number, number, number];
interface Life { start: number; spawnPlace: string; lastPickup?: { kind: PickupKind; at: number }; lastHit?: { at: number; by?: string }; prev?: { x: number; z: number; at: number }; place?: string; carryStart?: number; shots: number[] }
/** A usable stocked supply a rat came within reach of: the site, and the nearest the rat has come (x, y, z, horizontal distance, health there). */
interface Approach { site: string; kind: PickupKind; sx: number; sy: number; sz: number; d: number; x: number; y: number; z: number; hp: number }
/** Humans, bots and agents are counted apart, so no human measure includes an agent. */
type Who = 'human' | 'bot' | 'agent';

/** Remaining milliseconds of each timed pickup a rat holds. */
function situationBuffs(b: PlayerBuffs | undefined, now: number): RatSituation['buffs'] {
  const out: RatSituation['buffs'] = {};
  for (const kind of TIMED_PICKUPS) { const until = b?.[BUFF_FIELD[kind]] ?? 0; if (until > now) out[kind] = until - now; }
  return out;
}

/** Counts under an aggregate key (day|build|layout|mode), then two labels: no key string is built per count. */
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
  'case-contact': 'ball-case-contact', 'world-bounce': 'ball-world-bounce', 'dispatch-contact': 'ball-dispatch-contact', 'pressure-contact': 'ball-pressure-contact',
  'trap-contact': 'ball-trap-contact', lifetime: 'ball-lifetime', capacity: 'ball-capacity', reset: 'ball-reset', rejected: 'ball-rejected' };
const SHOTS: Record<Who, string> = { human: 'shots-human', bot: 'shots-bot', agent: 'shots-agent' };
const HITS: Record<Who, string> = { human: 'hits-human', bot: 'hits-bot', agent: 'hits-agent' };
const BANK_HITS: Record<Who, string> = { human: 'bank-hits-human', bot: 'bank-hits-bot', agent: 'bank-hits-agent' };

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
  private readonly aimRings = new Map<string, AimSample[]>();
  /** Each human's latest camera look (unit vector) and when it arrived. */
  private readonly looks = new Map<string, { x: number; y: number; z: number; at: number }>();
  /** Each rat's controls since the last 20 Hz slot, and when they last arrived; the rings behind fight windows. */
  private readonly tallies = new Map<string, { tally: ControlTally; at: number }>();
  private readonly controlRings = new Map<string, ControlSample[]>();
  private aimAt = 0;
  private botShots = 0;
  private readonly windows: Array<{ ids: Set<string>; from: number; until: number }> = [];
  /** Wall bounces per live ball, so a hit knows whether it was banked. Bounded by the sim's ball cap. */
  private readonly bounces = new Map<string, number>();
  private readonly flights = new Map<string, { machine?: string; start: number; apex: number }>();
  private readonly seenLaunches = new Set<string>();
  private readonly anomalyAt = new Map<string, number>();
  private readonly cells = new Tally<number>();
  private readonly placeCounts = new Tally<string>();
  private readonly flows = new Map<string, number>();
  /** Jev room measures under `day|layout|mode|measure`. */
  private readonly mindCounts = new Map<string, number>();
  /** Each bot's open goal. */
  private readonly goals = new Map<string, OpenGoal>();
  private events: Array<{ t: number; round?: string; type: string; data: string }> = [];
  private readonly alive = new Map<string, boolean>();
  private readonly buffs = new Map<string, Record<TimedPickup, boolean>>();
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
  /** The primary case while loose: when and where it came loose (or appeared), its last point, path so far and the
   * balls (every rat's) that hit it; and the enemy balls the current carrier's grip has taken. */
  private loose: { since: number; x: number; y: number; z: number; lx: number; ly: number; lz: number; path: number; kicks: number } | null = null;
  private gripHits = 0;
  /** Heartbeat pings during the current carry, and the latest one counted (`CaseState.ping.at`). */
  private casePings = 0;
  private casePingAt = 0;
  private dispatchKey = '';
  /** The latest Most Wanted takedown recorded (`dispatch.bounty.at`). */
  private bountyAt = 0;
  private zoneKey = '';
  private scorer: string | null = null;
  private frameAt = 0;
  private sampleAt = 0;
  private flushedAt = 0;
  private started = false;
  /** The players and world of the latest tick, which decisions between ticks are measured against. */
  private seenPlayers?: ReadonlyMap<string, PlayerData>;
  private seenState?: ChaosState;
  /** Reused sight-line ends, so sight checks allocate nothing here. */
  private readonly eyeAt = { x: 0, y: 0, z: 0 };
  private readonly otherAt = { x: 0, y: 0, z: 0 };
  /** Each rat's open approaches to usable stocked supplies (`pickup-passed`). */
  private readonly approaches = new Map<string, Approach[]>();

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
      ...(this.roundId ? { round: this.roundId } : {}), layout: this.deps.layout(), schema: CITY_SCHEMA_VERSION, build: this.deps.build, mindVersion: MIND_VERSION, mode: this.mode,
      ...(this.incident ? { incident: this.incident } : {}), ...(codeOnlyRound(this.roundId) ? { codeOnly: true as const } : {}) };
  }
  /** Archive every fact; keep the discrete ones in SQL for 30 days too, except the bots' decisions and goal ends
   * (hundreds per bot-hour), which the aggregates and the archive hold. */
  private emit(fact: CityFact, archiveOnly = ARCHIVE_ONLY.has(fact.type)): void {
    this.deps.archive.push(fact, fact.t);
    if (!archiveOnly) this.events.push({ t: fact.t, round: fact.round, type: fact.type, data: JSON.stringify(fact) });
  }
  /** Aggregate key prefix, rebuilt only when the UTC day, layout or mode changes (it runs for every shot). */
  private keyCache = { dayStart: 0, dayEnd: -1, layout: -1, mode: '', key: '' };
  private key(now: number): string {
    const c = this.keyCache, layout = this.deps.layout();
    if (now < c.dayStart || now >= c.dayEnd || layout !== c.layout || this.mode !== c.mode) {
      const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
      this.keyCache = { dayStart, dayEnd: dayStart + 86_400_000, layout, mode: this.mode, key: `${heatDayKey(now)}|${this.deps.build}|${layout}|${this.mode}` };
    }
    return this.keyCache.key;
  }
  private count(map: Map<string, number>, key: string, n = 1): void { map.set(key, (map.get(key) ?? 0) + n); }
  private cell(now: number, layer: string, p: Vec3Data, n = 1): void {
    const c = heatCellIndex(p.x, p.y, p.z);
    if (c >= 0) this.cells.add(this.key(now), layer, c, n);
  }
  private measure(now: number, place: string, measure: string, n = 1): void { this.placeCounts.add(this.key(now), place, measure, n); }
  private who(id: string): Who { return this.deps.isBot(id) ? 'bot' : this.deps.isAgent?.(id) ? 'agent' : 'human'; }
  /** A fact's `human` flag, and `agent` for an agent. */
  private ratFlags(id: string): { human: boolean; agent?: true } {
    const who = this.who(id);
    return who === 'agent' ? { human: false, agent: true } : { human: who === 'human' };
  }
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
  shot(player: PlayerData, direction: Vec3Data, now: number, weapon?: WeaponKind): void {
    // Bots fire thousands of times an hour: their rate lives in the counts and situations, not one fact per shot.
    if (this.deps.isBot(player.id)) {
      const i = this.shotCount++, s = this.shotData;
      this.shotIds[i] = player.id; this.shotKeys[i] = this.key(now);
      s[i * 4] = now; s[i * 4 + 1] = player.x; s[i * 4 + 2] = player.y; s[i * 4 + 3] = player.z;
      if (this.shotCount === QUEUE_LIMIT) this.drain();
      // A sample kept as a fact (archive only), measured where everyone stands now; queued work drains first so facts keep their order.
      if (++this.botShots % BOT_SHOT_SAMPLE === 0) {
        this.drain();
        this.emit({ ...this.context(now), type: 'shot', a: this.actor(player.id), human: false, p: p3(player), place: this.places.at(player.x, player.y, player.z).id,
          dir: d3(direction), sample: BOT_SHOT_SAMPLE, targets: this.shotTargets(player, direction), ...(weapon ? { weapon } : {}) }, true);
      }
      return;
    }
    const life = this.life(player.id, now, player), place = this.places.at(player.x, player.y, player.z).id, who = this.who(player.id);
    const gap = life.shots.length ? now - life.shots[life.shots.length - 1]! : undefined;
    life.shots.push(now); if (life.shots.length > 40) life.shots.shift();
    this.ledger.shot(player.id);
    this.cell(now, SHOTS[who], player);
    this.measure(now, place, SHOTS[who]);
    this.emit({ ...this.context(now), type: 'shot', a: this.actor(player.id), human: who === 'human', ...(who === 'agent' ? { agent: true as const } : {}), p: p3(player), place,
      dir: d3(direction), ...(gap === undefined ? {} : { gapMs: gap }), targets: this.shotTargets(player, direction), ...(weapon ? { weapon } : {}) });
  }

  /** A human's camera look, sent with their movement. Only the aim rings read it. */
  aim(id: string, look: Vec3Data, now: number): void {
    const l = this.looks.get(id);
    if (l) { l.x = look.x; l.y = look.y; l.z = look.z; l.at = now; } else this.looks.set(id, { x: look.x, y: look.y, z: look.z, at: now });
  }

  /** A human's controls, tallied by their client since its previous send. Only the controls rings read them. */
  controls(id: string, input: ControlsInput, now: number): void {
    const t = this.tallyOf(id);
    t.tally.add(input); t.at = now;
  }

  /** A bot's controls this step, tallied here as a player's client tallies its own. Only the controls rings read them. */
  botControls(id: string, controls: RatControls, now: number): void {
    const t = this.tallyOf(id);
    t.tally.note(controls); t.at = now;
  }

  private tallyOf(id: string): { tally: ControlTally; at: number } {
    let t = this.tallies.get(id);
    if (!t) this.tallies.set(id, t = { tally: new ControlTally(), at: 0 });
    return t;
  }

  /** The rats in sight nearest a shot's line, from the shooter's eye: how far off it was, and whether it led a crossing rat. */
  private shotTargets(p: PlayerData, dir: Vec3Data): ShotTarget[] {
    const ex = p.x, ey = p.y + EYE, ez = p.z, dl = Math.hypot(dir.x, dir.y, dir.z) || 1, ux = dir.x / dl, uy = dir.y / dl, uz = dir.z / dl;
    const near: Array<{ id: string; x: number; y: number; z: number; d: number; e: number }> = [];
    for (const [id, o] of this.last) {
      if (id === p.id || o.hp <= 0) continue;
      const dx = o.x - ex, dy = o.y + CHEST - ey, dz = o.z - ez, d = Math.hypot(dx, dy, dz);
      if (d < 1 || d > SIGHT_RANGE) continue;
      const cos = (ux * dx + uy * dy + uz * dz) / d;
      if (cos > 0) near.push({ id, x: o.x, y: o.y, z: o.z, d, e: Math.acos(Math.min(1, cos)) });
    }
    near.sort((a, b) => a.e - b.e);
    const out: ShotTarget[] = [];
    for (const t of near) {
      if (out.length === SHOT_TARGETS) break;
      if (this.deps.sight && !this.deps.sight({ x: ex, y: ey, z: ez }, { x: t.x, y: t.y + 1, z: t.z })) continue;
      const hx = t.x - ex, hy = t.y + HEAD - ey, hz = t.z - ez, hd = Math.hypot(hx, hy, hz);
      const eh = Math.acos(Math.max(-1, Math.min(1, (ux * hx + uy * hy + uz * hz) / hd)));
      // The target's velocity from its last two 5 Hz samples, split into along and across the line of sight.
      const ring = this.rings.get(t.id), s1 = ring?.[ring.length - 1], s0 = ring?.[ring.length - 2], dt = s1 && s0 ? (s1[0] - s0[0]) / 1000 : 0;
      const lx = (t.x - ex) / t.d, ly = (t.y + CHEST - ey) / t.d, lz = (t.z - ez) / t.d;
      let lat = 0, lead: number | undefined;
      if (dt > 0) {
        const vx = (s1![1] - s0![1]) / dt, vy = (s1![2] - s0![2]) / dt, vz = (s1![3] - s0![3]) / dt, along = vx * lx + vy * ly + vz * lz;
        const cx = vx - lx * along, cy = vy - ly * along, cz = vz - lz * along;
        lat = Math.hypot(cx, cy, cz);
        if (lat >= .5) { const aim = ux * lx + uy * ly + uz * lz; lead = ((ux - lx * aim) * cx + (uy - ly * aim) * cy + (uz - lz * aim) * cz) / lat; }
      }
      out.push({ a: this.actor(t.id), d: Math.round(t.d * 10) / 10, e: round3(t.e), eh: round3(eh), lat: Math.round(lat * 10) / 10, ...(lead === undefined ? {} : { lead: round3(lead) }) });
    }
    return out;
  }

  balls(events: readonly ShotResultEvent[], now: number): void {
    if (!events.length) return;
    let shooters: number[] | undefined, fact = false;
    for (const e of events) {
      if (e.outcome === 'case-contact') { if (this.caseOwner) this.gripHits++; else if (this.loose) this.loose.kicks++; }
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
      if (e.kind === 'rewarded') {
        this.emit({ ...this.context(now), type: 'reward', a: this.actor(player.id), kind: e.pickup, why: e.why, p: p3(player), place: this.places.at(player.x, player.y, player.z).id });
        continue;
      }
      if (e.kind === 'trap') {
        const place = this.places.at(e.p.x, e.p.y, e.p.z).id;
        this.measure(now, place, `trap:${e.what}`);
        this.emit({ ...this.context(now), type: 'trap', what: e.what, a: this.actor(player.id), trap: e.trapId, p: p3(e.p), place,
          ...(e.victim ? { victim: this.actor(e.victim) } : {}), ...(e.by ? { by: this.actor(e.by) } : {}), ...(e.what === 'snap' ? { holdMs: WEAPON_TUNING.trapHoldMs } : {}) });
        continue;
      }
      const place = this.places.at(player.x, player.y, player.z).id, life = this.life(player.id, now, player);
      life.lastPickup = { kind: e.pickup, at: now };
      const restocked = this.siteRestockedAt.get(e.pickupId);
      this.cell(now, 'pickups', player);
      this.measure(now, place, `pickup:${e.pickup}`);
      this.emit({ ...this.context(now), type: 'pickup', a: this.actor(player.id), site: e.pickupId, kind: e.pickup, p: p3(player), place,
        hpBefore: this.last.get(player.id)?.hp ?? player.hp, ...(restocked === undefined ? {} : { waitedMs: now - restocked }), ...(e.faulty ? { faulty: true as const } : {}) });
      this.siteAvailable.set(e.pickupId, false);
      // Claimed, so not passed.
      const open = this.approaches.get(player.id);
      if (open) for (let i = open.length - 1; i >= 0; i--) if (open[i]!.site === e.pickupId) { open[i] = open[open.length - 1]!; open.length--; }
      this.reach(player, now, g => (g.goal === 'heal' || g.goal === 'arm-up') && g.site === e.pickupId);
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
      explosive: h.explosive, incoming: h.incoming, vp: p3(v), ...(dist === undefined ? {} : { dist }), hpAfter: v.hp, ...(h.weapon ? { weapon: h.weapon } : {}) });
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
      vp: p3(v), vplace: vPlace, ...(killer && dist !== undefined ? { dist } : {}), lifeMs: now - life.start, assists, ...(h.weapon ? { weapon: h.weapon } : {}), ...(h.environment ? { env: h.environment } : {}),
      ...(h.bounces ? { bounces: h.bounces } : {}) });
    this.alive.set(v.id, false);
    this.reach(killer, now, g => (g.goal === 'hunt' || g.goal === 'chase-carrier') && g.quarry === v.id);
    const open = this.goals.get(v.id);
    if (open) this.endGoal(v, open, 'died', now);
  }
  /** Code Violation malfunctions (`ChaosSimulation.drainIncidentEvents`). */
  incidents(events: readonly IncidentEvent[], players: ReadonlyMap<string, PlayerData>, now: number): void {
    for (const e of events) {
      const place = this.places.at(e.p.x, e.p.y, e.p.z).id;
      this.measure(now, place, `malfunction:${e.what}`);
      const victim = e.playerId ? players.get(e.playerId) : undefined;
      this.emit({ ...this.context(now), type: 'malfunction', what: e.what, site: e.site, p: p3(e.p), place, ...(victim ? { a: this.actor(victim.id) } : {}),
        ...(e.pickup ? { kind: e.pickup } : {}), shoved: e.shoved });
    }
  }

  clues(events:readonly import('../../shared/caseClues').ClueEvent[],now:number):void {
    for(const e of events){const place=this.places.at(e.p.x,e.p.y,e.p.z).id;
      this.measure(now,place,'clue:'+e.what);
      this.emit({...this.context(now),type:'clue',what:e.what,...(e.player?{a:this.actor(e.player)}:{}),p:[e.p.x,e.p.y,e.p.z],place,...(e.n!==undefined?{n:e.n}:{})});
    }
  }

  session(what: 'join' | 'leave' , id: string, now: number): void {
    this.emit({ ...this.context(now), type: 'session', what, a: this.actor(id), ...this.ratFlags(id) });
  }

  /** A player's client frame performance; a bot has no screen. */
  perf(id: string, report: PerfReport, now: number): void {
    if (!this.deps.isBot(id)) this.emit({ ...this.context(now), type: 'perf', a: this.actor(id), ...this.ratFlags(id), ...report });
  }

  /** A highlight marker the room sent (docs/replay/detection.md), counted per kind for the digest. */
  highlight(m: HighlightMarker, now: number): void {
    const [main, victim] = m.actors, place = this.places.at(m.p.x, m.p.y, m.p.z).id;
    this.measure(now, place, `highlight:${m.kind}`);
    this.emit({ ...this.context(now), type: 'highlight', kind: m.kind, a: this.actor(main!), ...(victim ? { victim: this.actor(victim) } : {}), p: p3(m.p), place, score: m.score });
  }

  /** A player's results board showed, played or saved an exhibit; an agent browser never counts as human. */
  exhibit(id: string, m: ExhibitMessage, now: number): void {
    this.emit({ ...this.context(now), type: 'exhibit', kind: m.kind, action: m.action, a: this.actor(id), ...this.ratFlags(id) });
  }

  /** A stuck bot is about to be moved to a spawn point: recorded where it was stuck. */
  rescue(p: PlayerData, now: number): void {
    const place = this.places.at(p.x, p.y, p.z).id;
    this.measure(now, place, 'rescues');
    this.emit({ ...this.context(now), type: 'rescue', a: this.actor(p.id), from: p3(p), place });
  }

  /** One of Tyler's admin commands (docs/live-service.md); `round` the room's round (the recorder may not have seen it
   * yet), `by` the admin's rat when it came from a game socket. */
  admin(fact: { command: Exclude<AdminCommandName, 'status'>; via: AdminVia; ok: boolean; next?: AssignmentId; roll?: IncidentId }, now: number, round?: string, by?: string, winner?: string): void {
    this.emit({ ...this.context(now), ...(round ? { round } : {}), type: 'admin', ...fact, ...(by ? { a: this.actor(by) } : {}), ...(winner ? { winner: this.actor(winner) } : {}) });
  }

  // ---- the minds (docs/bot-overhaul.md, B5) ----
  /** A bot's decision. Since L4 of the bot learning plan every `Decision` is a decision moment (an event, or the
   * 10 s hold running out; the goal is only refreshed in between), so each is recorded, keeping the same goal
   * or not: the open goal ends as replaced or failed when the goal changes. */
  decision(p: PlayerData, d: Decision, now: number, jev?: JevOutcome): void {
    const { plan, answer } = d, open = this.goals.get(p.id);
    if (open && (d.failed || open.goal !== plan.goal)) this.endGoal(p, open, d.failed ? 'failed' : 'replaced', now);
    const opening = !this.goals.has(p.id), place = this.places.at(p.x, p.y, p.z).id, mind = answer.source;
    const top = (Object.entries(d.weighted) as Array<[Goal, number]>).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([goal, weighted]): [Goal, number, number] => [goal, round2(answer.scores[goal] ?? 0), round2(weighted)]);
    this.measure(now, place, decideMeasure(mind, d.personality, plan.goal));
    const inputs = this.inputs(p);
    this.emit({ ...this.context(now), type: 'decision', a: this.actor(p.id), p: p3(p), place, mind, ...(d.personality ? { personality: d.personality } : {}), goal: plan.goal, motor: plan.mode,
      trigger: d.trigger, top, ...(answer.danger === undefined ? {} : { danger: round2(answer.danger) }), target: answer.target !== undefined,
      ...(d.failed ? { failed: true as const } : {}), ...(answer.jev ? { latencyMs: answer.jev.latencyMs, tokens: answer.jev.tokens } : {}),
      ...(jev && mind === 'code' ? { jev } : {}), ...(inputs ? { in: inputs } : {}), stance: d.stance });
    if (!opening) return;
    const quarry = plan.goal === 'hunt' ? plan.follow : plan.goal === 'chase-carrier' ? plan.follow ?? (this.caseOwner || undefined) : undefined;
    const to = plan.destination && PLACE_GOALS.has(plan.goal) ? plan.destination : undefined;
    this.goals.set(p.id, { goal: plan.goal, mode: plan.mode, mind, personality: d.personality, start: now, place, ...(quarry ? { quarry } : {}),
      ...(plan.mode === 'pickup' ? { site: plan.key.slice('pickup:'.length) } : {}), ...(to ? { to: { x: to.x, y: to.y, z: to.z } } : {}) });
  }

  /** What a deciding bot faces in the world of the room's latest tick; undefined before the recorder has seen one. */
  private inputs(p: PlayerData): DecisionInputs | undefined {
    const state = this.seenState, players = this.seenPlayers;
    if (!state || !players) return undefined;
    const owner = state.case.owner, carrier = owner ? players.get(owner) : undefined, c = carrier ?? state.case.p;
    const mine = Math.hypot(c.x - p.x, c.z - p.z), eye = this.eyeAt, other = this.otherAt;
    eye.x = p.x; eye.y = p.y + EYE; eye.z = p.z;
    let closer = true, seen = 0, rival: PlayerData | undefined, rivalD = Infinity;
    for (const o of players.values()) {
      if (o.id === p.id || o.hp <= 0) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < rivalD) { rivalD = d; rival = o; }
      if (Math.hypot(c.x - o.x, c.z - o.z) <= mine) closer = false;
      other.x = o.x; other.y = o.y + 1; other.z = o.z;
      if (Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) <= SIGHT_RANGE && (!this.deps.sight || this.deps.sight(eye, other))) seen++;
    }
    return { case: round1(mine), ...(carrier && owner !== p.id ? { carrier: round1(mine) } : {}), ...(rival ? { rival: round1(rivalD) } : {}), closer, hp: p.hp,
      ...(rival ? { rivalHp: rival.hp } : {}), seen, carrying: owner === p.id };
  }

  /** A window of the Jev mind while it was on: a `minds` fact and the room-wide measures. */
  minds(w: MindsWindow, now: number): void {
    const key = this.key(now), s = w.stats;
    const add = (measure: string, n: number) => { if (n) this.count(this.mindCounts, `${key}|${measure}`, n); };
    const counts: Record<typeof JEV_COUNTS[number], number> = { decisions: s.decisions, requests: s.requests, answers: s.answers, failures: s.failures,
      stale: s.staleDrops, fallbacks: s.fallbacks, throttled: s.throttled, tokens: s.tokens };
    for (const measure of JEV_COUNTS) add(measure, counts[measure]);
    add('on-ms', w.ms); add('microdollars', Math.round(s.dollars * 1e6));
    const hist: Record<string, number> = {};
    for (const ms of w.latencies) { const bucket = latencyBucket(ms); hist[bucket] = (hist[bucket] ?? 0) + 1; }
    for (const [bucket, n] of Object.entries(hist)) add(`latency:${bucket}`, n);
    this.emit({ ...this.context(now), type: 'minds', ms: w.ms, ...s, dollars: Math.round(s.dollars * 1e6) / 1e6,
      ...(w.p50 === undefined ? {} : { p50: w.p50 }), ...(w.p90 === undefined ? {} : { p90: w.p90 }), hist });
  }

  private endGoal(p: PlayerData, open: OpenGoal, outcome: GoalOutcome, now: number): void {
    this.goals.delete(p.id);
    this.measure(now, open.place, goalMeasure(open.mind, open.personality, open.goal, outcome));
    this.emit({ ...this.context(now), type: 'goal-end', a: this.actor(p.id), goal: open.goal, motor: open.mode, mind: open.mind, ...(open.personality ? { personality: open.personality } : {}),
      outcome, durationMs: now - open.start, from: open.place, p: p3(p), place: this.places.at(p.x, p.y, p.z).id });
  }
  /** `p` did what its open goal is for, when `does` says so. */
  private reach(p: PlayerData | undefined, now: number, does: (goal: OpenGoal) => boolean): void {
    const open = p && this.goals.get(p.id);
    if (p && open && does(open)) this.endGoal(p, open, 'reached', now);
  }

  // ---- the room tick ----
  /** Each rat's position and health at the previous tick (hooks run before this tick's). */
  private readonly last = new Map<string, { x: number; y: number; z: number; hp: number }>();

  tick(now: number, players: ReadonlyMap<string, PlayerData>, state: ChaosState | undefined, round: RoundState): void {
    // Frames read the queued shots (fire rate, K/D/A) and a new round resets the ledger.
    const a = state?.assignment;
    if (now >= this.frameAt || a && a.roundId !== this.roundId || round.phase !== this.phase) this.drain();
    this.watchRound(now, players, state, round);
    this.seenPlayers = players; this.seenState = state;
    for (const p of players.values()) {
      const last = this.last.get(p.id);
      if (last) { last.x = p.x; last.y = p.y; last.z = p.z; last.hp = p.hp; } else this.last.set(p.id, { x: p.x, y: p.y, z: p.z, hp: p.hp });
    }
    // 20 Hz aim: a human's camera look while fresh, otherwise (and for every bot) the body's facing with no pitch.
    // 20 Hz controls: the latest axes and the presses and key changes since the last slot, while fresh.
    if (now >= this.aimAt) {
      this.aimAt = now + AIM_MS;
      for (const p of players.values()) {
        const t = this.tallies.get(p.id);
        if (p.hp <= 0) { t?.tally.clear(); continue; }
        let ring = this.aimRings.get(p.id);
        if (!ring) this.aimRings.set(p.id, ring = []);
        const s: AimSample = ring.length >= AIM_RING ? ring.shift()! : [0, 0, 0], look = this.looks.get(p.id);
        const fresh = !!look && now - look.at <= AIM_FRESH_MS;
        s[0] = now; s[1] = round3(fresh ? Math.atan2(look!.x, look!.z) : yaw(p)); s[2] = fresh ? round3(Math.asin(Math.max(-1, Math.min(1, look!.y)))) : NaN;
        ring.push(s);
        if (!t) continue;
        if (now - t.at <= CONTROLS_FRESH_MS) {
          let controls = this.controlRings.get(p.id);
          if (!controls) this.controlRings.set(p.id, controls = []);
          const c: ControlSample = controls.length >= AIM_RING ? controls.shift()! : [0, 0, 0, 0, 0, 0], k = t.tally;
          c[0] = now; c[1] = k.f; c[2] = k.r; c[3] = k.j; c[4] = k.fx; c[5] = k.rx;
          controls.push(c);
        }
        t.tally.clear();
      }
    }
    if (now >= this.sampleAt) {
      this.sampleAt = now + SAMPLE_MS;
      this.sample(now, players);
      if (state) this.watchWorld(now, players, state);
      if (state && round.phase === 'playing') this.passing(now, players, state); else this.approaches.clear();
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
      // Actors are per round: a goal open when the round changed ends unrecorded.
      this.goals.clear(); this.approaches.clear(); this.loose = null; this.gripHits = 0; this.casePings = 0;
      this.emit({ ...this.context(now), type: 'round', what: 'start', ...this.census(players) });
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
      ...(this.liveAt !== undefined ? { durationMs: now - this.liveAt } : {}), ...this.census(players),
      standings: ids.map(id => ({ a: this.actor(id), ...this.ratFlags(id), standing: table.get(id)!, kda: this.ledger.kda(id) })) });
  }

  /** Rats present by kind, for round and world facts; `agents` only when there are any. */
  private census(players: ReadonlyMap<string, PlayerData>): { humans: number; bots: number; agents?: number } {
    let humans = 0, bots = 0, agents = 0;
    for (const id of players.keys()) { const who = this.who(id); if (who === 'bot') bots++; else if (who === 'agent') agents++; else humans++; }
    return { humans, bots, ...(agents ? { agents } : {}) };
  }

  private standingsFor(ids: string[], players: ReadonlyMap<string, PlayerData>, state: ChaosState | undefined) {
    return standings(ids, { ...(state?.assignment ? { assignment: state.assignment } : {}),
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
      const to = this.goals.get(p.id)?.to;
      if (to && Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z) < ARRIVED) this.reach(p, now, () => true);
    }
    this.started = true;
    for (let i = this.windows.length - 1; i >= 0; i--) {
      const w = this.windows[i]!;
      if (now < w.until) continue;
      this.windows.splice(i, 1);
      const samples: Record<string, Sample[]> = {}, aim: Record<string, Array<[number, number, number | null]>> = {}, controls: Record<string, ControlSample[]> = {};
      for (const id of w.ids) {
        const a = String(this.actor(id));
        samples[a] = (this.rings.get(id) ?? []).filter(s => s[0] >= w.from && s[0] <= w.until).map(s => [s[0] - w.from, s[1], s[2], s[3], s[4], s[5]]);
        aim[a] = (this.aimRings.get(id) ?? []).filter(s => s[0] >= w.from && s[0] <= w.until).map(s => [s[0] - w.from, s[1], Number.isNaN(s[2]) ? null : s[2]]);
        const pressed = (this.controlRings.get(id) ?? []).filter(s => s[0] >= w.from && s[0] <= w.until).map((s): ControlSample => [s[0] - w.from, s[1], s[2], s[3], s[4], s[5]]);
        if (pressed.length) controls[a] = pressed;
      }
      this.emit({ ...this.context(w.from), type: 'window', reason: 'damage', from: w.from, to: w.until, samples, aim, controls });
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
    const c = state.case, owner = c.owner, returning = c.returningUntil > now, a = state.assignment;
    // A loose case's path: a step over 25 units is a relocation, not travel.
    if (!owner && !returning) {
      const l = this.loose;
      if (!l) this.loose = { since: now, x: c.p.x, y: c.p.y, z: c.p.z, lx: c.p.x, ly: c.p.y, lz: c.p.z, path: 0, kicks: 0 };
      else { const step = Math.hypot(c.p.x - l.lx, c.p.y - l.ly, c.p.z - l.lz); if (step < 25) l.path += step; l.lx = c.p.x; l.ly = c.p.y; l.lz = c.p.z; }
    }
    const looseSpell = () => { const l = this.loose; this.loose = null;
      return l ? { looseMs: now - l.since, path: round1(l.path), moved: round1(Math.hypot(c.p.x - l.x, c.p.y - l.y, c.p.z - l.z)), kicks: l.kicks } : {}; };
    if (owner !== this.caseOwner) {
      const place = this.places.at(c.p.x, c.p.y, c.p.z).id, prev = this.caseOwner;
      const prevLife = prev ? this.lives.get(prev) : undefined, carryMs = prevLife?.carryStart !== undefined ? now - prevLife.carryStart : undefined;
      if (prev && prevLife) delete prevLife.carryStart;
      if (owner) {
        this.drain();
        this.life(owner, now, players.get(owner)).carryStart = now;
        const stolen = prev !== null;
        this.measure(now, place, stolen ? 'case-steal' : 'case-take');
        this.emit({ ...this.context(now), type: 'case', what: stolen ? 'steal' : 'take', a: this.actor(owner), ...(prev ? { from: this.actor(prev), pings: this.casePings } : {}), p: p3(c.p), place, ...(carryMs === undefined ? {} : { carryMs }), ...(stolen ? {} : looseSpell()) });
        this.reach(players.get(owner), now, g => g.goal === 'take-case' || g.goal === 'chase-carrier' && g.quarry === prev);
      } else if (prev) {
        this.measure(now, place, 'case-drop');
        const carrier = players.get(prev), cause = !carrier ? 'left' : carrier.hp <= 0 ? 'death' : a && a.deliverySerial !== this.deliverySerial ? 'delivered' : 'shot';
        this.emit({ ...this.context(now), type: 'case', what: 'drop', a: this.actor(prev), p: p3(c.p), place, ...(carryMs === undefined ? {} : { carryMs }), cause, gripHits: this.gripHits, pings: this.casePings });
      }
      this.gripHits = 0; this.casePings = 0;
      this.caseOwner = owner; this.caseChangeAt = now;
    }
    if (owner && c.ping && c.ping.at !== this.casePingAt) { this.casePingAt = c.ping.at; this.casePings++; }
    if (returning && !this.caseReturning) this.emit({ ...this.context(now), type: 'case', what: 'respawn', p: p3(c.p), place: this.places.at(c.p.x, c.p.y, c.p.z).id, ...looseSpell() });
    this.caseReturning = returning;

    if (a && a.deliverySerial !== this.deliverySerial) {
      const by = a.lastDelivery?.playerId, p = by ? players.get(by) : undefined;
      if (by && p && this.deliverySerial >= 0) {
        const place = this.places.at(p.x, p.y, p.z).id;
        this.measure(now, place, 'deliveries');
        this.emit({ ...this.context(now), type: 'case', what: 'deliver', a: this.actor(by), p: p3(p), place });
        this.reach(p, now, g => g.goal === 'keep-case');
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
      if (d.phase === 'rolling') this.reach(caller, now, g => g.goal === 'mischief');
    }
    const bounty = d.bounty, hunter = bounty && bounty.at !== this.bountyAt ? players.get(bounty.hunter) : undefined;
    if (bounty) this.bountyAt = bounty.at;
    if (bounty && hunter) this.emit({ ...this.context(now), type: 'bounty', a: this.actor(hunter.id), victim: this.actor(bounty.target), kind: bounty.pickup, p: p3(hunter), place: this.places.at(hunter.x, hunter.y, hunter.z).id });
    const j = a?.jurisdiction;
    if (j) {
      const zone = activeZone(j), zoneKey = `${j.serial}:${zone}`;
      if (zoneKey !== this.zoneKey) { this.emit({ ...this.context(now), type: 'zone', what: 'activate', zone }); this.zoneKey = zoneKey; }
      if (j.scorerId !== this.scorer) {
        if (j.scorerId) {
          this.emit({ ...this.context(now), type: 'zone', what: 'scorer', zone, scorer: this.actor(j.scorerId) });
          this.reach(players.get(j.scorerId), now, g => g.goal === 'keep-case');
        }
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
    for (const shove of state.pressure?.shoves ?? []) {
      if (this.seenLaunches.has(shove.id)) continue;
      this.seenLaunches.add(shove.id);
      if (this.seenLaunches.size > 256) this.seenLaunches.delete(this.seenLaunches.values().next().value!);
      const cause = shove.id.slice(0, shove.id.indexOf('-')), p = players.get(shove.playerId);
      if (!p || cause === 'pull') continue;
      this.emit({ ...this.context(now), type: 'shove', a: this.actor(p.id), cause, speed: Math.round(Math.hypot(shove.velocity.x, shove.velocity.z) * 10) / 10, p: p3(p), place: this.places.at(p.x, p.y, p.z).id });
    }
    for (const site of state.pickups ?? []) {
      const available = site.availableAt === undefined || site.availableAt <= now;
      const was = this.siteAvailable.get(site.id);
      if (available && was === false) { this.siteRestockedAt.set(site.id, now); this.emit({ ...this.context(now), type: 'restock', site: site.id, kind: site.kind }); }
      if (available && was === undefined) this.siteRestockedAt.set(site.id, now);
      if (available !== was) this.siteAvailable.set(site.id, available);
    }
    for (const p of players.values()) {
      const b = state.buffs?.[p.id], was = this.buffs.get(p.id) ?? { ironclad: false, hustle: false, stakeout: false }, seen = this.buffs.has(p.id);
      for (const kind of TIMED_PICKUPS) {
        const on = (b?.[BUFF_FIELD[kind]] ?? 0) > now;
        if (seen && was[kind] && !on) this.emit({ ...this.context(now), type: 'buff-end', a: this.actor(p.id), buff: kind });
        was[kind] = on;
      }
      if (!seen) this.buffs.set(p.id, was);
    }
  }

  /** 5 Hz: supplies each connected rat comes within reach of and goes past (`pickup-passed`). A usable stocked supply
   * within `PASS_REACH` on the rat's floor, in clear sight, opens an approach (sight is checked only then); the approach
   * closes unrecorded if the rat claims the supply or it stops being stocked, and records one fact once the rat is
   * `PASS_LEAVE` away, on another floor, or dead. Nothing is allocated unless an approach opens or a fact is made. */
  private passing(now: number, players: ReadonlyMap<string, PlayerData>, state: ChaosState): void {
    const sites = state.pickups;
    if (this.approaches.size > players.size) for (const id of this.approaches.keys()) if (!players.has(id)) this.approaches.delete(id);
    for (const p of players.values()) {
      if (!this.deps.connected(p.id)) continue;
      let open = this.approaches.get(p.id);
      if (open) for (let i = open.length - 1; i >= 0; i--) {
        const a = open[i]!, d = Math.hypot(p.x - a.sx, p.z - a.sz), stocked = this.siteAvailable.get(a.site) !== false;
        const gone = p.hp <= 0 || d > PASS_LEAVE || Math.abs(p.y - a.sy) > PASS_OFF_FLOOR;
        if (stocked && !gone) { if (d < a.d) { a.d = d; a.x = p.x; a.y = p.y; a.z = p.z; a.hp = p.hp; } continue; }
        if (stocked) this.passed(p, a, now);
        open[i] = open[open.length - 1]!; open.length--;
      }
      if (p.hp <= 0 || !sites) continue;
      for (const s of sites) {
        if (s.availableAt !== undefined && s.availableAt > now || s.kind === 'quick-fix' && p.hp >= MAX_HP || Math.abs(p.y - s.y) > PASS_FLOOR) continue;
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d > PASS_REACH) continue;
        let tracked = false;
        if (open) for (const a of open) if (a.site === s.id) { tracked = true; break; }
        if (tracked) continue;
        const eye = this.eyeAt, at = this.otherAt;
        eye.x = p.x; eye.y = p.y + EYE; eye.z = p.z; at.x = s.x; at.y = s.y + .5; at.z = s.z;
        if (this.deps.sight && !this.deps.sight(eye, at)) continue;
        if (!open) this.approaches.set(p.id, open = []);
        open.push({ site: s.id, kind: s.kind, sx: s.x, sy: s.y, sz: s.z, d, x: p.x, y: p.y, z: p.z, hp: p.hp });
      }
    }
  }
  private passed(p: PlayerData, a: Approach, now: number): void {
    const place = this.places.at(a.x, a.y, a.z).id;
    this.measure(now, place, PASSED[a.kind]);
    this.emit({ ...this.context(now), type: 'pickup-passed', a: this.actor(p.id), site: a.site, kind: a.kind, dist: round1(a.d), p: [round1(a.x), round1(a.y), round1(a.z)], place, hp: a.hp });
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
      const b = state.buffs?.[p.id], carrying = state.case.owner === p.id, weapon = entryWeapon(b, now);
      let visible = 0, nearest: number | undefined, nearestVisible: number | undefined;
      for (const o of players.values()) {
        if (o.id === p.id || o.hp <= 0 || !alive) continue;
        const dist = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z);
        nearest = Math.min(nearest ?? Infinity, dist);
        if (dist <= SIGHT_RANGE && (!this.deps.sight || this.deps.sight({ x: p.x, y: p.y + 1.5, z: p.z }, { x: o.x, y: o.y + 1, z: o.z }))) { visible++; nearestVisible = Math.min(nearestVisible ?? Infinity, dist); }
      }
      life.shots = life.shots.filter(t => now - t <= 10_000);
      const lastShot = life.shots[life.shots.length - 1];
      // The view rotation carries no pitch; a human's fresh camera look does.
      const look = this.looks.get(p.id), lookPitch = look && now - look.at <= AIM_FRESH_MS ? Math.asin(Math.max(-1, Math.min(1, look.y))) : pitch(p);
      rats.push({ a: this.actor(p.id), human: who === 'human', ...(who === 'agent' ? { agent: true as const } : {}), p: p3(p), floor: cityFloor(p.y), place: place.id, v,
        yaw: round2(yaw(p)), pitch: round2(lookPitch),
        hp: p.hp, alive, ...(p.respawnAt !== undefined && !alive ? { respawnIn: Math.max(0, p.respawnAt - now) } : {}), lifeMs: now - life.start,
        buffs: situationBuffs(b, now), ...(weapon ? { weapon } : {}),
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
      ...this.census(players),
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
    const prefix = (key: string) => { const [day, build, layout, mode] = key.split('|') as [string, string, string, string]; return [day, build, Number(layout), mode] as const; };
    for (const [key, layers] of this.cells.buckets) { const [day, build, layout, mode] = prefix(key); for (const [layer, counts] of layers) for (const [cell, n] of counts) this.deps.store.addCell(day, build, layout, mode, layer, heatCellKey(cell), n); }
    for (const [key, places] of this.placeCounts.buckets) { const [day, build, layout, mode] = prefix(key); for (const [place, counts] of places) for (const [measure, n] of counts) this.deps.store.addPlace(day, build, layout, mode, place, measure, n); }
    for (const [key, n] of this.flows) { const [day, build, layout, mode, src, dst, who] = key.split('|') as [string, string, string, string, string, string, string]; this.deps.store.addFlow(day, build, Number(layout), mode, src, dst, who, n); }
    for (const [key, n] of this.mindCounts) { const [day, build, layout, mode, measure] = key.split('|') as [string, string, string, string, string]; this.deps.store.addMind(day, build, Number(layout), mode, measure, n); }
    for (const e of this.events) this.deps.store.addEvent(e.t, e.round, e.type, e.data);
    // Before the clears: a failed commit writes nothing and these counts are added again at the next flush.
    this.deps.store.commit();
    this.cells.clear(); this.placeCounts.clear(); this.flows.clear(); this.mindCounts.clear(); this.events = [];
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
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** A direction to 0.001: `p3`'s 0.1 would blur aim by several degrees. */
const d3 = (v: Vec3Data): [number, number, number] => [round3(v.x), round3(v.y), round3(v.z)];
