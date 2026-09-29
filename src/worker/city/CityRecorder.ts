import type { ChaosState } from '../../shared/chaosState';
import type { PlayerData, RoundState, Vec3Data } from '../../shared/networkProtocol';
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
import { heatCell, heatDayKey } from '../HeatMap';
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
const SIGHT_RANGE = 60;
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

export class CityRecorder {
  private readonly places = cityPlaces();
  private readonly ledger = new RoundLedger();
  private readonly actors = new Map<string, number>();
  private readonly lives = new Map<string, Life>();
  private readonly rings = new Map<string, Sample[]>();
  private readonly windows: Array<{ ids: Set<string>; from: number; until: number }> = [];
  private readonly flights = new Map<string, { machine?: string; start: number; apex: number }>();
  private readonly seenLaunches = new Set<string>();
  private readonly anomalyAt = new Map<string, number>();
  private readonly cells = new Map<string, number>();
  private readonly placeCounts = new Map<string, number>();
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

  constructor(private readonly deps: RecorderDeps) {}

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
    const c = heatCell(p.x, p.y, p.z);
    if (c) this.count(this.cells, `${this.key(now)}|${layer}|${c}`, n);
  }
  private measure(now: number, place: string, measure: string, n = 1): void { this.count(this.placeCounts, `${this.key(now)}|${place}|${measure}`, n); }
  private who(id: string): 'human' | 'bot' { return this.deps.isBot(id) ? 'bot' : 'human'; }
  private life(id: string, now: number, p?: Vec3Data): Life {
    let l = this.lives.get(id);
    if (!l) { l = { start: now, spawnPlace: p ? this.places.at(p.x, p.y, p.z).id : 'outside', shots: [] }; this.lives.set(id, l); }
    return l;
  }

  // ---- hooks from the room ----
  shot(player: PlayerData, direction: Vec3Data, now: number): void {
    const life = this.life(player.id, now, player), human = !this.deps.isBot(player.id), place = this.places.at(player.x, player.y, player.z).id;
    const gap = life.shots.length ? now - life.shots[life.shots.length - 1]! : undefined;
    life.shots.push(now); if (life.shots.length > 40) life.shots.shift();
    this.ledger.shot(player.id);
    this.cell(now, `shots-${this.who(player.id)}`, player);
    this.measure(now, place, `shots-${this.who(player.id)}`);
    // Bots fire thousands of times an hour: their rate lives in the counts and situations, not one fact per shot.
    if (!human) return;
    this.emit({ ...this.context(now), type: 'shot', a: this.actor(player.id), human, p: p3(player), place, dir: p3(direction), ...(gap === undefined ? {} : { gapMs: gap }) });
  }

  balls(events: readonly ShotResultEvent[], now: number): void {
    for (const e of events) {
      if (e.outcome === 'first-step') continue;
      const at = e.point ?? e.end;
      if (e.owner && (e.outcome === 'rat-body' || e.outcome === 'rat-head')) {
        this.ledger.hit(e.owner, e.outcome === 'rat-head');
        const shooter = this.lastPosition(e.owner);
        if (shooter) this.measure(now, this.places.at(shooter.x, shooter.y, shooter.z).id, `hits-${this.who(e.owner)}`);
      }
      if (at) this.cell(now, `ball-${e.outcome}`, at);
      // World bounces and bots' balls only matter in aggregate; a human's ball ends are facts.
      if (e.outcome === 'world-bounce' || !e.owner || this.deps.isBot(e.owner)) continue;
      const place = at ? this.places.at(at.x, at.y, at.z).id : undefined;
      this.emit({ ...this.context(now), type: 'ball', ...(e.owner ? { a: this.actor(e.owner) } : {}), outcome: e.outcome,
        ...(at ? { p: p3(at), place } : {}), ...(e.victimId ? { victim: this.actor(e.victimId) } : {}) });
    }
  }

  pickups(events: readonly PickupEvent[], players: ReadonlyMap<string, PlayerData>, now: number): void {
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
        hpBefore: this.lastHp.get(player.id) ?? player.hp, ...(restocked === undefined ? {} : { waitedMs: now - restocked }) });
      this.siteAvailable.set(e.pickupId, false);
    }
  }

  hit(h: HitRecord, now: number): void {
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
    const cause = h.incoming ? 'missile' : h.explosive ? 'explosion' : !killer && !a ? 'city' : h.headshot ? 'headshot' : 'shot';
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
  private readonly lastHp = new Map<string, number>();
  private readonly lastPos = new Map<string, Vec3Data>();
  private lastPosition(id: string): Vec3Data | undefined { return this.lastPos.get(id); }

  tick(now: number, players: ReadonlyMap<string, PlayerData>, state: ChaosState | undefined, round: RoundState): void {
    this.watchRound(now, players, state, round);
    for (const p of players.values()) { this.lastHp.set(p.id, p.hp); this.lastPos.set(p.id, { x: p.x, y: p.y, z: p.z }); }
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
      const ring = this.rings.get(p.id) ?? [];
      ring.push([now, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10, Math.round(yaw(p) * 100) / 100, p.hp]);
      if (ring.length > RING) ring.shift();
      this.rings.set(p.id, ring);
      // A rat already alive when the recorder starts (after an eviction) did not just spawn.
      const wasAlive = this.alive.get(p.id);
      if (p.hp > 0 && (wasAlive === false || wasAlive === undefined && this.started)) this.spawn(p, players, now);
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
    const place = this.places.at(p.x, p.y, p.z).id, clip = this.inside(p);
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
      this.siteAvailable.set(site.id, available);
    }
    for (const p of players.values()) {
      const b = state.buffs?.[p.id], on = { ironclad: (b?.ironcladUntil ?? 0) > now, hustle: (b?.hustleUntil ?? 0) > now }, was = this.buffs.get(p.id);
      if (was) for (const buff of ['ironclad', 'hustle'] as const) if (was[buff] && !on[buff]) this.emit({ ...this.context(now), type: 'buff-end', a: this.actor(p.id), buff });
      this.buffs.set(p.id, on);
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
      let visible = 0, nearest: number | undefined;
      for (const o of players.values()) {
        if (o.id === p.id || o.hp <= 0 || !alive) continue;
        const dist = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z);
        nearest = Math.min(nearest ?? Infinity, dist);
        if (dist <= SIGHT_RANGE && (!this.deps.sight || this.deps.sight({ x: p.x, y: p.y + 1.5, z: p.z }, { x: o.x, y: o.y + 1, z: o.z }))) visible++;
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
        danger: { visible, ...(nearest === undefined ? {} : { nearest: round1(nearest) }),
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
      : this.inside(p) ? 'inside-geometry' : undefined;
    if (!what) return;
    const key = `${p.id}:${what}`;
    if (now - (this.anomalyAt.get(key) ?? -Infinity) < ANOMALY_COOLDOWN_MS) return;
    this.anomalyAt.set(key, now);
    const place = this.places.at(p.x, p.y, p.z).id;
    this.cell(now, 'anomalies', p); this.measure(now, place, `anomaly:${what}`);
    this.emit({ ...this.context(now), type: 'anomaly', what, a: this.actor(p.id), p: p3(p), place });
  }

  /** The rat's body centre is well inside a solid box. */
  private inside(p: Vec3Data): boolean {
    const y = p.y + .5;
    return this.deps.solids.some(b => Math.abs(p.x - b.x) < b.w / 2 - .25 && Math.abs(p.z - b.z) < b.d / 2 - .25 && Math.abs(y - b.y) < b.h / 2 - .25);
  }

  /** Resolves once every archive write started so far has finished. */
  settled(): Promise<void> { return this.deps.archive.settled(); }

  /** Aggregates go to SQL; the archive buffer goes to R2 when due. */
  flush(now: number, archive = false): void {
    this.flushedAt = now;
    const split = (key: string) => key.split('|');
    for (const [key, n] of this.cells) { const [day, layout, mode, layer, cell] = split(key) as [string, string, string, string, string]; this.deps.store.addCell(day, Number(layout), mode, layer, cell, n); }
    for (const [key, n] of this.placeCounts) { const [day, layout, mode, place, measure] = split(key) as [string, string, string, string, string]; this.deps.store.addPlace(day, Number(layout), mode, place, measure, n); }
    for (const [key, n] of this.flows) { const [day, layout, mode, src, dst, who] = split(key) as [string, string, string, string, string, string]; this.deps.store.addFlow(day, Number(layout), mode, src, dst, who, n); }
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
