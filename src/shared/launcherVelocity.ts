import { CITY_BOUNDS, SEWER_FLOOR } from './grayboxLayout';
import type { LaunchMachine } from './chaosState';
import type { Vec3Data } from './networkProtocol';

// Directed incidents retain full-flight containment independently of vertical pads.
export const LAUNCH_BOUNDARY_MARGIN = 12;
const GRAVITY = 25;

/** Every pad launches straight up. Horizontal travel belongs to the rat's steering. */
export function launcherVelocity(machine:LaunchMachine):Vec3Data {
    return {x:0,y:machine.velocity.y,z:0};
}

/** Directed incident impulses use the same full-flight city containment as pads. */
export function boundedIncidentVelocity(position:Vec3Data, velocity:Vec3Data):Vec3Data {
    const y=Math.max(0,Math.min(75,velocity.y));
    const flight=(y+Math.sqrt(y*y+2*GRAVITY*Math.max(0,position.y+2-SEWER_FLOOR)))/GRAVITY;
    const min=CITY_BOUNDS.min+LAUNCH_BOUNDARY_MARGIN,max=CITY_BOUNDS.max-LAUNCH_BOUNDARY_MARGIN;
    const component=(p:number,v:number)=>{
        const speed=Math.max(-75,Math.min(75,v));
        const travel=speed>0?max-p:p-min;
        return speed*Math.max(0,Math.min(1,travel/(Math.abs(speed)*flight||1)));
    };
    return {x:component(position.x,velocity.x),y,z:component(position.z,velocity.z)};
}
