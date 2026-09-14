import {
  activeDestination,
  ASSIGNMENTS,
  ASSIGNMENT_DESTINATIONS,
  ASSIGNMENT_TUNING,
  type AssignmentState,
} from '../shared/assignments';
import {
  COMPANION_FRESHNESS_MS,
  type CompanionAssignment,
  type CompanionRoomPublication,
  type CompanionScore,
} from '../shared/companionStatus';
import { activeZone, JURISDICTION_TUNING, nextZone } from '../shared/jurisdiction';
import { JURISDICTION_ZONES } from '../shared/jurisdictionZones';
import type { PlayerData, RoundState } from '../shared/networkProtocol';

export const COMPANION_PROJECTION_MIN_MS = 500;

export function companionProjectionDue(now: number, lastProjectedAt: number, force = false): boolean {
  return force || now - lastProjectedAt >= COMPANION_PROJECTION_MIN_MS;
}

export interface CompanionProjectionInput {
  room: string;
  pool: string;
  generation: number;
  revision: number;
  observedAt: number;
  round: RoundState;
  assignment: AssignmentState;
  players: Iterable<PlayerData>;
  humanIds: ReadonlySet<string>;
  holderId: string | null;
}

function assignmentProjection(state: AssignmentState, round: RoundState, holder?: PlayerData): CompanionAssignment {
  const destinationId = activeDestination(state);
  const jurisdiction = state.jurisdiction;
  const zoneId = jurisdiction ? activeZone(jurisdiction) : undefined;
  const revealNext = jurisdiction && state.phase === 'active' &&
    jurisdiction.remainingMs <= JURISDICTION_TUNING.warningMs;
  const nextZoneId = revealNext ? nextZone(jurisdiction) : undefined;
  const clockRunning = round.phase === 'playing' && state.phase === 'active' &&
    (state.id === 'jurisdiction' || state.id === 'closing-time' && !!holder && holder.hp > 0);
  return {
    id: state.id,
    title: ASSIGNMENTS[state.id].title,
    phase: state.phase,
    remainingMs: state.id === 'closing-time' ? state.remainingMs : null,
    clockRunning,
    objectiveTarget: state.id === 'chain-of-custody' ? ASSIGNMENT_TUNING.deliveryTarget :
      state.id === 'jurisdiction' ? JURISDICTION_TUNING.targetMs / 1_000 :
      state.id === 'excessive-force' ? ASSIGNMENT_TUNING.caseKillTarget : null,
    objectiveUnit: state.id === 'chain-of-custody' ? 'deliveries' :
      state.id === 'jurisdiction' ? 'seconds' :
      state.id === 'excessive-force' ? 'case-kills' : 'last-holder',
    destination: destinationId ?
      { id: destinationId, label: ASSIGNMENT_DESTINATIONS[destinationId].label } : null,
    zone: zoneId ? { id: zoneId, label: JURISDICTION_ZONES[zoneId].label } : null,
    nextZone: nextZoneId ? { id: nextZoneId, label: JURISDICTION_ZONES[nextZoneId].label } : null,
    zoneRemainingMs: jurisdiction ? jurisdiction.remainingMs : null,
  };
}

function objectiveScore(state: AssignmentState, playerId: string): number | null {
  if (state.id === 'chain-of-custody') return state.deliveries[playerId] ?? 0;
  if (state.id === 'jurisdiction') return (state.jurisdiction?.heldMs[playerId] ?? 0) / 1_000;
  if (state.id === 'excessive-force') return state.caseKills[playerId] ?? 0;
  return null;
}

/** Build the bounded public projection from the same authoritative state used by gameplay. */
export function projectCompanionRoom(input: CompanionProjectionInput): CompanionRoomPublication {
  const players = [...input.players];
  const scores: CompanionScore[] = players.map(player => ({
    id: player.id,
    name: player.name,
    kills: player.kills,
    deaths: player.deaths,
    objectiveScore: objectiveScore(input.assignment, player.id),
  })).sort((a, b) => {
    const objective = (b.objectiveScore ?? -1) - (a.objectiveScore ?? -1);
    return objective || b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name);
  });
  const holder = input.holderId ? players.find(player => player.id === input.holderId) : undefined;
  return {
    pool: input.pool,
    room: input.room,
    observedAt: input.observedAt,
    expiresAt: input.observedAt + COMPANION_FRESHNESS_MS,
    generation: input.generation,
    revision: input.revision,
    players: players.length,
    humans: players.filter(player => input.humanIds.has(player.id)).length,
    roundId: input.assignment.roundId,
    assignment: assignmentProjection(input.assignment, input.round, holder),
    scores,
    holderName: holder?.name ?? null,
    result: input.assignment.result ? { ...input.assignment.result } : null,
  };
}

/** Observation timestamps and ordering stamps do not make gameplay state dirty. */
export function companionProjectionSignature(room: CompanionRoomPublication): string {
  const { observedAt: _observedAt, expiresAt: _expiresAt, generation: _generation,
    revision: _revision, ...state } = room;
  return JSON.stringify({
    ...state,
    assignment: {
      ...state.assignment,
      remainingMs: state.assignment.remainingMs === null ? null :
        Math.floor(state.assignment.remainingMs / 1_000),
      zoneRemainingMs: state.assignment.zoneRemainingMs === null ? null :
        Math.floor(state.assignment.zoneRemainingMs / 1_000),
    },
    scores: state.assignment.id === 'jurisdiction' ? state.scores.map(score => ({
      ...score,
      objectiveScore: score.objectiveScore === null ? null : Math.floor(score.objectiveScore),
    })) : state.scores,
  });
}
