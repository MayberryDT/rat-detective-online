export const MAX_HP = 3;
export const KILLS_TO_WIN = 20;
export const RESPAWN_DELAY_MS = 5_000;
export const WIN_DISPLAY_MS = 6_000;
export const DEFAULT_ROOM_NAME = 'public';

export type HatTypeName = 'fedora' | 'trilby' | 'porkpie';

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
}

export interface ScoreEntry {
  id: string;
  name: string;
  kills: number;
  deaths: number;
}

export type ClientMessage =
  | { type: 'join'; name: string; appearance: RatAppearance }
  | { type: 'updateMovement'; position: Vec3Data; rotation: QuatData; meshRotation: QuatData }
  | { type: 'shoot'; origin: Vec3Data; target: Vec3Data }
  | { type: 'hit'; victimId: string; damage: number }
  | { type: 'ping'; sentAt: number };

export type ServerMessage =
  | { type: 'welcome'; id: string; player: PlayerData }
  | { type: 'currentPlayers'; players: Record<string, PlayerData> }
  | { type: 'playerJoined'; player: PlayerData }
  | {
      type: 'playerMoved';
      player: Pick<
        PlayerData,
        'id' | 'x' | 'y' | 'z' | 'qx' | 'qy' | 'qz' | 'qw' | 'meshQx' | 'meshQy' | 'meshQz' | 'meshQw'
      >;
    }
  | { type: 'playerShot'; shooterId: string; origin: Vec3Data; target: Vec3Data }
  | { type: 'playerDamaged'; id: string; hp: number; attackerId: string }
  | { type: 'playerDied'; victimId: string; killerId: string; killerName: string; victimName: string }
  | { type: 'scoreboardUpdate'; scores: ScoreEntry[] }
  | { type: 'playerRespawn'; id: string; x: number; y: number; z: number; hp: number }
  | { type: 'playerLeft'; id: string }
  | { type: 'gameWon'; winnerId: string; winnerName: string; kills: number }
  | { type: 'gameReset' }
  | { type: 'pong'; sentAt: number; receivedAt: number }
  | { type: 'error'; message: string };
