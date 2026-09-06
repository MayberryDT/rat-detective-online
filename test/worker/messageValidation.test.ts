import { describe, expect, it } from 'vitest';
import {
  MAX_HP,
  MAX_SERVER_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  type PlayerData,
  type ServerMessage,
} from '../../src/shared/networkProtocol';
import { isSupportedWorldVersion, parseClientMessage, parseServerMessage } from '../../src/shared/messageValidation';
import { WORLD_LAYOUT_VERSION, createWorldSpec } from '../../src/shared/worldSpec';

const appearance = {
  hatType: 'fedora' as const,
  hatColor: 0xdc4a3c,
  furColor: 0xe8b84d,
  coatColor: 0xbe4545,
};

function player(id: string, overrides: Partial<PlayerData> = {}): PlayerData {
  return {
    id,
    name: `Rat ${id}`,
    x: 1,
    y: 2,
    z: 3,
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
    ...overrides,
  };
}

describe('parseClientMessage', () => {
  it('requires a protocol version on join and a shot descriptor on shoot', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'join', name: 'A', appearance }))).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({
          type: 'join',
          protocolVersion: PROTOCOL_VERSION,
          name: 'A',
          appearance,
        }),
      ),
    ).toMatchObject({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'A' });

    expect(
      parseClientMessage(JSON.stringify({ type: 'shoot', origin: { x: 1, y: 2, z: 3 }, target: { x: 4, y: 5, z: 6 } })),
    ).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({
          type: 'shoot',
          shotId: 'shot-1',
          origin: { x: 1, y: 2, z: 3 },
          direction: { x: 0, y: 0, z: 1 },
        }),
      ),
    ).toMatchObject({ type: 'shoot', shotId: 'shot-1' });
  });

  it('rejects non-finite vectors instead of coercing them', () => {
    expect(
      parseClientMessage(
        JSON.stringify({
          type: 'updateMovement',
          position: { x: 1, y: Number.NaN, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          meshRotation: { x: 0, y: 0, z: 0, w: 1 },
        }),
      ),
    ).toBeNull();
  });
});

describe('parseServerMessage', () => {
  it('parses a full-room welcome snapshot larger than the inbound client cap', () => {
    const players: Record<string, PlayerData> = {};
    for (let i = 0; i < 24; i++) {
      const id = `player-${i.toString().padStart(2, '0')}-${'x'.repeat(48)}`.slice(0, 64);
      players[id] = player(id, {
        name: `Anonymous Rat ${i.toString().padStart(2, '0')}`.padEnd(32, '!'),
        hp: i === 3 ? 0 : MAX_HP,
        respawnAt: i === 3 ? 1_700_000_000_000 : undefined,
        kills: i,
      });
    }
    const self = Object.values(players)[0];
    const welcome: ServerMessage = {
      type: 'welcome',
      id: self.id,
      player: self,
      players,
      round: { phase: 'playing' },
      world: createWorldSpec(42),
      protocolVersion: PROTOCOL_VERSION,
      serverTime: 1_700_000_000_100,
    };
    const raw = JSON.stringify(welcome);
    expect(raw.length).toBeGreaterThan(8_192);
    expect(raw.length).toBeLessThan(MAX_SERVER_MESSAGE_BYTES);

    const parsed = parseServerMessage(raw);
    expect(parsed?.type).toBe('welcome');
    if (parsed?.type !== 'welcome') return;
    expect(Object.keys(parsed.players)).toHaveLength(24);
    const deadId = Object.keys(parsed.players).find((id) => parsed.players[id].hp === 0);
    expect(deadId).toBeTruthy();
    expect(parsed.players[deadId!]?.respawnAt).toBe(1_700_000_000_000);
    expect(parsed.world.version).toBe(WORLD_LAYOUT_VERSION);
    expect(isSupportedWorldVersion(parsed.world.version)).toBe(true);
  });

  it('returns mismatched protocol/world versions so the client can show an error', () => {
    const self = player('p1');
    const parsed = parseServerMessage({
      type: 'welcome',
      id: 'p1',
      player: self,
      players: { p1: self },
      round: { phase: 'playing' },
      world: { seed: 1, version: 99 },
      protocolVersion: 99,
      serverTime: 1,
    });
    expect(parsed?.type).toBe('welcome');
    if (parsed?.type !== 'welcome') return;
    expect(parsed.protocolVersion).toBe(99);
    expect(parsed.world.version).toBe(99);
    expect(isSupportedWorldVersion(parsed.world.version)).toBe(false);
  });

  it('requires shot direction and death deadlines', () => {
    expect(
      parseServerMessage({
        type: 'playerShot',
        shooterId: 'a',
        origin: { x: 1, y: 2, z: 3 },
        target: { x: 4, y: 5, z: 6 },
      }),
    ).toBeNull();
    expect(
      parseServerMessage({
        type: 'playerDied',
        victimId: 'a',
        killerId: 'b',
        killerName: 'B',
        victimName: 'A',
      }),
    ).toBeNull();
    expect(
      parseServerMessage({
        type: 'playerDied',
        victimId: 'a',
        killerId: 'b',
        killerName: 'B',
        victimName: 'A',
        respawnAt: 123,
      }),
    ).toMatchObject({ type: 'playerDied', respawnAt: 123 });
  });

  it('parses playerCorrected poses', () => {
    expect(
      parseServerMessage({
        type: 'playerCorrected',
        player: {
          id: 'a',
          x: 2000,
          y: 2,
          z: 0,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          meshQx: 0,
          meshQy: 0,
          meshQz: 0,
          meshQw: 1,
        },
      }),
    ).toMatchObject({ type: 'playerCorrected', player: { id: 'a', x: 2000 } });
  });
});
