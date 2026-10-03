import { HIGHLIGHT_TUNING as H, MAX_HIGHLIGHT_ACTORS, type HighlightKind, type HighlightMarker } from '../shared/highlights';
import { activeDestination, ASSIGNMENT_DESTINATIONS, type AssignmentState } from '../shared/assignments';
import { activeZone, JURISDICTION_TUNING } from '../shared/jurisdiction';
import { zoneContains } from '../shared/jurisdictionZones';
import type { EnvironmentCause, Vec3Data } from '../shared/networkProtocol';
import type { WeaponKind } from '../shared/pickups';

/** A rat as the detector reads it (`PlayerData` fits). */
export interface HighlightRat { id: string; x: number; y: number; z: number; hp: number }

/** One applied hit as the room resolved it (`GameRoom.handleHit`), after the damage. `attacker`: the credited rat, absent
 * for the city's hits. The flags describe the moment of the hit: `carrier` the victim held the case, `victimTrapped` a
 * Mousetrap held it, `*Airborne` riding a launcher throw. `assignment`: the round's objective at the hit. The rest are
 * `ChaosHit`'s highlight details. */
export interface HighlightHit {
  at: number;
  attacker?: HighlightRat;
  victim: HighlightRat;
  killed: boolean;
  headshot?: boolean;
  weapon?: WeaponKind;
  environment?: EnvironmentCause;
  bounces?: number;
  squashAirMs?: number;
  corpse?: boolean;
  reflections?: number;
  attackerAirborne?: boolean;
  victimAirborne?: boolean;
  victimTrapped?: boolean;
  carrier?: boolean;
  assignment?: AssignmentState;
}

export interface HighlightDeps {
  /** Every marker to every player; a growing multi-kill or pileup is sent again under the same id. */
  send(marker: HighlightMarker): void;
  /** Once per moment, with its final score (the city fact). */
  record(marker: HighlightMarker): void;
  /** Not a managed bot and not an agent browser. */
  isHuman(id: string): boolean;
  /** Where the newest corpse of a rat is, while it lasts (`ChaosSimulation.corpseAt`). */
  corpseAt(victimId: string): Vec3Data | undefined;
}

type Qualifier = { kind: HighlightKind; bonus: number };
type Moment = { kind: HighlightKind; at: number; actors: string[]; p: Vec3Data; bonus: number; extra?: Qualifier[]; leadMs?: number; trailMs?: number };
type PendingKill = { hit: HighlightHit; actors: string[]; p: Vec3Data; qualifiers: Qualifier[]; leadMs?: number; start?: Vec3Data; travel: number; rise: number };
type Member = { at: number; victim: string; killer?: string; p: Vec3Data };
type Burst = { id: string; kind: 'multi-kill' | 'pileup'; first: number; last: number; members: Member[]; killer?: string; p: Vec3Data;
  dirty: boolean; rarity?: number; sent?: HighlightMarker };

const dist = (a: Vec3Data, b: Vec3Data) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const at3 = (r: Vec3Data): Vec3Data => ({ x: r.x, y: r.y, z: r.z });

/** How near a carrier at `p` stood to scoring: units from the PAPER CHASE drop-off's building, or how much of its
 * Jurisdiction hold it still needed while standing in the active zone. */
export function objectiveGap(assignment: AssignmentState | undefined, id: string, p: Vec3Data): { dropoff?: number; zoneLeftMs?: number } {
  if (!assignment || assignment.phase !== 'active') return {};
  const destination = activeDestination(assignment);
  if (destination) {
    const b = ASSIGNMENT_DESTINATIONS[destination].bounds;
    return { dropoff: Math.hypot(Math.max(b.xmin - p.x, 0, p.x - b.xmax), Math.max(b.ymin - p.y, 0, p.y - b.ymax), Math.max(b.zmin - p.z, 0, p.z - b.zmax)) };
  }
  const j = assignment.jurisdiction;
  if (j && zoneContains(activeZone(j), p)) return { zoneLeftMs: JURISDICTION_TUNING.targetMs - (j.heldMs[id] ?? 0) };
  return {};
}

/** The server's highlight detector (docs/replay/detection.md): the room feeds it applied hits, Quick Fixes, dud supplies
 * and each tick's world; it sends a marker for every moment over the score floor and records each once. One per room,
 * reset each round. A kill waits `sentFlyingMs` so its body's flight can count, and is one moment: its best kind, the
 * others adding to its score. */
export class HighlightDetector {
  private serial = 0;
  private readonly prefix = crypto.randomUUID().slice(0, 8);
  private readonly seen = new Map<HighlightKind, number>();
  private readonly alive = new Map<string, boolean>();
  private readonly spawnedAt = new Map<string, number>();
  private readonly quickFixAt = new Map<string, number>();
  private pending: PendingKill[] = [];
  private deaths: Array<Member & { piled: boolean }> = [];
  private bursts: Burst[] = [];
  private readonly streaks = new Map<string, Burst>();
  private started = false;
  private closed = false;
  /** The primary case: its holder, the last rat to lose it and when, and each rat's open steal. */
  private holder: string | null = null;
  private lost: { id: string; at: number } | null = null;
  private readonly steals = new Map<string, { from: string; at: number }>();
  private deliverySerial = -1;
  private caseKills: Record<string, number> = {};
  private scorer: string | null = null;
  /** The assignment revision last read: scores only change with it. */
  private revision = -1;

  constructor(private readonly deps: HighlightDeps) {}

  /** A new round: every count, streak and open moment starts over (a rat alive now has just spawned). */
  reset(): void {
    this.seen.clear(); this.alive.clear(); this.spawnedAt.clear(); this.quickFixAt.clear();
    this.pending = []; this.deaths = []; this.bursts = []; this.streaks.clear();
    this.closed = false; this.holder = null; this.lost = null; this.steals.clear();
    this.deliverySerial = -1; this.caseKills = {}; this.scorer = null; this.revision = -1;
  }

  /** A Quick Fix taken (site or reward). */
  quickFix(id: string, at: number): void { this.quickFixAt.set(id, at); }

  /** Code Violation: a claimed supply came out as its dud on `rat` (`shoved`: the dud threw it). */
  backfire(rat: HighlightRat, shoved: boolean, at: number): void {
    if (!this.closed) this.emit({ kind: 'backfire', at, actors: [rat.id], p: at3(rat), bonus: shoved ? 15 : 0 });
  }

  hit(h: HighlightHit): void {
    if (this.closed) return;
    const { victim, attacker } = h, killer = attacker && attacker.id !== victim.id ? attacker : undefined;
    const actors = killer ? [killer.id, victim.id] : [victim.id];
    const qualifiers: Qualifier[] = [];
    const leadMs = h.squashAirMs === undefined ? undefined : h.squashAirMs + 1500;
    if (h.squashAirMs !== undefined) qualifiers.push({ kind: 'squashed', bonus: (h.killed ? 20 : 0) + Math.min(20, h.squashAirMs / 200) });
    if (h.corpse) qualifiers.push({ kind: 'body-blow', bonus: h.killed ? 20 : 0 });
    if (!h.killed) {
      if (qualifiers.length) this.emit(this.best(qualifiers, h.at, actors, at3(victim), leadMs));
      return;
    }
    if (h.environment === 'drowned') qualifiers.push({ kind: 'splashdown', bonus: 0 });
    if (h.victimTrapped) qualifiers.push({ kind: 'snapped', bonus: 0 });
    if (h.carrier) {
      const gap = objectiveGap(h.assignment, victim.id, victim);
      if (gap.dropoff !== undefined && gap.dropoff <= H.soCloseDistance) qualifiers.push({ kind: 'so-close', bonus: (H.soCloseDistance - gap.dropoff) * 2 });
      else if (gap.zoneLeftMs !== undefined && gap.zoneLeftMs <= H.soCloseZoneMs) qualifiers.push({ kind: 'so-close', bonus: (H.soCloseZoneMs - gap.zoneLeftMs) / 500 });
      qualifiers.push({ kind: 'carrier-down', bonus: 0 });
    }
    const meal = this.quickFixAt.get(victim.id), spawned = this.spawnedAt.get(victim.id);
    if (meal !== undefined && h.at - meal <= H.lastMealMs) qualifiers.push({ kind: 'last-meal', bonus: 0 });
    if (spawned !== undefined && h.at - spawned <= H.freshSpawnMs) qualifiers.push({ kind: 'fresh-spawn', bonus: 0 });
    if (killer && killer.hp <= 0) qualifiers.push({ kind: 'from-beyond', bonus: 0 });
    if (h.bounces !== undefined && h.bounces >= H.bankShotBounces) qualifiers.push({ kind: 'bank-shot', bonus: (h.bounces - H.bankShotBounces) * 10 });
    if (h.weapon === 'laser' && h.reflections !== undefined && h.reflections >= H.laserReflections) qualifiers.push({ kind: 'laser-ricochet', bonus: (h.reflections - H.laserReflections) * 10 });
    const range = killer ? dist(killer, victim) : 0;
    if (h.headshot && range > H.longShotDistance) qualifiers.push({ kind: 'long-shot', bonus: Math.min(30, (range - H.longShotDistance) / 2) });
    if (h.attackerAirborne || h.victimAirborne) qualifiers.push({ kind: 'airborne', bonus: 0 });

    const start = this.deps.corpseAt(victim.id);
    this.pending.push({ hit: h, actors, p: at3(victim), qualifiers, ...(leadMs === undefined ? {} : { leadMs }), ...(start ? { start } : {}), travel: 0, rise: 0 });
    this.death({ at: h.at, victim: victim.id, p: at3(victim), ...(killer ? { killer: killer.id } : {}) });
    if (killer) this.kill(killer, { at: h.at, victim: victim.id, killer: killer.id, p: at3(victim) });
  }

  /** Each room tick after the simulation steps: spawns, the bodies in flight, the case and the objective, and any
   * moment whose wait is over. */
  tick(now: number, rats: ReadonlyMap<string, HighlightRat>, caseOwner: string | null, assignment: AssignmentState | undefined): void {
    for (const rat of rats.values()) {
      const alive = rat.hp > 0, was = this.alive.get(rat.id);
      if (alive && was !== true && (was === false || this.started)) this.spawnedAt.set(rat.id, now);
      this.alive.set(rat.id, alive);
    }
    this.started = true;
    if (this.closed) return;
    for (const kill of this.pending) this.travel(kill);
    const settled = this.pending.filter(k => now - k.hit.at >= H.sentFlyingMs);
    if (settled.length) { this.pending = this.pending.filter(k => now - k.hit.at < H.sentFlyingMs); for (const kill of settled) this.settleKill(kill); }
    this.watchCase(now, rats, caseOwner, assignment);
    this.settleBursts(now);
  }

  /** The round is won by `winner` at `at`: every open moment settles now, and the winning play is the round winner (a
   * kill in the last second or a steal that won it adds to its score). Nothing more is detected until `reset`. */
  roundWon(winner: HighlightRat, at: number): void {
    if (this.closed) return;
    let moment: Moment = { kind: 'round-winner', at, actors: [winner.id], p: at3(winner), bonus: 0 };
    const decisive = this.pending.filter(k => k.hit.attacker?.id === winner.id && k.hit.victim.id !== winner.id && at - k.hit.at <= 1000).pop();
    if (decisive) {
      this.pending = this.pending.filter(k => k !== decisive);
      this.travel(decisive);
      moment = { ...moment, at: decisive.hit.at, actors: decisive.actors, p: decisive.p, extra: this.qualified(decisive) };
    }
    const steal = this.steals.get(winner.id);
    if (steal && at - steal.at <= H.stealScoreMs) {
      moment = { ...moment, actors: [...new Set([...moment.actors, steal.from])], extra: [...moment.extra ?? [], { kind: 'steal-score', bonus: 0 }], leadMs: at - steal.at + 1000 };
    }
    for (const kill of this.pending) this.settleKill(kill);
    this.pending = [];
    this.settleBursts(Infinity);
    this.emit(moment);
    this.closed = true;
  }

  /** A pileup: `pileup.deaths` or more deaths within `radius` of the first and `windowMs` after it. */
  private death(member: Member): void {
    const P = H.pileup, entry = { ...member, piled: false };
    this.deaths = this.deaths.filter(d => member.at - d.at <= P.windowMs);
    this.deaths.push(entry);
    const pile = this.bursts.find(b => b.kind === 'pileup' && member.at - b.first <= P.windowMs && dist(b.p, member.p) <= P.radius);
    if (pile) { entry.piled = true; this.grow(pile, member); return; }
    for (const anchor of this.deaths) {
      if (anchor.piled) continue;
      const members = this.deaths.filter(d => !d.piled && d.at >= anchor.at && d.at - anchor.at <= P.windowMs && dist(anchor.p, d.p) <= P.radius);
      if (members.length < P.deaths || !members.includes(entry)) continue;
      for (const d of members) d.piled = true;
      this.bursts.push({ id: this.nextId(), kind: 'pileup', first: anchor.at, last: member.at, members, p: anchor.p, dirty: true });
      return;
    }
  }

  /** A multi-kill: kills by one rat, each within `multiKill.windowMs` of the one before. */
  private kill(killer: HighlightRat, member: Member): void {
    const M = H.multiKill, streak = this.streaks.get(killer.id);
    if (streak && member.at - streak.last <= M.windowMs) {
      this.grow(streak, member); streak.p = at3(killer);
      if (streak.members.length === M.kills) this.bursts.push(streak);
      return;
    }
    this.streaks.set(killer.id, { id: this.nextId(), kind: 'multi-kill', first: member.at, last: member.at, members: [member], killer: killer.id, p: at3(killer), dirty: true });
  }

  private grow(burst: Burst, member: Member): void {
    burst.members.push(member); burst.last = Math.max(burst.last, member.at); burst.dirty = true;
  }

  /** Bursts are sent once quiet for `burstHoldMs` (again if they grow) and recorded once their window has passed. */
  private settleBursts(now: number): void {
    for (const burst of this.bursts) if (burst.dirty && now - burst.last >= H.burstHoldMs) { burst.dirty = false; this.sendBurst(burst); }
    this.bursts = this.bursts.filter(b => {
      if (b.dirty || now <= (b.kind === 'pileup' ? b.first + H.pileup.windowMs : b.last + H.multiKill.windowMs)) return true;
      if (b.sent) this.deps.record(b.sent);
      if (b.killer && this.streaks.get(b.killer) === b) this.streaks.delete(b.killer);
      return false;
    });
    for (const [id, streak] of this.streaks) if (streak.members.length < H.multiKill.kills && now - streak.last > H.multiKill.windowMs) this.streaks.delete(id);
  }

  private sendBurst(b: Burst): void {
    const n = b.members.length, kills = new Map<string, number>();
    for (const m of b.members) if (m.killer) kills.set(m.killer, (kills.get(m.killer) ?? 0) + 1);
    const main = b.killer ?? [...kills].sort((x, y) => y[1] - x[1])[0]?.[0];
    const actors = [...new Set([...(main ? [main] : []), ...b.members.map(m => m.victim)])];
    const p = b.kind === 'pileup'
      ? { x: b.members.reduce((t, m) => t + m.p.x, 0) / n, y: b.members.reduce((t, m) => t + m.p.y, 0) / n, z: b.members.reduce((t, m) => t + m.p.z, 0) / n } : b.p;
    const bonus = b.kind === 'pileup' ? (n - H.pileup.deaths) * 15 : (n - H.multiKill.kills) * 25;
    const first = b.rarity === undefined;
    b.rarity ??= this.rarity(b.kind);
    const marker = this.marker({ kind: b.kind, at: b.last, actors, p, bonus, leadMs: b.last - b.first + 2000 }, b.rarity, b.id);
    if (!marker) return;
    if (first) this.seen.set(b.kind, (this.seen.get(b.kind) ?? 0) + 1);
    b.sent = marker;
    this.deps.send(marker);
  }

  /** How far and high a fallen rat's body has gone from where it fell. */
  private travel(kill: PendingKill): void {
    const body = kill.start && this.deps.corpseAt(kill.hit.victim.id);
    if (!kill.start || !body) return;
    kill.travel = Math.max(kill.travel, Math.hypot(body.x - kill.start.x, body.z - kill.start.z));
    kill.rise = Math.max(kill.rise, body.y - kill.start.y);
  }

  private qualified(kill: PendingKill): Qualifier[] {
    const S = H.sentFlying;
    if (kill.travel < S.distance && kill.rise < S.height) return kill.qualifiers;
    return [{ kind: 'sent-flying', bonus: Math.min(50, Math.max(0, kill.travel - S.distance) + Math.max(0, kill.rise - S.height) * 2) }, ...kill.qualifiers];
  }

  private settleKill(kill: PendingKill): void {
    const qualifiers = this.qualified(kill);
    if (!qualifiers.length) return;
    const moment = this.best(qualifiers, kill.hit.at, kill.actors, kill.p, kill.leadMs);
    // The body keeps flying after the kill: the clip follows it.
    this.emit(moment.kind === 'sent-flying' ? { ...moment, trailMs: H.sentFlyingMs + 500 } : moment);
  }

  /** The highest-scoring kind of one hit; the others add to it. */
  private best(qualifiers: Qualifier[], at: number, actors: string[], p: Vec3Data, leadMs?: number): Moment {
    const top = qualifiers.reduce((a, b) => H.base[b.kind] + b.bonus > H.base[a.kind] + a.bonus ? b : a);
    return { kind: top.kind, at, actors, p, bonus: top.bonus, extra: qualifiers.filter(q => q !== top), ...(leadMs === undefined ? {} : { leadMs }) };
  }

  /** Steals (the case taken within `stealGapMs` of another rat losing it), and scoring: a PAPER CHASE delivery, an
   * Excessive Force case kill or a Jurisdiction carrier starting to score. */
  private watchCase(now: number, rats: ReadonlyMap<string, HighlightRat>, owner: string | null, assignment: AssignmentState | undefined): void {
    if (owner !== this.holder) {
      if (this.holder) this.lost = { id: this.holder, at: now };
      if (owner && this.lost && this.lost.id !== owner && now - this.lost.at <= H.stealGapMs) this.steals.set(owner, { from: this.lost.id, at: now });
      this.holder = owner;
    }
    for (const [id, steal] of this.steals) if (now - steal.at > H.stealScoreMs) this.steals.delete(id);
    if (!assignment || assignment.result || assignment.revision === this.revision) return;
    this.revision = assignment.revision;
    const scored: Array<{ id: string; at: number; delivery: boolean }> = [];
    if (assignment.deliverySerial !== this.deliverySerial) {
      const last = assignment.lastDelivery;
      if (this.deliverySerial >= 0 && last) scored.push({ id: last.playerId, at: last.at, delivery: true });
      this.deliverySerial = assignment.deliverySerial;
    }
    for (const [id, n] of Object.entries(assignment.caseKills)) if (n > (this.caseKills[id] ?? 0)) scored.push({ id, at: now, delivery: false });
    this.caseKills = { ...assignment.caseKills };
    const scorer = assignment.jurisdiction?.scorerId ?? null;
    if (scorer && scorer !== this.scorer) scored.push({ id: scorer, at: now, delivery: false });
    this.scorer = scorer;
    for (const s of scored) {
      const rat = rats.get(s.id), p = rat ? at3(rat) : { x: 0, y: 0, z: 0 }, steal = this.steals.get(s.id);
      if (steal && s.at - steal.at <= H.stealScoreMs) {
        this.steals.delete(s.id);
        this.emit({ kind: 'steal-score', at: s.at, actors: [s.id, steal.from], p, bonus: Math.max(0, (H.stealScoreMs - (s.at - steal.at)) / 1000),
          leadMs: s.at - steal.at + 1000, ...(s.delivery ? { extra: [{ kind: 'delivery', bonus: 0 }] } : {}) });
      } else if (s.delivery) this.emit({ kind: 'delivery', at: s.at, actors: [s.id], p, bonus: 0 });
    }
  }

  /** Each earlier moment of a kind this round makes the next one rarer to send. */
  private rarity(kind: HighlightKind): number {
    return Math.max(H.rarityMin, 1 / (1 + H.rarity * (this.seen.get(kind) ?? 0)));
  }
  private nextId(): string { return `${this.prefix}-${++this.serial}`; }

  /** Score a moment and build its marker; undefined under the floor. */
  private marker(m: Moment, rarity: number, id = this.nextId()): HighlightMarker | undefined {
    const combo = (m.extra ?? []).reduce((t, q) => t + H.base[q.kind] * H.combo, 0);
    const human = m.actors.some(a => this.deps.isHuman(a)) ? H.human : 1;
    const score = Math.round((H.base[m.kind] + m.bonus + combo) * human * rarity);
    if (score < H.floor) return undefined;
    return { type: 'highlight', id, kind: m.kind, at: Math.round(m.at), actors: m.actors.slice(0, MAX_HIGHLIGHT_ACTORS), p: { x: m.p.x, y: m.p.y, z: m.p.z }, score,
      leadMs: Math.round(Math.max(H.leadMs, Math.min(H.maxLeadMs, m.leadMs ?? H.leadMs))), trailMs: Math.round(Math.max(0, Math.min(H.maxTrailMs, m.trailMs ?? H.trailMs))) };
  }

  private emit(m: Moment): void {
    const marker = this.marker(m, this.rarity(m.kind));
    if (!marker) return;
    this.seen.set(m.kind, (this.seen.get(m.kind) ?? 0) + 1);
    this.deps.send(marker);
    this.deps.record(marker);
  }
}
