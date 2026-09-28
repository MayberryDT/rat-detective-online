import {LAUNCH_PROFILES,OVERPRESSURE} from '../../src/shared/launcherVelocity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from 'cannon-es';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { CHAOS_TUNING as T, LAUNCH_MACHINES, PRESSURE_LAUNCH } from '../../src/shared/chaosState';
import { createPlayer } from '../../src/worker/gameState';

vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
/** The graybox is mocked empty, so a launched case needs real ground to land on. */
function addGround(sim:ChaosSimulation){
  const ground=new C.Body({mass:0,shape:new C.Plane(),position:new C.Vec3(0,0,0)});
  ground.quaternion.setFromEuler(-Math.PI/2,0,0);
  sim.world.addBody(ground);sim.targets.set(ground,{kind:'world'});
}
/** Trigger the machine that owns the pad by shooting its red control cap. */
function trigger(sim:ChaosSimulation,machine=PRESSURE_LAUNCH){
  sim.shoot('shooter',{shotId:'trigger',origin:{x:machine.target.x,y:machine.target.y,z:machine.target.z+1},direction:{x:0,y:0,z:-1}});
  sim.step(.01,1010);
}
function fixture(){
  const shooter=createPlayer('shooter','Shooter',appearance,{x:-50,y:20,z:0});
  const players=new Map([[shooter.id,shooter]]);
  const sim=new ChaosSimulation(players,()=>{});sim.step(0,1000);
  addGround(sim);
  return {sim,players,shooter};
}
/** Park the real case on a pad, loose, so the launcher can pick it up. */
function parkCaseOnPad(sim:ChaosSimulation,machine=PRESSURE_LAUNCH){
  sim.caseBody.position.set(machine.pad.x,machine.pad.y+1.3,machine.pad.z);
  sim.caseBody.velocity.setZero();sim.caseBody.updateAABB();
}

describe('launchable cases',()=>{
  beforeEach(()=>{vi.spyOn(Math,'random').mockReturnValue(0);});
  afterEach(()=>vi.restoreAllMocks());

  it('throws a loose case on the pad with the machine impulse',()=>{
    const {sim}=fixture();parkCaseOnPad(sim);
    trigger(sim);
    expect(sim.caseBody.velocity.y).toBeGreaterThanOrEqual(LAUNCH_PROFILES.pressure.lift[0]);
    // The impulse lands during the same tick's shot resolution, so the first
    // visible rise is one step later.
    const before=sim.caseBody.position.y;
    sim.step(1/60,1020);
    expect(sim.caseBody.position.y).toBeGreaterThan(before);
  });

  it('does not throw a case that is merely near the pad',()=>{
    const {sim}=fixture();
    sim.caseBody.position.set(PRESSURE_LAUNCH.pad.x+PRESSURE_LAUNCH.pad.radius+4,1.3,PRESSURE_LAUNCH.pad.z);
    sim.caseBody.velocity.setZero();sim.caseBody.updateAABB();
    trigger(sim);
    expect(sim.caseBody.velocity.y).toBeLessThan(1);
  });

  it('does not throw a case a rat is carrying',()=>{
    const {sim,shooter}=fixture();
    parkCaseOnPad(sim);
    Object.assign(shooter,{x:PRESSURE_LAUNCH.pad.x,y:PRESSURE_LAUNCH.pad.y,z:PRESSURE_LAUNCH.pad.z});
    sim.step(1/60,1010);expect(sim.caseHolderId).toBe(shooter.id);
    trigger(sim);
    // The carried case rides the carrier's hand; it is never independently thrown.
    expect(sim.caseHolderId).toBe(shooter.id);
  });

  it('survives the apex instead of blinking into recovery',()=>{
    const {sim}=fixture();parkCaseOnPad(sim);
    trigger(sim);
    // 3 seconds of flight covers the slow, high apex the watchdog used to eat.
    for(let i=0;i<180;i++)sim.step(1/60,1020+i*(1000/60));
    const state=sim.snapshot(false).case;
    expect(state.returningUntil).toBe(0);
    expect(state.p.y).toBeGreaterThan(2);
  });

  it('settles on the ground and becomes collectable again',()=>{
    const {sim}=fixture();parkCaseOnPad(sim);
    trigger(sim);
    // Fly the full arc, then a generous grace period on the ground.
    let now=1020;
    for(let i=0;i<900;i++){now+=1000/60;sim.step(1/60,now);}
    const state=sim.snapshot(false).case;
    expect(state.returningUntil).toBe(0);
    expect(state.p.y).toBeLessThan(3);
    expect(Math.hypot(state.v.x,state.v.y,state.v.z)).toBeLessThanOrEqual(T.casePickupMaxSpeed);
  });

  it('contains a launched case inside the city',()=>{
    const {sim}=fixture();parkCaseOnPad(sim);
    trigger(sim);
    let now=1020;
    for(let i=0;i<900;i++){now+=1000/60;sim.step(1/60,now);}
    const p=sim.snapshot(false).case.p;
    expect(p.x).toBeGreaterThanOrEqual(-196);
    expect(p.x).toBeLessThanOrEqual(166);
    expect(p.z).toBeGreaterThanOrEqual(-196);
    expect(p.z).toBeLessThanOrEqual(166);
  });

  it('every launcher throws its own pad case',()=>{
    for(const machine of LAUNCH_MACHINES){
      const {sim}=fixture();parkCaseOnPad(sim,machine);
      trigger(sim,machine);
      const [low,high]=LAUNCH_PROFILES[machine.kind].lift,lift=sim.caseBody.velocity.y;
      expect(lift>=low-1e-6&&lift<=high+1e-6||Math.abs(lift-OVERPRESSURE.lift)<1e-6,`${machine.id} should launch (${lift})`).toBe(true);
    }
  });
});
