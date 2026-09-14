import type { AssignmentId, AssignmentResult } from './assignments';

export const COMPANION_SCHEMA_VERSION = 1 as const;
export const COMPANION_DEFAULT_PAGE_SIZE = 16;
export const COMPANION_MAX_PAGE_SIZE = 32;
export const COMPANION_FRESHNESS_MS = 75_000;

export type CompanionObjectiveUnit = 'deliveries' | 'seconds' | 'case-kills' | 'last-holder';

export interface CompanionLocation {
  id: string;
  label: string;
}

export interface CompanionAssignment {
  id: AssignmentId;
  title: string;
  phase: 'briefing' | 'active' | 'suspended' | 'closed';
  remainingMs: number | null;
  clockRunning: boolean;
  objectiveTarget: number | null;
  objectiveUnit: CompanionObjectiveUnit;
  destination: CompanionLocation | null;
  zone: CompanionLocation | null;
  nextZone: CompanionLocation | null;
  zoneRemainingMs: number | null;
}

export interface CompanionScore {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  objectiveScore: number | null;
}

export interface CompanionResult extends Pick<AssignmentResult, 'winnerId' | 'winnerName' | 'at' | 'method' | 'posthumous'> {}

export interface CompanionRoom {
  room: string;
  observedAt: number;
  expiresAt: number;
  generation: number;
  revision: number;
  players: number;
  humans: number;
  roundId: string;
  assignment: CompanionAssignment;
  scores: CompanionScore[];
  holderName: string | null;
  result: CompanionResult | null;
}

/** Internal publication adds the admission pool used to reject private fixtures. */
export interface CompanionRoomPublication extends CompanionRoom {
  pool: string;
}

export interface CompanionStatusEnvelope {
  schemaVersion: typeof COMPANION_SCHEMA_VERSION;
  observedAt: number;
  rooms: CompanionRoom[];
  nextCursor: string | null;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const location = (value: unknown): value is CompanionLocation => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return text(candidate.id, 64) && text(candidate.label, 64);
};

export function isCompanionRoomPublication(value: unknown): value is CompanionRoomPublication {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const room = value as Record<string, unknown>;
  if (!text(room.room, 160) || !text(room.pool, 160) || !integer(room.observedAt) || !integer(room.expiresAt) ||
      room.expiresAt <= room.observedAt || !integer(room.generation) || room.generation < 1 ||
      !integer(room.revision) || room.revision < 1 || !integer(room.players) || room.players > 16 ||
      !integer(room.humans) || room.humans > room.players || !text(room.roundId, 64) ||
      !Array.isArray(room.scores) || room.scores.length !== room.players || room.scores.length > 16 ||
      !(room.holderName === null || text(room.holderName, 32))) return false;
  const assignment = room.assignment;
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) return false;
  const a = assignment as Record<string, unknown>;
  if (!['closing-time', 'chain-of-custody', 'excessive-force', 'jurisdiction'].includes(String(a.id)) ||
      !text(a.title, 40) || !['briefing', 'active', 'suspended', 'closed'].includes(String(a.phase)) ||
      !(a.remainingMs === null || finite(a.remainingMs) && a.remainingMs >= 0) ||
      typeof a.clockRunning !== 'boolean' ||
      !(a.objectiveTarget === null || finite(a.objectiveTarget) && a.objectiveTarget >= 0) ||
      !['deliveries', 'seconds', 'case-kills', 'last-holder'].includes(String(a.objectiveUnit)) ||
      !(a.destination === null || location(a.destination)) || !(a.zone === null || location(a.zone)) ||
      !(a.nextZone === null || location(a.nextZone)) ||
      !(a.zoneRemainingMs === null || finite(a.zoneRemainingMs) && a.zoneRemainingMs >= 0)) return false;
  const ids = new Set<string>();
  for (const score of room.scores) {
    if (!score || typeof score !== 'object' || Array.isArray(score)) return false;
    const s = score as Record<string, unknown>;
    if (!text(s.id, 64) || ids.has(s.id) || !text(s.name, 32) || !integer(s.kills) || !integer(s.deaths) ||
        !(s.objectiveScore === null || finite(s.objectiveScore) && s.objectiveScore >= 0)) return false;
    ids.add(s.id);
  }
  if (room.result !== null) {
    if (!room.result || typeof room.result !== 'object' || Array.isArray(room.result)) return false;
    const result = room.result as Record<string, unknown>;
    if (!text(result.winnerId, 64) || !text(result.winnerName, 32) || !finite(result.at) || result.at < 0 ||
        !['held', 'carried', 'kills', 'zone-held'].includes(String(result.method)) ||
        typeof result.posthumous !== 'boolean') return false;
  }
  return true;
}

export function companionPageSize(value: string | null): number | null {
  if (value === null || value === '') return COMPANION_DEFAULT_PAGE_SIZE;
  if (!/^\d{1,3}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= COMPANION_MAX_PAGE_SIZE ? parsed : null;
}

export function isCompanionCursor(value: string | null): value is string | null {
  return value === null || /^[a-z0-9-]{1,160}$/.test(value);
}

export function isPublicCompanionRoom(value: string, canonical: string): boolean {
  return value === canonical || new RegExp(
    `^${canonical}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
  ).test(value);
}
