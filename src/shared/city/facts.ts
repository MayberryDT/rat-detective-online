import type { Vec3Data } from '../networkProtocol';
import type { AssignmentId } from '../assignments';
import type { FaultyKind, PickupKind, TimedPickup, WeaponKind } from '../pickups';
import type { ShotResultOutcome, HealCause, EnvironmentCause } from '../networkProtocol';
import type { CityFloor } from './frame';
import type { Goal, MotorMode, Personality, Stance } from '../bots/intent';
import type { GoalOutcome, MindName } from './minds';
import type { PerfReport } from '../perfReport';
import type { AdminCommandName, AdminVia } from '../admin';
import type { IncidentId } from '../incidentCatalog';
import type { ExhibitAction, HighlightKind } from '../highlights';

/** Layer 2 of the city map (docs/city-map.md): one JSON line per fact in the R2 archive.
 * Positions are rounded to 0.1 u, times are UTC ms. Actors are per-round numbers, never names or IDs. */
export const CITY_SCHEMA_VERSION = 1;
export type P3 = [number, number, number];
export const p3 = (v: Vec3Data): P3 => [Math.round(v.x * 10) / 10, Math.round(v.y * 10) / 10, Math.round(v.z * 10) / 10];
/** A rat in sight when a shot left the gun, measured from the shooter's eye (radians, units, units a second).
 * `e`/`eh`: angle between the shot and the target's chest/head. `lat`: the target's speed across the line of sight.
 * `lead`: the aim error along that crossing motion (positive: aimed ahead of the rat), when it moved at least .5 u/s. */
export interface ShotTarget { a: number; d: number; e: number; eh: number; lat: number; lead?: number }

export interface FactContext {
  /** UTC ms; `rm` is ms since the round went live (absent between rounds). */
  t: number; rm?: number;
  room: string; round?: string; layout: number; schema: number;
  /** The release: `<env>-<YYYY-MM-DD>-<git short sha>[-dirty]`, set at deploy time (`BUILD`, scripts/deploy.mjs); `dev` when unset. */
  build: string;
  /** The bots' `MIND_VERSION` (docs/bot-overhaul.md): minds, questions, weights and dials. */
  mindVersion: number;
  mode: AssignmentId | 'none';
  incident?: string;
  /** A code-only round (the bot learning plan, L5): the bots use the code mind even with humans playing. */
  codeOnly?: true;
}

/** What a bot faced when it decided, from the world at that moment. Distances are horizontal, to 0.1 u: `case` to the
 * case (or its carrier), `carrier` to the carrier when another rat carries it, `rival` to the nearest living rival.
 * `closer`: nearer the case than every living rival. `seen`: rats in line of sight. */
export interface DecisionInputs { case: number; carrier?: number; rival?: number; closer: boolean; hp: number; rivalHp?: number; seen: number; carrying: boolean }

/** Running K/D/A for one rat in this round. An assist is damage dealt to a victim in the
 * 10 s before someone else (or the city) killed it. */
export interface Kda { k: number; d: number; a: number; streak: number; dmgOut: number; dmgIn: number; hs: number; shots: number; hits: number }

/** Where one rat stands in the round. `progress` is its fraction of the win (1 = winning now). */
export interface Standing { progress: number; rank: number; lead: number; raw: number }

/** One rat, one moment: what it is, has, knows and faces. Recorded every second, and
 * five times a second around fights. Shared so future bots can decide from the same view. */
export interface RatSituation {
  /** `human` is false for bots and agents; an agent (a headless test browser joined with `agent=1`) adds `agent`. */
  a: number; human: boolean; agent?: true;
  p: P3; floor: CityFloor; place: string;
  v: [number, number]; yaw: number; pitch: number;
  hp: number; alive: boolean; respawnIn?: number; lifeMs: number;
  buffs: Partial<Record<TimedPickup, number>>;
  /** The special weapon in its paw. */
  weapon?: WeaponKind;
  lastPickup?: { kind: PickupKind; agoMs: number };
  case: { carrying: boolean; carryMs?: number; dist: number };
  objectiveDist?: number;
  standing: Standing;
  kda: Kda;
  /** How often it is shooting: trigger pulls in the last 10 s, and time since the last one. */
  fire: { last10s: number; lastAgoMs?: number };
  /** Rivals in line of sight within 150 units, and the nearest of them; `nearest` ignores walls. */
  danger: { visible: number; nearest?: number; nearestVisible?: number; lastHitAgoMs?: number; lastHitBy?: number; wanted?: true };
}

/** The whole city at one moment, recorded every second with the rats' situations. */
export interface WorldSituation {
  phase: 'playing' | 'won';
  clockMs?: number;
  case: { owner?: number; loose: boolean; returning: boolean; p: P3; place: string; sinceChangeMs: number; decoys: number };
  dispatch: { phase: string; incident?: string; leftMs?: number; caller?: number; wanted?: number };
  pickups: Record<string, number>;
  pressure: Record<string, number>;
  zone?: { id: string; leftMs: number; inside: number[]; scorer?: number };
  /** `humans` leaves out agents, counted in `agents`. */
  humans: number; bots: number; agents?: number; corpses: number; balls: number;
}

export type CityFact = FactContext & (
  /** P4 case papers: `lead` a starter spill at a fresh spawn (`n` sheets); `route` a rat's first route to this case placement
   * (`n` route nodes); `clear` every sheet retired when the case moved, returned or the round reset (`n` sheets, `p` the case). */
  | {type:'clue';what:'lead'|'route'|'clear';a?:number;p:P3;place:string;n?:number}
  | { type: 'frame'; world: WorldSituation; rats: RatSituation[] }
  /** `aim`: per actor, 20 samples a second of `[ms, yaw, pitch]`: a human's camera look (pitch null when the client sent none), a bot's facing (pitch null).
   * `controls`: per actor, the same 20 Hz slots of `[ms, f, r, jumps, fx, rx]`, the same for humans and bots (`ControlTally`): the move
   * axes pressed at the slot's end (`RatControls.moveForward` / `moveRight`, -1..1), then within the slot the jump presses and the key
   * changes on the forward/back and on the left/right axis (a tap is two). Humans from their client's sends, bots from their motor each
   * step; a rat with no fresh controls (an older client) has no entry. Trigger pulls are `shot` facts. */
  | { type: 'window'; reason: 'damage'; from: number; to: number; samples: Record<string, Array<[number, number, number, number, number, number]>>; aim?: Record<string, Array<[number, number, number | null]>>;
      controls?: Record<string, Array<[number, number, number, number, number, number]>> }
  | { type: 'spawn'; a: number; p: P3; place: string; nearest?: number }
  /** Every shot by a human or an agent; one bot shot in `sample` (archive only). `targets`: the rats in sight nearest the aim line.
   * `weapon`: fired with a Tommy Gun or a Laser (setting a Mousetrap down is a `trap` fact, not a shot). */
  | { type: 'shot'; a: number; human: boolean; agent?: true; p: P3; place: string; dir: P3; gapMs?: number; sample?: number; targets?: ShotTarget[]; weapon?: WeaponKind }
  /** `bounces`: wall bounces before this end; a banked hit has at least one. */
  | { type: 'ball'; a?: number; outcome: ShotResultOutcome; p?: P3; place?: string; victim?: number; bounces?: number }
  /** `incoming`: the hit came with a ball's travel direction (true for ordinary shots). `weapon`: a special weapon's hit. */
  | { type: 'damage'; a?: number; victim: number; dmg: number; head: boolean; explosive: boolean; incoming: boolean; ap?: P3; vp: P3; dist?: number; hpAfter: number; weapon?: WeaponKind }
  /** `env`: what killed a rat nobody is credited with. (Before protocol 28 a Mousetrap's snap killed, cause 'trap'; until
   * protocol 29 Cheddar Shower's meteors did, env 'meteor', with their own 'meteor' facts. Old facts may hold either.)
   * `bounces`: a Crossfire bank kill's world bounces (since protocol 29). */
  | { type: 'death'; a?: number; victim: number; cause: 'shot' | 'headshot' | 'explosion' | 'city'; ap?: P3; aplace?: string; vp: P3; vplace: string; dist?: number; lifeMs: number; assists: number[]; weapon?: WeaponKind; env?: EnvironmentCause; bounces?: number }
  /** Code Violation: equipment misbehaved at `p` (`site`: the supply, machine or pillar). `faulty`: the supply rat `a`
   * claimed came out as its dud `kind` (`FAULTY_KINDS`); `machine` fired on its own or flung bystanders; `pillar` clanged.
   * `shoved`: rats the blast threw (a Backfire throws its own rat). Nothing here kills. */
  | { type: 'malfunction'; what: 'faulty' | 'machine' | 'pillar'; site: string; p: P3; place: string; a?: number; kind?: FaultyKind; shoved: number }
  /** A Mousetrap (`trap` id, owner `a`, at `p`): set down, snapped on `victim` (since protocol 28 a hold, not a death:
   * `holdMs` the victim is held in place), or broken (`by` whose hit finished it; it lets go of anyone it held). */
  | { type: 'trap'; what: 'launch' | 'set' | 'snap' | 'break'; a: number; trap: string; p: P3; place: string; victim?: number; by?: number; holdMs?: number }
  /** `faulty`: Code Violation made the claim its dud instead of the supply (the `malfunction` fact has which). */
  | { type: 'pickup'; a: number; site: string; kind: PickupKind; p: P3; place: string; hpBefore: number; waitedMs?: number; faulty?: true }
  | { type: 'restock'; site: string; kind: PickupKind }
  | { type: 'heal'; a: number; cause: HealCause; hp: number }
  | { type: 'buff-end'; a: number; buff: TimedPickup }
  /** The primary case changed hands. A `drop` says why (`cause`) and how many enemy balls its grip took that carry
   * (`gripHits`). A `drop` or `steal` says how many heartbeat pings the carry ended gave away (`pings`; the take's own
   * ping counts). A `take`, `steal` or `respawn` ends a loose spell: `looseMs` loose, `path` units travelled, `moved`
   * straight-line units from where it came loose (or appeared), `kicks` balls that hit it while loose (every rat's). */
  | { type: 'case'; what: 'take' | 'drop' | 'steal' | 'deliver' | 'respawn'; a?: number; from?: number; p: P3; place: string; carryMs?: number;
      cause?: 'death' | 'shot' | 'delivered' | 'left'; gripHits?: number; pings?: number; looseMs?: number; path?: number; moved?: number; kicks?: number }
  | { type: 'launch'; a: number; machine?: string; boost: boolean; p: P3; place: string }
  /** A rat knocked away (`ChaosSimulation.shove`, the same for humans and bots): `cause` is what did it ('shove' a landing
   * shockwave, 'blast' a Scattershot ball, or an incident's own kind), `speed` the sideways u/s. Pressure
   * Surge's suction pulls are not recorded. */
  | { type: 'shove'; a: number; cause: string; speed: number; p: P3; place: string }
  /** Most Wanted: `a` took down the wanted rat `victim` and was handed `kind`. */
  | { type: 'bounty'; a: number; victim: number; kind: PickupKind; p: P3; place: string }
  | { type: 'landing'; a: number; machine?: string; p: P3; place: string; airMs: number; apex: number; clip: boolean }
  | { type: 'dispatch'; phase: string; incident?: string; caller?: number; pillar?: string; wanted?: number }
  | { type: 'zone'; what: 'activate' | 'scorer'; zone: string; scorer?: number }
  | { type: 'round'; what: 'start' | 'end'; winner?: number; method?: string; durationMs?: number; humans: number; bots: number; agents?: number;
      standings?: Array<{ a: number; human: boolean; agent?: true; standing: Standing; kda: Kda }> }
  | { type: 'session'; what: 'join' | 'leave'; a: number; human: boolean; agent?: true }
  | { type: 'anomaly'; what: 'inside-geometry' | 'fell-through' | 'out-of-bounds'; a: number; p: P3; place: string }
  /** A stuck bot was moved to a spawn point; `from` and `place` are where it was stuck. */
  | { type: 'rescue'; a: number; from: P3; place: string }
  /** A bot took up a goal, or applied a fresh Jev answer. `motor`: the motor mode of its plan; `top`: the best three
   * offered goals by weighted score, as [goal, raw, weighted]; `target`: the answer named a rat to shoot; `failed`: the
   * motor gave up the previous plan; `jev`: how Jev fared when the code mind decided while Jev was on; `in`: what it faced
   * (absent only before the recorder has seen the world). */
  | { type: 'decision'; a: number; p: P3; place: string; mind: MindName; personality?: Personality; goal: Goal; motor: MotorMode;
      trigger: 'beat' | 'event' | 'fallback'; top: Array<[Goal, number, number]>; danger?: number; target: boolean; failed?: true;
      latencyMs?: number; tokens?: number; jev?: 'answered' | 'stale' | 'fallback'; in?: DecisionInputs; stance?: Stance }
  /** A stocked supply the rat could use (not a Quick Fix at full health) came within 12 u on its floor in clear sight, and the
   * rat went more than 16 u away (or died) without claiming it while it stayed stocked. One per approach. `dist`, `p`,
   * `place` and `hp`: the nearest the rat came (horizontal, to 0.1 u), where, and its health there. */
  /** A supply handed over on the spot: for a kill streak title, calling Dispatch or a Most Wanted bounty (and, before the
   * hot case heartbeat in protocol 29, for taking the case: old facts may say 'case'). */
  | { type: 'reward'; a: number; kind: PickupKind; why: 'case' | 'streak' | 'dispatch' | 'bounty' | 'admin' | 'safe'; p: P3; place: string }
  /** A penthouse safe cracked (protocol 43): by `a` (absent when no rat's hit did it), handing over `gun` with Ironclad
   * and Hot Pursuit (each also a `reward` fact, why 'safe'). */
  | { type: 'safe'; a?: number; safe: string; gun: WeaponKind; p: P3; place: string }
  | { type: 'pickup-passed'; a: number; site: string; kind: PickupKind; dist: number; p: P3; place: string; hp: number }
  /** A bot's goal ended; `from` is where it was taken up, `p` and `place` where it ended. */
  | { type: 'goal-end'; a: number; goal: Goal; motor: MotorMode; mind: MindName; personality?: Personality; outcome: GoalOutcome; durationMs: number; from: string; p: P3; place: string }
  /** The Jev mind's counts over `ms` while it was on; reply latency p50 and p90 in ms, and every reply's latency as
   * counts per 20 ms bucket (`hist`, keyed by the bucket's lower bound), so windows pool exactly. */
  | { type: 'minds'; ms: number; decisions: number; requests: number; answers: number; failures: number; staleDrops: number; fallbacks: number;
      throttled: number; tokens: number; dollars: number; p50?: number; p90?: number; hist: Record<string, number> }
  /** A player's client frame performance over about 30 s of play (`PerfReport`); never bots. An agent's is `human: false, agent: true`. */
  | ({ type: 'perf'; a: number; human: boolean; agent?: true } & PerfReport)
  /** Tyler's admin controls (docs/live-service.md): one per command, `ok` whether it took effect. `via` the HTTP endpoint (the CLI)
   * or an admin's game socket, whose rat is `a`. `next`: the mode chosen for the next round; `roll`: the incident rolled; `winner`:
   * the leader an `end-round` declared the winner. A round with any admin fact is admin-touched: analysis can leave it out by `round`. */
  | { type: 'admin'; command: Exclude<AdminCommandName, 'status'>; via: AdminVia; ok: boolean; a?: number; next?: AssignmentId; roll?: IncidentId; winner?: number }
  /** Highlight replays (docs/replay/detection.md): a moment sent to every player. `a` its main actor (the killer or doer),
   * `victim` the first rat it happened to; `p`/`place` where; `score` as sent (a multi-kill or pileup: its final score). */
  | { type: 'highlight'; kind: HighlightKind; a: number; victim?: number; p: P3; place: string; score: number }
  /** A player's results board showed, played or saved an exhibit of this kind (an agent's is `human: false, agent: true`). */
  | { type: 'exhibit'; kind: HighlightKind; action: ExhibitAction; a: number; human: boolean; agent?: true }
);
