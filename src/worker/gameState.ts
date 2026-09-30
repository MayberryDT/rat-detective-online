import type { AssignmentState } from '../shared/assignments';
import { activeZone } from '../shared/jurisdiction';
import { zoneSpawnExcluded } from '../shared/jurisdictionZones';
const spawnFilter=(a?:AssignmentState)=>a?.jurisdiction?(p:Vec3Data)=>!zoneSpawnExcluded(activeZone(a.jurisdiction!),p):undefined;
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
import type { WorldSpec } from '../shared/worldSpec';
import { choosePlayerSpawn, worldSpawnPoints } from '../shared/playerSpawns';

/** All Units: respawn among the `choices` supported spawn points nearest the action (never closer than `min`). */
const ALL_UNITS = { min: 10, choices: 12 };

/** `near`: during All Units, respawn right beside the action instead of far from everyone. */
export function spawnForWorld(spec: WorldSpec, random = Math.random, players: Iterable<PlayerData> = [], excludeId?: string, assignment?:AssignmentState, near?:Vec3Data): Vec3Data {
  const allowed = spawnFilter(assignment);
  if (near) {
    // Nearest by true distance, so a case down in the sewer pulls respawns to the nearest street above it.
    const away = (p: Vec3Data) => Math.hypot(p.x - near.x, (p.y - near.y) * 2, p.z - near.z);
    const ring = worldSpawnPoints(spec).filter(p => (!allowed || allowed(p)) && Math.hypot(p.x - near.x, p.z - near.z) >= ALL_UNITS.min)
      .sort((a, b) => away(a) - away(b)).slice(0, ALL_UNITS.choices);
    if (ring.length) {
      // Beside the action, but on the ring point farthest from any living rat.
      const living = [...players].filter(p => p.hp > 0 && p.id !== excludeId), start = Math.min(ring.length - 1, Math.floor(random() * ring.length));
      let best = ring[start]!, bestDistance = -1;
      for (let i = 0; i < ring.length; i++) {
        const point = ring[(start + i) % ring.length]!;
        let nearest = Infinity;
        for (const player of living) nearest = Math.min(nearest, (player.x - point.x) ** 2 + (player.z - point.z) ** 2);
        if (nearest > bestDistance) { best = point; bestDistance = nearest; }
      }
      return { ...best };
    }
  }
  return choosePlayerSpawn(spec, [...players].filter(p => p.hp > 0 && p.id !== excludeId), random, allowed);
}

/** A new round reserves its new positions, never the previous round's corpses. */
export function resetRoundForWorld(players: Iterable<PlayerData>, spec: WorldSpec, random = Math.random, assignment?:AssignmentState): PlayerData[] {
  const assigned: Vec3Data[] = [];
  return resetRound(players, () => {
    const spawn=choosePlayerSpawn(spec,assigned,random,spawnFilter(assignment));
    assigned.push(spawn);
    return spawn;
  });
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
  return Math.max(0, Math.min(MAX_HP, Math.trunc(damage)));
}

export interface HitResult {
  applied: boolean;
  killed: boolean;
  roundWon: boolean;
  damage: number;
}

export function applyHit(
  players: Map<string, PlayerData>,
  shooterId: string | null,
  victimId: string,
  requestedDamage: number,
  allowPosthumous = false,
  caseHolderId: string | null = null,
  assignmentMode = false,
  allowSelfDamage = false,
): HitResult {
  const shooter = shooterId === null ? undefined : players.get(shooterId);
  const victim = players.get(victimId);
  const damage = clampDamage(requestedDamage);

  const selfHit = shooterId === victimId;
  if ((shooterId !== null && !shooter) || !victim || (selfHit && !(allowPosthumous && allowSelfDamage)) || damage <= 0) {
    return { applied: false, killed: false, roundWon: false, damage: 0 };
  }

  if ((!allowPosthumous && shooter && shooter.hp <= 0) || victim.hp <= 0) {
    return { applied: false, killed: false, roundWon: false, damage: 0 };
  }

  victim.hp = Math.max(0, victim.hp - damage);

  if (victim.hp > 0) {
    return { applied: true, killed: false, roundWon: false, damage };
  }

  // Ownership comes from the authoritative simulation at kill resolution. A kill
  // streak counts kills (not case-holder points) in one life, so a dead rat's
  // ball still in flight scores but starts no streak.
  if (shooter && !selfHit) {
    shooter.kills += !assignmentMode && shooterId === caseHolderId ? 2 : 1;
    if (shooter.hp > 0) shooter.streak = (shooter.streak ?? 0) + 1;
  }
  victim.deaths += 1;
  delete victim.streak;

  return {
    applied: true,
    killed: true,
    roundWon: !!shooter && !selfHit && !assignmentMode && shooter.kills >= KILLS_TO_WIN,
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

/** A new round's clean record: no kills, deaths or streak. */
export function clearRecord(player: PlayerData): void {
  player.kills = 0;
  player.deaths = 0;
  delete player.streak;
}

export function resetRound(players: Iterable<PlayerData>, spawnFor: (id: string) => Vec3Data): PlayerData[] {
  const resetPlayers: PlayerData[] = [];
  for (const player of players) {
    clearRecord(player);
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
