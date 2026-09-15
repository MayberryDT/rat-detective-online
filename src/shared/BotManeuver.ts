import type {Vec3Data} from './networkProtocol';
import type {ObjectiveNavigation} from './ObjectiveBotBrain';

/** Finish a short supported strafe before choosing another. A moved threat,
 * lost route, or lack of progress can interrupt it. Never runs a city search. */
export class BotManeuver {
    private goal?:Vec3Data;
    private threat?:Vec3Data;
    private key='';
    private progressAt=0;
    private best=Infinity;
    private side:number;
    constructor(seed:number){this.side=seed%2?1:-1;}
    reset():void{this.goal=undefined;this.threat=undefined;this.key='';this.best=Infinity;}
    step(now:number,key:string,self:Vec3Data,threat:Vec3Data,nav:ObjectiveNavigation):Vec3Data|undefined{
        const d=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.z-b.z);
        if(key!==this.key||this.threat&&d(threat,this.threat)>5){this.reset();this.key=key;}
        if(this.goal){
            const remaining=d(self,this.goal);
            if(remaining<this.best-.3){this.best=remaining;this.progressAt=now;}
            if(remaining<.65||now-this.progressAt>1400){this.goal=undefined;this.side*=-1;}
        }
        if(!this.goal){
            const dx=self.x-threat.x,dz=self.z-threat.z,len=Math.hypot(dx,dz)||1,back=len<9?1:.1;
            for(const side of [this.side,-this.side]){
                const goal=nav.localStep?.(self,{x:self.x+(dx*back+dz*side)/len*5,y:self.y,z:self.z+(dz*back-dx*side)/len*5});
                if(goal&&d(self,goal)>.65){this.goal=goal;this.side=side;this.threat={...threat};this.best=d(self,goal);this.progressAt=now;break;}
            }
        }
        // Revalidate the next local segment as the body moves (doors, stairs).
        return this.goal?nav.localStep?.(self,this.goal):undefined;
    }
}
