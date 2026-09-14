import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createAssignment } from '../../src/shared/assignments';
import {
  COMPANION_FRESHNESS_MS,
  COMPANION_SCHEMA_VERSION,
  isCompanionRoomPublication,
  type CompanionRoomPublication,
} from '../../src/shared/companionStatus';
import { JURISDICTION_TUNING } from '../../src/shared/jurisdiction';
import type { PlayerData, RoundState } from '../../src/shared/networkProtocol';
import { DEFAULT_ROOM_NAME } from '../../src/shared/networkProtocol';
import { Matchmaker } from '../../src/worker/Matchmaker';
import {
  COMPANION_PROJECTION_MIN_MS,
  companionProjectionDue,
  projectCompanionRoom,
} from '../../src/worker/companionStatus';

const appearance = { hatType: 'fedora' as const, hatColor: 1, furColor: 2, coatColor: 3 };
function player(id: string, name: string, kills = 0, deaths = 0): PlayerData {
  return {
    id, name, kills, deaths, hp: 3, x: 0, y: 0, z: 0,
    qx: 0, qy: 0, qz: 0, qw: 1, meshQx: 0, meshQy: 0, meshQz: 0, meshQw: 1,
    ...appearance,
  };
}

const round = (assignment: ReturnType<typeof createAssignment>): RoundState =>
  ({ phase: assignment.phase === 'closed' ? 'won' : 'playing', startedAt: assignment.revealedAt, assignment });

describe('companion projection', () => {
  it('projects all assignment objectives without revealing a future zone early', () => {
    const now = 10_000;
    const a = player('a', 'Ada', 4, 1);
    const b = player('b', 'Basil', 2, 3);
    const base = {
      room: 'public-live-v2',
      pool: 'public-live-v2',
      generation: 1,
      revision: 1,
      observedAt: now,
      players: [a, b],
      humanIds: new Set(['a']),
      holderId: 'b',
    };

    const chain = createAssignment('chain-of-custody', now, 'chain-round', () => 0);
    chain.phase = 'active';
    chain.deliveries.a = 2;
    const paper = projectCompanionRoom({ ...base, round: round(chain), assignment: chain });
    expect(paper).toMatchObject({
      players: 2, humans: 1, holderName: 'Basil', roundId: 'chain-round',
      assignment: {
        id: 'chain-of-custody', title: 'PAPER CHASE', objectiveTarget: 3,
        objectiveUnit: 'deliveries', destination: { id: chain.destinations[0] },
        clockRunning: false,
      },
    });
    expect(paper.scores.find(score => score.id === 'a')?.objectiveScore).toBe(2);

    const force = createAssignment('excessive-force', now, 'force-round');
    force.phase = 'active';
    force.caseKills.b = 7;
    const excessive = projectCompanionRoom({ ...base, round: round(force), assignment: force });
    expect(excessive.assignment).toMatchObject({
      objectiveTarget: 10, objectiveUnit: 'case-kills', destination: null, zone: null,
    });
    expect(excessive.scores[0]).toMatchObject({ id: 'b', objectiveScore: 7 });

    const closing = createAssignment('closing-time', now, 'closing-round');
    closing.phase = 'active';
    closing.remainingMs = 54_321;
    const clock = projectCompanionRoom({ ...base, round: round(closing), assignment: closing });
    expect(clock.assignment).toMatchObject({
      remainingMs: 54_321, objectiveTarget: null, objectiveUnit: 'last-holder', clockRunning: true,
    });
    expect(projectCompanionRoom({
      ...base, holderId: null, round: round(closing), assignment: closing,
    }).assignment.clockRunning).toBe(false);
    b.hp = 0;
    expect(projectCompanionRoom({
      ...base, round: round(closing), assignment: closing,
    }).assignment.clockRunning).toBe(false);
    b.hp = 3;
    closing.phase = 'suspended';
    expect(projectCompanionRoom({
      ...base, round: round(closing), assignment: closing,
    }).assignment.clockRunning).toBe(false);
    closing.phase = 'closed';
    expect(projectCompanionRoom({
      ...base, round: round(closing), assignment: closing,
    }).assignment.clockRunning).toBe(false);

    const jurisdiction = createAssignment('jurisdiction', now, 'zone-round', () => 0);
    jurisdiction.phase = 'active';
    jurisdiction.jurisdiction!.heldMs.a = 12_500;
    jurisdiction.jurisdiction!.remainingMs = JURISDICTION_TUNING.warningMs + 1;
    const hidden = projectCompanionRoom({ ...base, round: round(jurisdiction), assignment: jurisdiction });
    expect(hidden.assignment).toMatchObject({
      objectiveTarget: 60, objectiveUnit: 'seconds', zone: expect.any(Object),
      nextZone: null, zoneRemainingMs: JURISDICTION_TUNING.warningMs + 1, clockRunning: true,
    });
    expect(hidden.scores.find(score => score.id === 'a')?.objectiveScore).toBe(12.5);
    jurisdiction.jurisdiction!.remainingMs = JURISDICTION_TUNING.warningMs;
    const announced = projectCompanionRoom({ ...base, round: round(jurisdiction), assignment: jurisdiction });
    expect(announced.assignment.nextZone).toEqual(expect.any(Object));
  });

  it('publishes only committed results and freezes suspended clocks', () => {
    const now = 50_000;
    const winner = player('winner', 'Winner');
    const assignment = createAssignment('excessive-force', now, 'result-round');
    assignment.phase = 'closed';
    assignment.caseKills.winner = 10;
    assignment.result = {
      winnerId: winner.id, winnerName: winner.name, at: now + 0.5,
      method: 'kills', posthumous: false,
    };
    const projected = projectCompanionRoom({
      room: 'public-live-v2', pool: 'public-live-v2', generation: 3, revision: 8,
      observedAt: now, round: round(assignment), assignment, players: [winner],
      humanIds: new Set([winner.id]), holderId: null,
    });
    expect(projected.result).toEqual(assignment.result);
    expect(isCompanionRoomPublication(projected)).toBe(true);
    expect(projected.assignment.clockRunning).toBe(false);
    expect(projected.expiresAt).toBe(now + COMPANION_FRESHNESS_MS);
  });

  it('bounds projection work on a 30 Hz active tick', () => {
    let lastProjectedAt = 0;
    let projections = 0;
    for (let now = 1; now <= 20_000; now += 1_000 / 30) {
      if (!companionProjectionDue(now, lastProjectedAt)) continue;
      lastProjectedAt = now;
      projections++;
    }
    expect(projections).toBeLessThanOrEqual(Math.ceil(20_000 / COMPANION_PROJECTION_MIN_MS));
    expect(companionProjectionDue(1, 0, true)).toBe(true);
  });
});

function publication(room: string, generation: number, revision: number, observedAt: number,
  pool = 'public-live-v2'): CompanionRoomPublication {
  const assignment = createAssignment('chain-of-custody', observedAt, `round-${room}`, () => 0);
  assignment.phase = 'active';
  return projectCompanionRoom({
    room, pool, generation, revision, observedAt, round: round(assignment), assignment,
    players: [player(`id-${room}`, `Rat ${room.slice(-1)}`)], humanIds: new Set([`id-${room}`]),
    holderId: null,
  });
}

describe('companion directory', () => {
  it('stores a committed result at a fractional simulation timestamp', async () => {
    const directory = env.MATCHMAKER.getByName(`directory-${crypto.randomUUID()}`);
    const now = Date.now();
    const win = publication(DEFAULT_ROOM_NAME, 1, 1, now);
    win.assignment.phase = 'closed';
    win.assignment.clockRunning = false;
    win.result = {
      winnerId: win.scores[0].id,
      winnerName: win.scores[0].name,
      at: now + 0.5,
      method: 'carried',
      posthumous: false,
    };
    expect(await directory.publishCompanion(win)).toBe(true);
    const page = await directory.companionStatus(null, 16, now);
    expect(page.rooms[0].result?.at).toBe(now + 0.5);
  });

  it('rejects private publications and preserves newer generations and revisions', async () => {
    const directory = env.MATCHMAKER.getByName(`directory-${crypto.randomUUID()}`);
    const now = Date.now();
    const publicRoom = `${DEFAULT_ROOM_NAME}-00000000-0000-4000-8000-000000000001`;
    expect(await directory.publishCompanion(publication('private-room', 1, 1, now, 'private-pool'))).toBe(false);
    expect(await directory.publishCompanion(publication(publicRoom, 1, 2, now))).toBe(true);
    expect(await directory.publishCompanion(publication(publicRoom, 1, 1, now + 1))).toBe(false);
    expect(await directory.publishCompanion(publication(publicRoom, 2, 1, now + 2))).toBe(true);
    await directory.removeCompanion(publicRoom, 1, 99);
    let page = await directory.companionStatus(null, 16, now);
    expect(page.rooms).toHaveLength(1);
    expect(page.rooms[0]).toMatchObject({ generation: 2, revision: 1 });
    await directory.retire(publicRoom, DEFAULT_ROOM_NAME, 2, 1);
    expect(await directory.publishCompanion(publication(publicRoom, 1, 99, now + 3))).toBe(false);
    expect(await directory.publishCompanion(publication(publicRoom, 2, 1, now + 4))).toBe(false);
    page = await directory.companionStatus(null, 16, now);
    expect(page.rooms).toHaveLength(0);
    await runInDurableObject(directory, (_instance: Matchmaker, ctx) => {
      expect(ctx.storage.sql.exec<{ name: string }>(
        'SELECT name FROM rooms WHERE name = ?', publicRoom,
      ).toArray()).toHaveLength(0);
    });
  });

  it('expires summaries and paginates a bounded, stable room order', async () => {
    const directory = env.MATCHMAKER.getByName(`directory-${crypto.randomUUID()}`);
    const now = Date.now();
    const names = [
      DEFAULT_ROOM_NAME,
      `${DEFAULT_ROOM_NAME}-00000000-0000-4000-8000-000000000001`,
      `${DEFAULT_ROOM_NAME}-00000000-0000-4000-8000-000000000002`,
    ];
    for (const name of names) {
      await directory.publishCompanion(publication(name, 1, 1, now));
    }
    await directory.publishCompanion(publication(
      `${DEFAULT_ROOM_NAME}-00000000-0000-4000-8000-000000000003`,
      1, 1, now - COMPANION_FRESHNESS_MS - 1,
    ));
    const first = await directory.companionStatus(null, 2, now);
    expect(first).toMatchObject({
      schemaVersion: COMPANION_SCHEMA_VERSION,
      observedAt: now,
      rooms: [{ room: names[0] }, { room: names[1] }],
      nextCursor: names[1],
    });
    const second = await directory.companionStatus(first.nextCursor, 2, now);
    expect(second.rooms.map(room => room.room)).toEqual([names[2]]);
    expect(second.nextCursor).toBeNull();
  });
});
