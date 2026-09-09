import {describe,it,expect} from 'vitest';
import {launcherVelocity,LAUNCH_BOUNDARY_MARGIN} from '../../src/shared/launcherVelocity';
import {LAUNCH_MACHINES,MAX_LAUNCH_SPEED} from '../../src/shared/chaosState';
import {CITY_BOUNDS,SEWER_FLOOR} from '../../src/shared/grayboxLayout';

function random(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
describe('random launcher impulses',()=>{
 it('varies heading and elevation for every machine while keeping its force character',()=>{
  for(const machine of LAUNCH_MACHINES){
   const rng=random(451),velocities=Array.from({length:50},()=>launcherVelocity(machine,rng));
   expect(new Set(velocities.map(v=>Math.atan2(v.z,v.x).toFixed(2))).size).toBeGreaterThan(20);
   expect(new Set(velocities.map(v=>v.y.toFixed(2))).size).toBeGreaterThan(20);
   for(const v of velocities){
    expect(v.y).toBeGreaterThanOrEqual(machine.velocity.y*.9);
    expect(v.y).toBeLessThanOrEqual(machine.velocity.y*1.06);
    expect(Math.hypot(v.x,v.z)).toBeLessThanOrEqual(Math.hypot(machine.velocity.x,machine.velocity.z)*1.06+1e-8);
    expect(Math.max(Math.abs(v.x),Math.abs(v.y),Math.abs(v.z))).toBeLessThan(MAX_LAUNCH_SPEED);
   }
  }
 });
 it('keeps complete undamped trajectories inside the city for all pad edges and worst allowed starting height',()=>{
  for(const machine of LAUNCH_MACHINES){
   const rng=random(7621);
   for(let launch=0;launch<100;launch++){
    const v=launcherVelocity(machine,rng);
    const flight=(v.y+Math.sqrt(v.y*v.y+50*(machine.pad.y+2-SEWER_FLOOR)))/25;
    for(let edge=0;edge<8;edge++){
     const angle=edge*Math.PI/4;
     const x=machine.pad.x+Math.cos(angle)*machine.pad.radius;
     const z=machine.pad.z+Math.sin(angle)*machine.pad.radius;
     for(let step=0;step<=20;step++){
      const time=flight*step/20;
      expect(x+v.x*time).toBeGreaterThanOrEqual(CITY_BOUNDS.min+LAUNCH_BOUNDARY_MARGIN-1e-7);
      expect(x+v.x*time).toBeLessThanOrEqual(CITY_BOUNDS.max-LAUNCH_BOUNDARY_MARGIN+1e-7);
      expect(z+v.z*time).toBeGreaterThanOrEqual(CITY_BOUNDS.min+LAUNCH_BOUNDARY_MARGIN-1e-7);
      expect(z+v.z*time).toBeLessThanOrEqual(CITY_BOUNDS.max-LAUNCH_BOUNDARY_MARGIN+1e-7);
     }
    }
   }
  }
 });
 it('is reproducible with an injected generator and bounds unlucky repeated outward headings',()=>{
  for(const machine of LAUNCH_MACHINES){
   expect(launcherVelocity(machine,random(12))).toEqual(launcherVelocity(machine,random(12)));
   for(const value of [0,.25,.5,.75,.999999]){
    const v=launcherVelocity(machine,()=>value);
    expect(Object.values(v).every(Number.isFinite)).toBe(true);
    const flight=(v.y+Math.sqrt(v.y*v.y+50*(machine.pad.y+2-SEWER_FLOOR)))/25;
    expect(machine.pad.x+v.x*flight).toBeGreaterThanOrEqual(CITY_BOUNDS.min+LAUNCH_BOUNDARY_MARGIN+machine.pad.radius-1e-7);
    expect(machine.pad.x+v.x*flight).toBeLessThanOrEqual(CITY_BOUNDS.max-LAUNCH_BOUNDARY_MARGIN-machine.pad.radius+1e-7);
    expect(machine.pad.z+v.z*flight).toBeGreaterThanOrEqual(CITY_BOUNDS.min+LAUNCH_BOUNDARY_MARGIN+machine.pad.radius-1e-7);
    expect(machine.pad.z+v.z*flight).toBeLessThanOrEqual(CITY_BOUNDS.max-LAUNCH_BOUNDARY_MARGIN-machine.pad.radius+1e-7);
   }
  }
 });
});
