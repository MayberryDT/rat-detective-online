import type {Vec3Data} from './networkProtocol';
const wrap=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
/** Coarse shoulder-camera attention, not a new visibility oracle. Existing
 * world rays still decide visibility. Off-screen sightings cost attention;
 * they are not discarded, so a rat can respond to a close flank. */
export class BotAttention {
    private facing?:number;
    private lastAt?:number;
    reset():void{this.facing=undefined;this.lastAt=undefined;}
    acquisitionCost(self:Vec3Data,target:Vec3Data,initialFacing:number):number{
        const yaw=this.facing??initialFacing,s=Math.sin(yaw),c=Math.cos(yaw);
        // Approximate a shortened four-unit boom and right shoulder. This
        // intentionally does not trace camera collision or claim exact pixels.
        const dx=target.x-(self.x-s*4+c*.9),dz=target.z-(self.z-c*4-s*.9);
        const angle=Math.abs(wrap(Math.atan2(dx,dz)-yaw));
        return angle<Math.PI/3?0:angle<Math.PI*2/3?120:260;
    }
    turn(now:number,desired:number,initialFacing:number):number{
        if(this.facing===undefined)this.facing=initialFacing;
        const dt=this.lastAt===undefined?0:Math.max(0,Math.min(.1,(now-this.lastAt)/1000));this.lastAt=now;
        this.facing+=Math.max(-5.5*dt,Math.min(5.5*dt,wrap(desired-this.facing)));
        return this.facing;
    }
    aligned(desired:number):boolean{return this.facing!==undefined&&Math.abs(wrap(desired-this.facing))<.12;}
}
