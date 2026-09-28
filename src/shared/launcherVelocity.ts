import { CITY_BOUNDS, SEWER_FLOOR } from './grayboxLayout';
import type { LaunchMachine, LaunchMachineKind } from './chaosState';
import type { Vec3Data } from './networkProtocol';

// Directed incidents retain full-flight containment independently of vertical pads.
export const LAUNCH_BOUNDARY_MARGIN = 12;
const GRAVITY = 25;

/** Each machine throws its own way. Lift is vertical speed; drift is the
 * horizontal speed the rat keeps unless it steers against it, aimed toward the
 * city centre within ±spread radians so a flight stays over the city. */
export const LAUNCH_PROFILES:Record<LaunchMachineKind,{lift:readonly [number,number];drift:readonly [number,number];spread:number}>={
    pressure:{lift:[86,94],drift:[4,12],spread:.6},
    fan:{lift:[96,104],drift:[0,5],spread:Math.PI},
    geyser:{lift:[78,100],drift:[6,15],spread:1.8},
    dumpster:{lift:[74,96],drift:[9,19],spread:2.2},
    freight:{lift:[62,72],drift:[17,23],spread:.5},
    mousetrap:{lift:[58,68],drift:[19,25],spread:.9},
};
/** Rare misfire: the tallest, widest throw. Stays inside MAX_LAUNCH_SPEED. */
export const OVERPRESSURE={chance:1/7,lift:106,drift:1.3} as const;
/** Trigger to firing: the machine shudders, flashes and whines, and rats get a split second. */
export const PRESSURE_TELL_MS=200;
/** A launched rat's landing: everything within `radius` is shoved away (up to
 * `shove` u/s sideways plus `lift` up), and a rat within `squash` is landed on
 * for 1 damage. `minDrop` of fall from the flight's peak counts as a landing. */
export const LANDING_SHOCKWAVE={radius:7,shove:[6,20] as const,lift:9,squash:2.2,minDrop:6} as const;
/** Drift fades by this rate (1/s) while airborne, for rats and cases alike. */
export const LAUNCH_DRIFT_DECAY=.25;
/** One rider's throw from a machine's profile; `boost` is decided once per
 * firing so every rider of an overpressure misfire goes high. `random` is [0,1). */
export function launcherVelocity(machine:LaunchMachine,boost:boolean,random:()=>number=Math.random):Vec3Data {
    const profile=LAUNCH_PROFILES[machine.kind];
    const between=([low,high]:readonly [number,number])=>low+(high-low)*random();
    const lift=boost?OVERPRESSURE.lift:between(profile.lift);
    const drift=between(profile.drift)*(boost?OVERPRESSURE.drift:1);
    const centre=(CITY_BOUNDS.min+CITY_BOUNDS.max)/2;
    const heading=Math.atan2(centre-machine.pad.x,centre-machine.pad.z)+(random()*2-1)*profile.spread;
    return {x:Math.sin(heading)*drift,y:lift,z:Math.cos(heading)*drift};
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
