import {combatRandom} from './BotCombat';
import {zoneStepSafe} from './BotZoneHolding';
import {JURISDICTION_ZONES,type JurisdictionZoneId} from './jurisdictionZones';
import type {Vec3Data} from './networkProtocol';
import type {ObjectiveNavigation} from './ObjectiveBotBrain';

/** Quiet carriers take a useful post and watch approaches. Visible pressure
 * triggers a bounded lateral move. Arrival ends the maneuver, not a clock. */
export class BotPurposefulHolding {
    private key='';
    private goal?:Vec3Data;
    private threat?:Vec3Data;
    private settled=false;
    private retryAt=0;
    private progressAt=0;
    private best=Infinity;
    private lookIndex=0;
    private lookAt=0;
    private heading=0;
    private lastAt?:number;
    private hopAt=0;
    private readonly random:()=>number;
    constructor(private readonly seed:number){this.random=combatRandom(seed+73001);}
    reset():void{this.key='';this.goal=undefined;this.threat=undefined;this.settled=false;this.retryAt=0;this.best=Infinity;this.lastAt=undefined;this.lookAt=0;this.hopAt=0;}
    invalidate():void{this.goal=undefined;this.settled=false;this.retryAt=0;}
    step(now:number,id:JurisdictionZoneId,key:string,self:Vec3Data,threat:Vec3Data|undefined,
        grounded:boolean,nav:ObjectiveNavigation,clear:(p:Vec3Data)=>boolean){
        const zone=JURISDICTION_ZONES[id],floor={x:self.x,y:zone.floorY,z:self.z};
        const dist=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.z-b.z);
        if(this.key!==key){this.reset();this.key=key;this.lookIndex=Math.abs(this.seed)%zone.approaches.length;}
        const dt=this.lastAt===undefined?0:Math.min(.1,Math.max(0,(now-this.lastAt)/1000));this.lastAt=now;
        const changed=!!threat!==!!this.threat||!!threat&&!!this.threat&&dist(threat,this.threat)>4;
        if(changed){this.goal=undefined;this.settled=false;this.retryAt=0;this.threat=threat?{...threat}:undefined;}
        if(this.goal){
            const remaining=dist(self,this.goal);
            if(remaining<this.best-.25){this.best=remaining;this.progressAt=now;}
            if(remaining<.65){this.goal=undefined;this.settled=true;this.retryAt=now+350;}
            else if(now-this.progressAt>1600){this.goal=undefined;this.settled=false;this.retryAt=now+400;}
        }
        let started=false;
        // Under close pressure a completed strafe makes another useful; in a
        // quiet zone only entry, route failure or changed threats warrant moving.
        if(grounded&&!this.goal&&now>=this.retryAt&&(!this.settled||!!threat&&dist(self,threat)<16)){
            this.retryAt=now+600;
            const away=threat?Math.atan2(self.x-threat.x,self.z-threat.z):0;
            const candidates:Vec3Data[]=threat?Array.from({length:6},(_,i)=>{
                const angle=away+(this.seed%2?1:-1)*(1.05+i*Math.PI/3);
                return{x:self.x+Math.sin(angle)*3,y:zone.floorY,z:self.z+Math.cos(angle)*3};
            }):zone.posts.map((_,i)=>({...zone.posts[(i+Math.abs(this.seed))%zone.posts.length],y:zone.floorY}));
            for(const to of candidates){
                if(!zoneStepSafe(id,floor,to))continue;
                const step=nav.localStep?.(floor,to);
                if(!step||Math.abs(step.y-zone.floorY)>.5||!zoneStepSafe(id,floor,step))continue;
                if(dist(floor,to)<.65){this.settled=true;break;}
                if(dist(floor,step)<.4)continue;
                this.goal=to;this.best=dist(floor,to);this.progressAt=now;started=true;break;
            }
        }
        let x=0,z=0;
        if(this.goal){
            const step=nav.localStep?.(floor,this.goal);
            if(!step||!zoneStepSafe(id,floor,step)){this.invalidate();}
            else {const dx=step.x-self.x,dz=step.z-self.z,d=Math.hypot(dx,dz),speed=Math.min(threat?6:3.4,d*3);if(d>.1){x=dx/d*speed;z=dz/d*speed;}}
        }
        if(now>=this.lookAt){this.lookAt=now+1800+this.random()*1700;this.lookIndex=(this.lookIndex+1)%zone.approaches.length;}
        const look=threat??zone.approaches[this.lookIndex];
        const desired=Math.atan2(look.x-self.x,look.z-self.z),diff=Math.atan2(Math.sin(desired-this.heading),Math.cos(desired-this.heading));
        this.heading+=Math.max(-dt*1.7,Math.min(dt*1.7,diff));
        // A close encounter can provoke a hop as the rat starts escaping.
        // Quiet time and an unchanged distant threat never trigger jumps.
        const jump=started&&changed&&!!threat&&dist(self,threat)<10&&now>=this.hopAt&&this.random()<.45&&
            zoneStepSafe(id,floor,this.goal??floor,1.2)&&clear({x:self.x,y:zone.floorY+5.5,z:self.z});
        if(jump)this.hopAt=now+6500;
        return{x,z,jump,facing:this.heading};
    }
}
