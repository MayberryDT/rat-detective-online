import type { ChaosState } from './chaosState';
import type { WorldSpec } from './worldSpec';
import type { AssignmentState } from './assignments';

export const PROTOCOL_VERSION = 5;
export const MAX_HP = 3;
export const KILLS_TO_WIN = 20;
export const RESPAWN_DELAY_MS = 3_000;
export const WIN_DISPLAY_MS = 6_000;
export const DEFAULT_ROOM_NAME = 'public-live-v2';
/** Wire-format ceiling for private capacity experiments; not an admission limit. */
export const MAX_SCORE_ENTRIES = 100;
export const MAX_PLAYERS = 24;
/** Open sockets allowed, including clients that have not finished joining. */
export const MAX_CONNECTIONS = MAX_PLAYERS + 8;
export const MAX_MESSAGE_BYTES = 8_192;
export const MAX_SERVER_MESSAGE_BYTES = 65_536;

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
  /** Present while dead: authoritative respawn (or round-reset) deadline. */
  respawnAt?: number;
}

export interface ScoreEntry {
  id: string;
  name: string;
  kills: number;
  deaths: number;
}

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
  player: Pick<PlayerData, 'id' | 'x' | 'y' | 'z' | 'qx' | 'qy' | 'qz' | 'qw' | 'meshQx' | 'meshQy' | 'meshQz' | 'meshQw'>;
}

export interface ShotDescriptor {
  shotId: string;
  origin: Vec3Data;
  direction: Vec3Data;
}

export type ClientMessage =
  | { type: 'join'; protocolVersion: number; name: string; appearance: RatAppearance }
  | { type: 'updateMovement'; position: Vec3Data; rotation: QuatData; meshRotation: QuatData }
  | { type: 'shoot'; shotId: string; origin: Vec3Data; direction: Vec3Data }
  | { type: 'hit'; victimId: string; damage: number }
  | { type: 'chaosAck'; stream: string; seq: number }
  | { type: 'ping'; sentAt: number }
  | { type: 'diagnostics'; report: Record<string, unknown> };

export type ServerMessage =
  | { type: 'chaos'; state: ChaosState }
  | {
      type: 'welcome';
      matchRoom?: string;
      id: string;
      player: PlayerData;
      players: Record<string, PlayerData>;
      round: RoundState;
      world: WorldSpec;
      protocolVersion: number;
      serverTime: number;
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
  | { type: 'playerShot'; shooterId: string; shotId: string; origin: Vec3Data; direction: Vec3Data }
  | { type: 'playerDamaged'; id: string; hp: number; attackerId: string }
  | {
      type: 'playerDied';
      victimId: string;
      killerId: string;
      killerName: string;
      victimName: string;
      respawnAt: number;
      incoming?: Vec3Data;
      incident?: boolean;
    }
  | { type: 'scoreboardUpdate'; scores: ScoreEntry[] }
  | { type: 'playerRespawn'; id: string; x: number; y: number; z: number; hp: number }
  | { type: 'playerLeft'; id: string }
  | { type: 'gameWon'; winnerId: string; winnerName: string; kills: number; resetAt: number; assignment?: AssignmentState }
  | { type: 'gameReset'; round: RoundState }
  | { type: 'pong'; sentAt: number; receivedAt: number }
  | { type: 'error'; message: string };

export type { WorldSpec };
