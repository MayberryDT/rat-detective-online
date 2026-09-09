import { describe, expect, it } from 'vitest';
import type { RatAppearance } from '../../src/shared/networkProtocol';
import { createWorldSpec } from '../../src/shared/worldSpec';
import { GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import { worldSpawnPoints } from '../../src/shared/playerSpawns';
import {
  applyHit,
  buildScoreboard,
  createPlayer,
  playingRound,
  resetRound,
  resetRoundForWorld,
  spawnForWorld,
} from '../../src/worker/gameState';
import { RAT_SURNAMES, RAT_TITLES } from '../../src/shared/ratNames';

const appearance: RatAppearance = {
  hatType: 'fedora',
  hatColor: 0xdc4a3c,
  furColor: 0xe8b84d,
  coatColor: 0xbe4545,
};

describe('game state', () => {
  it.each([7, 20260907, 918273])('spreads twelve live players and round resets throughout world %s', seed => {
    const spec={seed,version:GRAYBOX_VERSION};
    const players=[] as ReturnType<typeof createPlayer>[];
    for (let i=0;i<12;i++) players.push(createPlayer(`${i}`,`${i}`,appearance,spawnForWorld(spec,()=>.4,players)));
    const assertSpread=()=>{
      for (let i=0;i<players.length;i++) for (let j=0;j<i;j++) {
        expect(Math.hypot(players[i].x-players[j].x,players[i].z-players[j].z)).toBeGreaterThan(60);
      }
      expect(Math.max(...players.map(p=>p.x))-Math.min(...players.map(p=>p.x))).toBeGreaterThan(260);
      expect(Math.max(...players.map(p=>p.z))-Math.min(...players.map(p=>p.z))).toBeGreaterThan(260);
    };
    assertSpread();
    const expected=players.map(p=>({x:p.x,y:p.y,z:p.z}));
    // Previous positions and death state must not influence the reset allocation.
    for (const p of players) {p.x=0;p.z=0;p.hp=0;p.kills=10;}
    resetRoundForWorld(players,spec,()=>.4);
    assertSpread();
    expect(players.map(p=>({x:p.x,y:p.y,z:p.z}))).toEqual(expected);
    expect(players.every(p=>p.hp===3&&p.kills===0)).toBe(true);
  });

  it('respawns away from living rats, ignoring the dead rat and its previous position',()=>{
    const spec={seed:20260907,version:GRAYBOX_VERSION};
    const pool=worldSpawnPoints(spec);
    const alive=createPlayer('alive','Alive',appearance,pool[0]);
    const dead=createPlayer('dead','Dead',appearance,pool[pool.length-1]);
    dead.hp=0;
    const spawn=spawnForWorld(spec,()=>0,[alive,dead],dead.id);
    const expectedDistance=Math.max(...pool.map(p=>(p.x-alive.x)**2+(p.z-alive.z)**2));
    expect((spawn.x-alive.x)**2+(spawn.z-alive.z)**2).toBe(expectedDistance);
    expect(spawn).toEqual(spawnForWorld(spec,()=>0,[alive]));
  });

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

  it.each(['human', 'bot-1'])('awards %s two scoreboard kills while holding the case, but only one death', (id) => {
    const shooter = createPlayer(id, id, appearance, { x: 0, y: 2, z: 0 });
    const victim = createPlayer('victim', 'Victim', appearance, { x: 0, y: 2, z: 0 });
    const players = new Map([[id, shooter], [victim.id, victim]]);
    expect(applyHit(players, id, victim.id, 1, true, id).killed).toBe(false);
    expect(shooter.kills).toBe(0);
    expect(applyHit(players, id, victim.id, 2, true, id).killed).toBe(true);
    expect(buildScoreboard(players.values())[0].kills).toBe(2);
    expect(victim.deaths).toBe(1);
    expect(applyHit(players, id, victim.id, 3, true, id).applied).toBe(false);
    expect(shooter.kills).toBe(2);
  });

  it('checks ownership at the lethal hit and wins when a double award crosses twenty', () => {
    const shooter = createPlayer('shooter', 'Shooter', appearance, { x: 0, y: 2, z: 0 });
    const victim = createPlayer('victim', 'Victim', appearance, { x: 0, y: 2, z: 0 });
    const players = new Map([[shooter.id, shooter], [victim.id, victim]]);
    applyHit(players, shooter.id, victim.id, 1, true, shooter.id);
    applyHit(players, shooter.id, victim.id, 2, true, victim.id);
    expect(shooter.kills).toBe(1);
    victim.hp = 3; shooter.kills = 19;
    expect(applyHit(players, shooter.id, victim.id, 3, true, shooter.id).roundWon).toBe(true);
    expect(shooter.kills).toBe(21);
    expect(victim.deaths).toBe(2);
  });

  it('fills a blank name from the detective bank', () => {
    const player = createPlayer('id', '  ', appearance, { x: 0, y: 2, z: 0 });
    const [title, surname] = player.name.split(' ');
    expect(RAT_TITLES).toContain(title);
    expect(RAT_SURNAMES).toContain(surname);
    expect(player.name.length).toBeLessThanOrEqual(20);
  });

  it('stamps a start time on a new playing round', () => {
    expect(playingRound(1000)).toEqual({ phase: 'playing', startedAt: 1000 });
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
