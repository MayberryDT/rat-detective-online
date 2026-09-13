import {describe,expect,it} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {worldSpawnPoints} from '../../src/shared/playerSpawns';

const world={seed:341283204,version:2};

describe('human movement authority paths',()=>{
  it('allows ordinary first steps and landing motion from every production spawn',()=>{
    const simulation=new ChaosSimulation(new Map(),()=>{},undefined,world);
    for(const spawn of worldSpawnPoints(world)){
      expect(simulation.movementPathClear(spawn,{x:spawn.x+.9,y:spawn.y,z:spawn.z})).toBe(true);
      expect(simulation.movementPathClear(spawn,{x:spawn.x+.9,y:.6,z:spawn.z})).toBe(true);
    }
  });
});
