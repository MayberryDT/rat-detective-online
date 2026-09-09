import { CITY_BOUNDS, SEWER_FLOOR } from './grayboxLayout';
import type { LaunchMachine } from './chaosState';
import type { Vec3Data } from './networkProtocol';

// Leave room for the rat's body and modest air steering. Evaluate the whole
// undamped flight down to the lowest floor, not only the controller's launch
// hold (which releases movement near the apex). Actual damping shortens throws.
export const LAUNCH_BOUNDARY_MARGIN = 12;
const GRAVITY = 25;

/** One authoritative impulse per activation, shared by everyone on that pad. */
export function launcherVelocity(machine:LaunchMachine, rng:()=>number=Math.random):Vec3Data {
    const vertical=machine.velocity.y*(.9+rng()*.16);
    const horizontal=Math.hypot(machine.velocity.x,machine.velocity.z)*(.9+rng()*.16);
    // Pad pickup permits feet up to two units above its surface. Cover all pad
    // offsets, including occupants on opposite edges receiving the same impulse.
    const fallHeight=machine.pad.y+2-SEWER_FLOOR;
    const flight=(vertical+Math.sqrt(vertical*vertical+2*GRAVITY*fallHeight))/GRAVITY;
    const min=CITY_BOUNDS.min+LAUNCH_BOUNDARY_MARGIN+machine.pad.radius;
    const max=CITY_BOUNDS.max-LAUNCH_BOUNDARY_MARGIN-machine.pad.radius;
    const travelXPositive=Math.max(0,max-machine.pad.x);
    const travelXNegative=Math.max(0,machine.pad.x-min);
    const travelZPositive=Math.max(0,max-machine.pad.z);
    const travelZNegative=Math.max(0,machine.pad.z-min);
    let bestX=0,bestZ=0,bestScale=-1;
    // Prefer a full-force random heading. At the city edges that naturally
    // selects inward arcs, rather than repeatedly throwing rats over the wall.
    for(let attempt=0;attempt<16;attempt++){
        const angle=rng()*Math.PI*2;
        const x=Math.cos(angle)*horizontal,z=Math.sin(angle)*horizontal;
        const scale=Math.min(1,
            Math.abs(x)<1e-9?1:(x>0?travelXPositive:travelXNegative)/(Math.abs(x)*flight),
            Math.abs(z)<1e-9?1:(z>0?travelZPositive:travelZNegative)/(Math.abs(z)*flight));
        if(scale>bestScale){bestX=x;bestZ=z;bestScale=scale;}
        if(scale===1)break;
    }
    return {x:bestX*bestScale,y:vertical,z:bestZ*bestScale};
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
