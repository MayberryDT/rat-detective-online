import { combatRandom } from './BotCombat';
import { JURISDICTION_ZONES, zoneContains, type JurisdictionZoneId } from './jurisdictionZones';
import type { Vec3Data } from './networkProtocol';
import type { ObjectiveNavigation } from './ObjectiveBotBrain';

/** Check the whole short segment, including a body/braking margin. A point in
 * each arm of the sewer T does not imply the line between them is in the zone. */
export function zoneStepSafe(id:JurisdictionZoneId,from:Vec3Data,to:Vec3Data,margin=.85):boolean {
    const length=Math.hypot(to.x-from.x,to.z-from.z);
    const steps=Math.max(1,Math.ceil(length/.4));
    if(steps>40)return false;
    const floorY=JURISDICTION_ZONES[id].floorY;
    const inset=(p:Vec3Data,m:number)=>[[m,0],[-m,0],[0,m],[0,-m]].every(([x,z])=>zoneContains(id,{x:p.x+x,y:floorY,z:p.z+z}));
    const startsInset=inset(from,margin);
    for(let i=0;i<=steps;i++){
        const point={x:from.x+(to.x-from.x)*i/steps,y:floorY,z:from.z+(to.z-from.z)*i/steps};
        // A newly arriving carrier may be on the boundary. Let its safe margin
        // grow inward rather than rejecting every route from that starting pose.
        if(!zoneContains(id,point)||!inset(point,startsInset?margin:margin*i/steps))return false;
    }
    return true;
}

/** Local activity, using the existing supported body sweep. No extra city
 * searches. A separate seeded clock avoids synchronized carriers/respawns. */
export class BotZoneHolding {
    private readonly random:()=>number;
    private key='';
    private goal?:Vec3Data;
    private chooseAt=0;
    private jumpAt=0;
    private lookAt=0;
    private look=0;
    private heading=0;
    private lastAt=0;
    private threatened=false;
    private direction=0;
    constructor(seed:number){this.random=combatRandom(seed+73001);}
    reset():void {this.key='';this.goal=undefined;this.chooseAt=0;this.lastAt=0;}
    step(now:number,id:JurisdictionZoneId,key:string,self:Vec3Data,threat:Vec3Data|undefined,
        grounded:boolean,nav:ObjectiveNavigation,clear:(p:Vec3Data)=>boolean){
        const zone=JURISDICTION_ZONES[id],floor={x:self.x,y:zone.floorY,z:self.z};
        if(key!==this.key){
            this.reset();this.key=key;this.jumpAt=now+4000+this.random()*6500;
            this.lookAt=0;this.heading=this.random()*Math.PI*2;this.direction=this.heading;
        }
        const dt=Math.min(.1,Math.max(0,(now-this.lastAt)/1000));this.lastAt=now;
        if(!!threat!==this.threatened){this.goal=undefined;this.chooseAt=0;this.threatened=!!threat;}
        if(this.goal&&Math.hypot(self.x-this.goal.x,self.z-this.goal.z)<.65){
            this.goal=undefined;this.chooseAt=now+(threat?100:250)+this.random()*(threat?250:650);
        }
        if(grounded&&now>=this.chooseAt){
            this.chooseAt=now+1100+this.random()*900;
            this.goal=undefined;
            // Prefer a changing strafe around a threat; otherwise stroll with
            // varied direction. Reject unsupported floors and missing corners.
            const base=threat?Math.atan2(self.x-threat.x,self.z-threat.z)+(this.random()<.5?1:-1)*1.05
                :this.direction+(this.random()-.5)*2.2;
            for(let i=0;i<6;i++){
                const angle=base+i*Math.PI/3;
                const to={x:self.x+Math.sin(angle)*2.5,y:zone.floorY,z:self.z+Math.cos(angle)*2.5};
                if(!zoneStepSafe(id,floor,to))continue;
                const step=nav.localStep?.(floor,to);
                if(!step||Math.abs(step.y-zone.floorY)>.5||!zoneStepSafe(id,floor,step))continue;
                this.goal=step;this.direction=Math.atan2(step.x-self.x,step.z-self.z);break;
            }
        }
        let x=0,z=0;
        if(this.goal){
            const dx=this.goal.x-self.x,dz=this.goal.z-self.z,d=Math.hypot(dx,dz);
            // Proportional arrival also brakes mid-hop, before crossing a edge.
            const speed=Math.min(threat?6:3.4,d*3);
            if(d>.1){x=dx/d*speed;z=dz/d*speed;}
        }
        if(now>=this.lookAt){
            this.lookAt=now+1200+this.random()*1900;
            const approach=zone.approaches[Math.floor(this.random()*zone.approaches.length)];
            this.look=Math.atan2(approach.x-self.x,approach.z-self.z)+(this.random()-.5)*.5;
        }
        const difference=Math.atan2(Math.sin(this.look-this.heading),Math.cos(this.look-this.heading));
        this.heading+=Math.max(-dt*1.7,Math.min(dt*1.7,difference));
        let jump=false;
        if(grounded&&now>=this.jumpAt){
            this.jumpAt=now+500;
            // Ordinary arc is just over five units. Check overhead and a
            // supported local landing; keep horizontal steering active in air.
            jump=zoneStepSafe(id,floor,this.goal??floor,1.2)&&clear({x:self.x,y:zone.floorY+5.5,z:self.z});
            if(jump)this.jumpAt=now+(threat?4500:7000)+this.random()*6500;
        }
        return {x,z,jump,facing:this.heading};
    }
    invalidate():void {this.goal=undefined;this.chooseAt=0;}
}
