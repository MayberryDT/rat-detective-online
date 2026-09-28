import type {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {PRESSURE_TUNING,type LaunchMachine} from '../../src/shared/chaosState';

/** Drop `hits` cheese balls straight down onto a machine's red trigger at `now`,
 * then step past the full machine's hang so it fires. Returns the time after firing. */
export function pump(sim:ChaosSimulation,shooter:string,machine:LaunchMachine,now:number,hits:number=PRESSURE_TUNING.full):number {
    const t=machine.target;
    for(let i=0;i<hits;i++)sim.shoot(shooter,{shotId:`pump-${machine.id}-${now}-${i}`,origin:{x:t.x,y:t.y+2.5,z:t.z},direction:{x:0,y:-1,z:0}});
    sim.step(.01,now);sim.step(.01,now+20);sim.step(.01,now+40);
    const fired=now+40+PRESSURE_TUNING.blowMs;
    sim.step(.01,fired);
    return fired;
}
