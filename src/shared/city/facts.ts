import type { Vec3Data } from '../networkProtocol';
import type { AssignmentId } from '../assignments';
import type { PickupKind } from '../pickups';
import type { ShotResultOutcome, HealCause } from '../networkProtocol';
import type { CityFloor } from './frame';

/** Layer 2 of the city map (docs/city-map.md): one JSON line per fact in the R2 archive.
 * Positions are rounded to 0.1 u, times are UTC ms. Actors are per-round numbers, never names or IDs. */
export const CITY_SCHEMA_VERSION = 1;
export type P3 = [number, number, number];
export const p3 = (v: Vec3Data): P3 => [Math.round(v.x * 10) / 10, Math.round(v.y * 10) / 10, Math.round(v.z * 10) / 10];

export interface FactContext {
  /** UTC ms; `rm` is ms since the round went live (absent between rounds). */
  t: number; rm?: number;
  room: string; round?: string; layout: number; schema: number;
  mode: AssignmentId | 'none';
  incident?: string;
}

/** Running K/D/A for one rat in this round. An assist is damage dealt to a victim in the
 * 10 s before someone else (or the city) killed it. */
export interface Kda { k: number; d: number; a: number; streak: number; dmgOut: number; dmgIn: number; hs: number; shots: number; hits: number }

/** Where one rat stands in the round. `progress` is its fraction of the win (1 = winning now). */
export interface Standing { progress: number; rank: number; lead: number; raw: number }

/** One rat, one moment: what it is, has, knows and faces. Recorded every second, and
 * five times a second around fights. Shared so future bots can decide from the same view. */
export interface RatSituation {
  a: number; human: boolean;
  p: P3; floor: CityFloor; place: string;
  v: [number, number]; yaw: number; pitch: number;
  hp: number; alive: boolean; respawnIn?: number; lifeMs: number;
  buffs: { ironclad?: number; hustle?: number };
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
  humans: number; bots: number; corpses: number; balls: number;
}

export type CityFact = FactContext & (
  | { type: 'frame'; world: WorldSituation; rats: RatSituation[] }
  | { type: 'window'; reason: 'damage'; from: number; to: number; samples: Record<string, Array<[number, number, number, number, number, number]>> }
  | { type: 'spawn'; a: number; p: P3; place: string; nearest?: number }
  | { type: 'shot'; a: number; human: boolean; p: P3; place: string; dir: P3; gapMs?: number }
  /** `bounces`: wall bounces before this end; a banked hit has at least one. */
  | { type: 'ball'; a?: number; outcome: ShotResultOutcome; p?: P3; place?: string; victim?: number; bounces?: number }
  /** `incoming`: the hit came with a ball's travel direction (true for ordinary shots). */
  | { type: 'damage'; a?: number; victim: number; dmg: number; head: boolean; explosive: boolean; incoming: boolean; ap?: P3; vp: P3; dist?: number; hpAfter: number }
  | { type: 'death'; a?: number; victim: number; cause: 'shot' | 'headshot' | 'explosion' | 'city'; ap?: P3; aplace?: string; vp: P3; vplace: string; dist?: number; lifeMs: number; assists: number[] }
  | { type: 'pickup'; a: number; site: string; kind: PickupKind; p: P3; place: string; hpBefore: number; waitedMs?: number }
  | { type: 'restock'; site: string; kind: PickupKind }
  | { type: 'heal'; a: number; cause: HealCause; hp: number }
  | { type: 'buff-end'; a: number; buff: 'ironclad' | 'hustle' }
  | { type: 'case'; what: 'take' | 'drop' | 'steal' | 'deliver' | 'respawn'; a?: number; from?: number; p: P3; place: string; carryMs?: number }
  | { type: 'launch'; a: number; machine?: string; boost: boolean; p: P3; place: string }
  | { type: 'landing'; a: number; machine?: string; p: P3; place: string; airMs: number; apex: number; clip: boolean }
  | { type: 'dispatch'; phase: string; incident?: string; caller?: number; pillar?: string; wanted?: number }
  | { type: 'zone'; what: 'activate' | 'scorer'; zone: string; scorer?: number }
  | { type: 'round'; what: 'start' | 'end'; winner?: number; method?: string; durationMs?: number; humans: number; bots: number; standings?: Array<{ a: number; human: boolean; standing: Standing; kda: Kda }> }
  | { type: 'session'; what: 'join' | 'leave'; a: number; human: boolean }
  | { type: 'anomaly'; what: 'inside-geometry' | 'fell-through' | 'out-of-bounds'; a: number; p: P3; place: string }
);
