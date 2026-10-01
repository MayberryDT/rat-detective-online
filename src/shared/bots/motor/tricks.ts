import {LAUNCH_MACHINES,PRESSURE_TUNING,type ChaosState} from '../../chaosState';
import type {IncidentId} from '../../incidentCatalog';
import {launchGravity,launchSpeed} from '../../shotBallistics';
import {hasIronclad} from '../../pickups';
import type {PlayerData,Vec3Data} from '../../networkProtocol';
import type {MotorNavigation} from '../motor';
import {BANK,bankShot} from './bankShot';
import {EYE} from './aim';

/** Mischief: a counterfeit is shot when another rat is within `bait` of it and this rat further than `safe`; a
 * trigger when another rat stands on its pad. Targets within `range`, looked for every `lookMs`. */
export const MISCHIEF={bait:5,safe:10,range:50,lookMs:200} as const;
const distance=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

/** Deliberate trick shots: a bank off a wall at a rat that just hid, and mischief (a gremlin's chaos shots, a
 * joyrider's launch triggers). They name a point; the crosshair still has to get there. */
export class BotTricks {
    private bankAt=0;
    private bankAim?:{point:Vec3Data;until:number};
    private mischiefAt=0;
    private mischiefAim?:Vec3Data;
    reset():void{this.bankAim=undefined;this.bankAt=0;this.mischiefAim=undefined;this.mischiefAt=0;}
    /** The bank shot left the gun. */
    banked():void{this.bankAim=undefined;}

    /** A bank shot at the rat last in sight, if it went behind cover moments ago nearby: a held solution, or
     * a fresh bounded attempt at most every `BANK.attemptMs`. */
    bank(now:number,self:Vec3Data,state:ChaosState|undefined,seen:{id:string;p:Vec3Data;at:number}|undefined,
        protectedVisible:readonly PlayerData[],nav:MotorNavigation,incident?:IncidentId):Vec3Data|undefined {
        if(this.bankAim&&now<this.bankAim.until)return this.bankAim.point;
        this.bankAim=undefined;
        const ray=nav.ray;
        if(!seen||!ray||now<this.bankAt||now-seen.at>BANK.memoryMs||distance(self,seen.p)>BANK.range||hasIronclad(state?.buffs,seen.id,state?.time??now))return;
        this.bankAt=now+BANK.attemptMs;
        const point=bankShot({x:self.x,y:self.y+EYE,z:self.z},{x:seen.p.x,y:seen.p.y+.9,z:seen.p.z},ray,protectedVisible.map(p=>({x:p.x,y:p.y+1,z:p.z})),incident);
        if(!point)return;
        this.bankAim={point,until:now+BANK.holdMs};
        return point;
    }

    /** A chaos shot: with `fakes`, a visible counterfeit with another rat beside it (never one close to this rat);
     * else the trigger of a launch machine that is not cooling while another rat stands on its pad. Ordinary
     * shots; the server decides what they do. */
    mischief(now:number,self:Vec3Data,state:ChaosState|undefined,visible:readonly PlayerData[],clearControl:(p:Vec3Data)=>boolean,fakes:boolean,incident?:IncidentId):Vec3Data|undefined {
        if(now<this.mischiefAt)return this.mischiefAim;
        this.mischiefAt=now+MISCHIEF.lookMs;this.mischiefAim=undefined;
        if(!state)return;
        const others=visible.filter(p=>p.hp>0);
        const speed=launchSpeed(incident),gravity=launchGravity(incident);
        const lob=(p:Vec3Data)=>{const travel=Math.hypot(p.x-self.x,p.z-self.z)/speed;return this.mischiefAim={x:p.x,y:p.y-gravity*travel*travel/2,z:p.z};};
        if(fakes)for(const fake of state.extraCases??[]){
            const d=distance(self,fake.p);
            if(fake.fake&&d>MISCHIEF.safe&&d<MISCHIEF.range&&others.some(p=>distance(p,fake.p)<MISCHIEF.bait)&&clearControl(fake.p))return lob(fake.p);
        }
        for(const machine of LAUNCH_MACHINES){
            const pad=machine.pad,onPad=(p:Vec3Data)=>Math.abs(p.y-pad.y)<2&&Math.hypot(p.x-pad.x,p.z-pad.z)<=pad.radius;
            const cooling=state.time<(state.pressure?.fired?.[machine.id]??-Infinity)+PRESSURE_TUNING.cooldownMs;
            if(onPad(self)||cooling||distance(self,machine.target)>MISCHIEF.range||!others.some(onPad)||!clearControl(machine.target))continue;
            return lob(machine.target);
        }
    }
}
