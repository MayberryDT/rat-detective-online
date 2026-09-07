import {
  KILLS_TO_WIN,
  MAX_HP,
  type PlayerData,
  type RatAppearance,
  type RoundState,
  type ScoreEntry,
  type Vec3Data,
} from '../shared/networkProtocol';
import { generateRandomName } from '../shared/ratNames';
import { createSafeSpawn, type WorldSpec } from '../shared/worldSpec';

export function spawnForWorld(spec: WorldSpec, random = Math.random): Vec3Data {
  return createSafeSpawn(spec, random);
}

export function createPlayer(
  id: string,
  name: string,
  appearance: RatAppearance,
  spawn: Vec3Data,
): PlayerData {
  return {
    id,
    name: name.trim() || generateRandomName(),
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    meshQx: 0,
    meshQy: 0,
    meshQz: 0,
    meshQw: 1,
    hp: MAX_HP,
    kills: 0,
    deaths: 0,
    ...appearance,
  };
}

export function buildScoreboard(players: Iterable<PlayerData>): ScoreEntry[] {
  return Array.from(players)
    .map((player) => ({
      id: player.id,
      name: player.name,
      kills: player.kills,
      deaths: player.deaths,
    }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
}

export function clampDamage(damage: number): number {
  if (!Number.isFinite(damage)) return 0;
  return Math.max(0, Math.min(3, Math.trunc(damage)));
}

export interface HitResult {
  applied: boolean;
  killed: boolean;
  roundWon: boolean;
  damage: number;
}

export function applyHit(
  players: Map<string, PlayerData>,
  shooterId: string,
  victimId: string,
  requestedDamage: number,
): HitResult {
  const shooter = players.get(shooterId);
  const victim = players.get(victimId);
  const damage = clampDamage(requestedDamage);

  if (!shooter || !victim || shooterId === victimId || damage <= 0) {
    return { applied: false, killed: false, roundWon: false, damage: 0 };
  }

  if (shooter.hp <= 0 || victim.hp <= 0) {
    return { applied: false, killed: false, roundWon: false, damage: 0 };
  }

  victim.hp = Math.max(0, victim.hp - damage);

  if (victim.hp > 0) {
    return { applied: true, killed: false, roundWon: false, damage };
  }

  shooter.kills += 1;
  victim.deaths += 1;

  return {
    applied: true,
    killed: true,
    roundWon: shooter.kills >= KILLS_TO_WIN,
    damage,
  };
}

export function respawnPlayer(player: PlayerData, spawn: Vec3Data): PlayerData {
  player.hp = MAX_HP;
  player.x = spawn.x;
  player.y = spawn.y;
  player.z = spawn.z;
  player.qx = 0;
  player.qy = 0;
  player.qz = 0;
  player.qw = 1;
  player.meshQx = 0;
  player.meshQy = 0;
  player.meshQz = 0;
  player.meshQw = 1;
  delete player.respawnAt;
  return player;
}

export function resetRound(players: Iterable<PlayerData>, spawnFor: (id: string) => Vec3Data): PlayerData[] {
  const resetPlayers: PlayerData[] = [];
  for (const player of players) {
    player.kills = 0;
    player.deaths = 0;
    resetPlayers.push(respawnPlayer(player, spawnFor(player.id)));
  }
  return resetPlayers;
}

export function playingRound(startedAt = Date.now()): RoundState {
  return { phase: 'playing', startedAt };
}

export function wonRound(
  winnerId: string,
  winnerName: string,
  kills: number,
  resetAt: number,
  startedAt?: number,
): RoundState {
  return {
    phase: 'won',
    winnerId,
    winnerName,
    kills,
    resetAt,
    ...(startedAt !== undefined ? { startedAt } : {}),
  };
}
