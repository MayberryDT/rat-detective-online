import type { ChaosState } from './chaosState';
import type { WorldSpec } from './worldSpec';
import type { AssignmentState } from './assignments';
import type { IncidentId } from './incidentCatalog';
import type { ControlsInput } from './rat/controlTally';
import type { PerfReport } from './perfReport';

/** 26: case grip; Paper Chase to five; Jurisdiction zones hold points that drain only while the case is held there. */
export const PROTOCOL_VERSION = 26;
/** Body hits deal 1; a headshot is always lethal. */
export const MAX_HP = 5;
export const KILLS_TO_WIN = 20;
export const RESPAWN_DELAY_MS = 3_000;
/** Round end: the slow-motion finish, the Case File, the police lineup, then the results board to
 * read at leisure (Tyler, 30 September: players want to sit and read the stats). */
export const WIN_DISPLAY_MS = 30_000;
export const DEFAULT_ROOM_NAME = 'public-live-v2';
/** Wire-format ceiling for private capacity experiments; not an admission limit. */
export const MAX_SCORE_ENTRIES = 100;
export const MAX_PLAYERS = 10;
/** Open sockets allowed, including clients that have not finished joining. */
export const MAX_CONNECTIONS = MAX_PLAYERS + 8;
export const MAX_MESSAGE_BYTES = 8_192;
export const MAX_SERVER_MESSAGE_BYTES = 65_536;
/** Exact UTF-8 size of a wire string, as TextEncoder would produce (a lone
 * surrogate becomes a 3-byte replacement), without allocating the encoding. */
export function wireBytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes++;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next < 0xe000) { bytes += 4; i++; } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export type HatTypeName = 'fedora' | 'trilby' | 'porkpie';
export type RoundPhase = 'playing' | 'won';

export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export interface QuatData {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RatAppearance {
  hatType: HatTypeName;
  hatColor: number;
  furColor: number;
  coatColor: number;
  /** Optional for existing room checkpoints/clients; new appearances always supply it. */
  highlightColor?: number;
}

export interface PlayerData extends RatAppearance {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  meshQx: number;
  meshQy: number;
  meshQz: number;
  meshQw: number;
  hp: number;
  kills: number;
  deaths: number;
  /** Kills since this rat's last death this round (its kill streak); absent at zero. */
  streak?: number;
  /** Present while dead: authoritative respawn (or round-reset) deadline. */
  respawnAt?: number;
}

export interface ScoreEntry {
  id: string;
  name: string;
  kills: number;
  deaths: number;
}

/** Polish 19 round-end Case File entry (cosmetic; never affects scoring). */
export type AwardId = 'top-gun' | 'most-cheesed' | 'butterfingers' | 'sewer-dweller' | 'high-flier'
  | 'sharpshooter' | 'headhunter' | 'long-shot' | 'case-keeper' | 'frequent-flier' | 'supply-run' | 'legwork' | 'dispatcher';
export interface Award { id: AwardId; title: string; playerId: string; playerName: string; value: number }

export interface RoundState {
  phase: RoundPhase;
  winnerId?: string;
  winnerName?: string;
  kills?: number;
  resetAt?: number;
  startedAt?: number;
  assignment?: AssignmentState;
}

export interface PublicScore {
  name: string;
  kills: number;
  deaths: number;
}

export interface PublicRoomStatus {
  room: string;
  players: number;
  phase: RoundPhase;
  startedAt: number;
  resetAt?: number;
  winnerName?: string;
  scores: PublicScore[];
}

export const MAX_MOVEMENT_BATCH = 100;
export interface MovementSample {
  at: number;
  seq?: number;
  player: Pick<PlayerData, 'id' | 'x' | 'y' | 'z' | 'qx' | 'qy' | 'qz' | 'qw' | 'meshQx' | 'meshQy' | 'meshQz' | 'meshQw'>;
}

/** Latest local pose bundled with latency-sensitive actions. Sequence numbers are
 * monotonic per player life and let authority reject stale/replayed positions. */
export interface MovementInput {
  /** Required from protocol-15 gameplay clients; optional for internal legacy fixtures. */
  seq?: number;
  position: Vec3Data;
  rotation: QuatData;
  meshRotation: QuatData;
  /** The camera's unit look direction, for the city map's aim record only; authority never reads it. */
  aim?: Vec3Data;
  /** The controls pressed since the previous send, for the city map's controls record only; authority never reads it. */
  controls?: ControlsInput;
}

export interface ShotDescriptor {
  shotId: string;
  origin: Vec3Data;
  direction: Vec3Data;
  /** Server source time actually displayed for the aimed remote rat. */
  viewAt?: number;
}

export type PickupTarget = 'case' | 'pickup';
export type PickupRejectReason = 'stale'|'unavailable'|'blocked'|'ineligible'|'too-far'|'invalid-target'|'rate-limited';
export type ShotResultOutcome = 'first-step'|'rat-body'|'rat-head'|'ironclad-reflect'|'case-contact'|'world-bounce'|'dispatch-contact'|'pressure-contact'|'fake-case'|'lifetime'|'capacity'|'reset'|'rejected';

export type ClientMessage = (
  | { type: 'join'; protocolVersion: number; name: string; appearance: RatAppearance; resumeToken?: string }
  | ({ type: 'updateMovement' } & MovementInput)
  | ({ type: 'shoot'; movement?: MovementInput } & ShotDescriptor)
  | { type:'pickupIntent'; interactionId:string; target:PickupTarget; targetId:string; generation:number; movement:MovementInput }
  | { type: 'hit'; victimId: string; damage: number }
  | { type: 'chaosAck'; stream: string; seq: number }
  | { type: 'deliveryAck'; stream: string; seq: number }
  | { type: 'ping'; sentAt: number }
  | { type: 'diagnostics'; report: Record<string, unknown> }
  /** Frame performance on the player's machine, for the city map only; authority never reads it. */
  | { type: 'perf'; report: PerfReport }
) & { deliveryAck?: {stream:string;seq:number} };

/** Why a rat was healed: a Quick Fix, Clean Bill, or a Most Wanted bounty. */
export type HealCause = 'pickup' | 'incident' | 'bounty';
/** A death nobody is credited with: a runaway case missile, or the harbour. */
export type EnvironmentCause = 'evidence-tampering' | 'drowned';
export type ServerMessage =
  | { type: 'chaos'; state: ChaosState }
  | {
      type: 'welcome';
      /** Private observation: player is a local camera avatar, absent from players. */
      observing?: true;
      matchRoom?: string;
      /** Private bearer credential; never included in public player/score data. */
      resumeToken?: string;
      id: string;
      player: PlayerData;
      players: Record<string, PlayerData>;
      round: RoundState;
      world: WorldSpec;
      protocolVersion: number;
      serverTime: number;
      /** Last authority-accepted input sequence, including reload resume. */
      movementSeq?: number;
      /** Dispatch roster for this room; the retired evidence incident is absent. */
      incidents?: IncidentId[];
    }
  | { type: 'currentPlayers'; players: Record<string, PlayerData> }
  | { type: 'playerJoined'; player: PlayerData }
  | { type: 'playersMoved'; players: MovementSample[] }
  | {
      type: 'playerMoved';
      /** Authoritative sample time; optional for older previews. */
      at?: number;
      player: Pick<
        PlayerData,
        'id' | 'x' | 'y' | 'z' | 'qx' | 'qy' | 'qz' | 'qw' | 'meshQx' | 'meshQy' | 'meshQz' | 'meshQw'
      >;
    }
  | {
      type: 'playerCorrected';
      at?: number;
      player: Pick<
        PlayerData,
        'id' | 'x' | 'y' | 'z' | 'qx' | 'qy' | 'qz' | 'qw' | 'meshQx' | 'meshQy' | 'meshQz' | 'meshQw'
      >;
    }
  | { type: 'playerShot'; shooterId: string; shotId: string; origin: Vec3Data; direction: Vec3Data; movement?:MovementSample;
      launch?: {at:number; balls:Array<{id:string; velocity:Vec3Data}>} }
  | { type:'shotResult'; shotId:string; ballId:string; outcome:ShotResultOutcome; at:number; tick:number; epoch:string;
      victimId?:string; damage?:number; point?:Vec3Data; normal?:Vec3Data; compensated?:boolean; fallback?:string;
      rewindMs?:number; targetDelta?:number }
  | { type:'pickupResult'; interactionId:string; target:PickupTarget; targetId:string; accepted:boolean; at:number; tick:number;
      epoch:string; playerId:string; pickup?:import('./pickups').PickupKind; effectUntil?:number; reason?:PickupRejectReason }
  | { type: 'playerDamaged'; id: string; hp: number; attackerId: string | null; cause?: EnvironmentCause }
  | { type: 'playerHealed'; id: string; hp: number; cause?: HealCause }
  | {
      type: 'playerDied';
      victimId: string;
      killerId: string | null;
      killerName: string | null;
      cause?: EnvironmentCause;
      victimName: string;
      respawnAt: number;
      incoming?: Vec3Data;
      incident?: boolean;
      headshot?: true;
      /** The credited killer's kill streak including this kill. */
      killerStreak?: number;
    }
  | { type: 'scoreboardUpdate'; scores: ScoreEntry[] }
  | { type: 'playerRespawn'; id: string; x: number; y: number; z: number; hp: number }
  | { type: 'playerLeft'; id: string }
  | { type: 'gameWon'; winnerId: string; winnerName: string; kills: number; resetAt: number; assignment?: AssignmentState; awards?: Award[]; lineup?: string[] }
  | { type: 'gameReset'; round: RoundState }
  | { type: 'pong'; sentAt: number; receivedAt: number }
  | { type: 'error'; message: string; code?: 'resume-unavailable' };

export type { WorldSpec };
