import type {Vec3Data} from '../../src/shared/networkProtocol';
import {RAT_MOVEMENT,lookHeading,ratMuzzle,type RatControls} from '../../src/shared/rat/ratBody';

/** What a bot's controls do, in world terms, copied at once (the motor reuses its controls object every tick):
 * the ground velocity the keys ask for before Hot Pursuit (as the shared body turns them into motion), the
 * heading the rat looks along, whether it jumps, and the point its shot passes `range` from its muzzle. */
export interface WorldIntent {x:number;z:number;jump:boolean;facing:number;shoot?:Vec3Data}
export function worldIntent(controls:RatControls,self:Vec3Data,range=25):WorldIntent {
    const facing=Math.atan2(Math.sin(lookHeading(controls.lookYaw)),Math.cos(lookHeading(controls.lookYaw)));
    const s=Math.sin(facing),c=Math.cos(facing),f=controls.moveForward,r=controls.moveRight;
    const x=s*f-c*r,z=c*f+s*r,held=Math.min(1,1/(Math.hypot(x,z)||1))*RAT_MOVEMENT.run;
    const out:WorldIntent={x:x*held,z:z*held,jump:controls.jump,facing};
    const d=controls.fire?.direction;
    if(d){const m=ratMuzzle(self,facing);out.shoot={x:m.x+d.x*range,y:m.y+d.y*range,z:m.z+d.z*range};}
    return out;
}
/** How far `target` is from the muzzle these controls fire from: the `range` at which `worldIntent`'s shot passes it. */
export function muzzleRange(controls:RatControls,self:Vec3Data,target:Vec3Data):number {
    const m=ratMuzzle(self,lookHeading(controls.lookYaw));
    return Math.hypot(target.x-m.x,target.y-m.y,target.z-m.z);
}
