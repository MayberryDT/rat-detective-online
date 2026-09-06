import { describe, expect, it } from 'vitest';
import type { RatAppearance } from '../../src/shared/networkProtocol';
import { createWorldSpec } from '../../src/shared/worldSpec';
import {
  applyHit,
  buildScoreboard,
  createPlayer,
  resetRound,
  spawnForWorld,
} from '../../src/worker/gameState';

const appearance: RatAppearance = {
  hatType: 'fedora',
  hatColor: 0xdc4a3c,
  furColor: 0xe8b84d,
  coatColor: 0xbe4545,
};

describe('game state', () => {
  it('creates finite safe spawns for a shared world spec', () => {
    const spec = createWorldSpec(7);
    const spawn = spawnForWorld(spec, () => 0.1);

    expect(spawn.y).toBe(2);
    expect(Number.isFinite(spawn.x)).toBe(true);
    expect(Number.isFinite(spawn.z)).toBe(true);
  });

  it('sorts the scoreboard by kills, deaths, then name', () => {
    const players = [
      createPlayer('b', 'Beta', appearance, { x: 0, y: 2, z: 0 }),
      createPlayer('a', 'Alpha', appearance, { x: 0, y: 2, z: 0 }),
      createPlayer('c', 'Charlie', appearance, { x: 0, y: 2, z: 0 }),
    ];
    players[0].kills = 2;
    players[0].deaths = 3;
    players[1].kills = 2;
    players[1].deaths = 1;
    players[2].kills = 1;

    expect(buildScoreboard(players).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('applies bounded damage and records kills/deaths', () => {
    const players = new Map([
      ['shooter', createPlayer('shooter', 'Shooter', appearance, { x: 0, y: 2, z: 0 })],
      ['victim', createPlayer('victim', 'Victim', appearance, { x: 0, y: 2, z: 0 })],
    ]);

    const result = applyHit(players, 'shooter', 'victim', 99);

    expect(result).toEqual({ applied: true, killed: true, roundWon: false, damage: 3 });
    expect(players.get('shooter')?.kills).toBe(1);
    expect(players.get('victim')?.deaths).toBe(1);
    expect(players.get('victim')?.hp).toBe(0);
  });

  it('ignores self hits and dead shooters', () => {
    const shooter = createPlayer('shooter', 'Shooter', appearance, { x: 0, y: 2, z: 0 });
    const victim = createPlayer('victim', 'Victim', appearance, { x: 0, y: 2, z: 0 });
    const players = new Map([
      ['shooter', shooter],
      ['victim', victim],
    ]);

    expect(applyHit(players, 'shooter', 'shooter', 1).applied).toBe(false);

    shooter.hp = 0;
    expect(applyHit(players, 'shooter', 'victim', 1).applied).toBe(false);
    expect(victim.hp).toBe(3);
  });

  it('resets round stats and respawns players', () => {
    const first = createPlayer('first', 'First', appearance, { x: 0, y: 2, z: 0 });
    first.kills = 4;
    first.deaths = 2;
    first.hp = 0;

    const resetPlayers = resetRound([first], () => ({ x: 9, y: 2, z: -9 }));

    expect(resetPlayers[0]).toMatchObject({ kills: 0, deaths: 0, hp: 3, x: 9, y: 2, z: -9 });
  });
});
