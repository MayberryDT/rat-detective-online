import {zoneStepSafe} from './zoneStepSafe';
import {JURISDICTION_ZONES,type JurisdictionZoneId} from '../../jurisdictionZones';
import type {Vec3Data} from '../../networkProtocol';
import type {MotorNavigation} from '../motor';

/** A carrier holding a Jurisdiction zone with nobody near: walk to a post, settle, and watch the approaches
 * in turn at irregular intervals. A fight in the zone is the fight movement on a zone leash. */
export class BotZoneHold {
    /** The approach the rat is watching. */
    look?:Vec3Data;
    private key='';
    private post?:Vec3Data;
    private settled=false;
    private lookIndex=0;
    private lookAt=0;
    private checkAt=0;
    private step?:Vec3Data;
    private progressAt=0;
    private best=Infinity;
    private tries=0;
    private readonly floor={x:0,y:0,z:0};
    constructor(private readonly seed:number,private readonly random:()=>number){}
    reset():void{this.key='';this.post=undefined;this.settled=false;this.lookAt=0;this.checkAt=0;this.step=undefined;this.tries=0;}
    /** The last step proved unsafe: choose again. */
    invalidate():void{this.post=undefined;this.settled=false;this.step=undefined;}

    /** Quiet holding: this tick's walking velocity into `out`. */
    hold(now:number,id:JurisdictionZoneId,key:string,self:Vec3Data,nav:MotorNavigation,out:{x:number;z:number}):void {
        const zone=JURISDICTION_ZONES[id],floor=this.floor;floor.x=self.x;floor.y=zone.floorY;floor.z=self.z;
        if(this.key!==key){this.reset();this.key=key;this.lookIndex=Math.abs(this.seed)%zone.approaches.length;}
        if(now>=this.lookAt){this.lookAt=now+1400+this.random()*2600;this.lookIndex=(this.lookIndex+1+(this.random()<.3?1:0))%zone.approaches.length;}
        this.look=zone.approaches[this.lookIndex];
        out.x=out.z=0;
        if(this.settled)return;
        if(!this.post){
            // A post the rat can walk to without leaving the zone; after a few failures, stay put.
            if(this.tries>=zone.posts.length){this.settled=true;return;}
            const post=zone.posts[(this.tries+++Math.abs(this.seed))%zone.posts.length];
            this.post={x:post.x,y:zone.floorY,z:post.z};this.best=Infinity;this.progressAt=now;this.checkAt=0;
        }
        const post=this.post,remaining=Math.hypot(post.x-self.x,post.z-self.z);
        if(remaining<.65){this.settled=true;return;}
        if(remaining<this.best-.25){this.best=remaining;this.progressAt=now;}
        if(now-this.progressAt>1600){this.post=undefined;return;}
        if(now>=this.checkAt){
            this.checkAt=now+150;
            const step=nav.localStep?.(floor,post);
            this.step=step&&Math.abs(step.y-zone.floorY)<=.5&&zoneStepSafe(id,floor,step)?step:undefined;
        }
        if(!this.step){this.post=undefined;return;}
        const dx=this.step.x-self.x,dz=this.step.z-self.z,d=Math.hypot(dx,dz),speed=Math.min(4.2,d*3);
        if(d>.1){out.x=dx/d*speed;out.z=dz/d*speed;}
    }
}
