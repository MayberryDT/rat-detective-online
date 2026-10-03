import {BALL_GRAVITY,BALL_SPEED} from '../../ballTuning';
import {LAUNCH_MACHINES,PRESSURE_TUNING,type ChaosState,type TrapState} from '../../chaosState';
import type {IncidentId} from '../../incidentCatalog';
import {hasIronclad} from '../../pickups';
import type {PlayerData,Vec3Data} from '../../networkProtocol';
import type {MotorNavigation} from '../motor';
import {BANK,bankShot} from './bankShot';
import {EYE} from './aim';

/** Mischief: a launch trigger is shot when another rat stands on its pad, within `range`, looked for every `lookMs`. */
export const MISCHIEF={range:50,lookMs:200} as const;
/** Another rat's Mousetrap in the way is shot: one in sight within `range` on this level (`level`), in the lane the
 * rat runs along (`lane` either side) or within `near` of where it is going; looked for every `lookMs`, aimed
 * `lift` above its floor. */
export const TRAP_CLEAR={range:24,lane:3,near:4,level:2.5,lookMs:250,lift:.2} as const;
const distance=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

/** Deliberate trick shots: a bank off a wall at a rat that just hid, and mischief (a gremlin's chaos shots, a
 * joyrider's launch triggers). They name a point; the crosshair still has to get there. */
export class BotTricks {
    private bankAt=0;
    private bankAim?:{point:Vec3Data;until:number};
    private mischiefAt=0;
    private mischiefAim?:Vec3Data;
    private trapAt=0;
    private trapAim?:Vec3Data;
    private readonly trapPoint={x:0,y:0,z:0};
    reset():void{this.bankAim=undefined;this.bankAt=0;this.mischiefAim=undefined;this.mischiefAt=0;this.trapAim=undefined;this.trapAt=0;}
    /** The bank shot left the gun. */
    banked():void{this.bankAim=undefined;}

    /** A bank shot at the rat last in sight, if it went behind cover moments ago nearby: a held solution, or
     * a fresh bounded attempt at most every `BANK.attemptMs`. A `beam` (the Laser) banks straight. */
    bank(now:number,self:Vec3Data,state:ChaosState|undefined,seen:{id:string;p:Vec3Data;at:number}|undefined,
        protectedVisible:readonly PlayerData[],nav:MotorNavigation,incident?:IncidentId,beam=false):Vec3Data|undefined {
        if(this.bankAim&&now<this.bankAim.until)return this.bankAim.point;
        this.bankAim=undefined;
        const ray=nav.ray;
        if(!seen||!ray||now<this.bankAt||now-seen.at>BANK.memoryMs||distance(self,seen.p)>BANK.range||hasIronclad(state?.buffs,seen.id,state?.time??now))return;
        this.bankAt=now+BANK.attemptMs;
        const point=bankShot({x:self.x,y:self.y+EYE,z:self.z},{x:seen.p.x,y:seen.p.y+.9,z:seen.p.z},ray,protectedVisible.map(p=>({x:p.x,y:p.y+1,z:p.z})),incident,beam);
        if(!point)return;
        this.bankAim={point,until:now+BANK.holdMs};
        return point;
    }

    /** Another rat's Mousetrap in the way (`TRAP_CLEAR`): the nearest one in sight in the lane of the step (x, z)
     * or beside `to`. A rat's own trap never is. Ordinary shots break it; the crosshair still has to get there. */
    clearTrap(now:number,self:PlayerData,state:ChaosState|undefined,x:number,z:number,to:Vec3Data|undefined,clear:(p:Vec3Data)=>boolean,
        beam=false):Vec3Data|undefined {
        if(now<this.trapAt)return this.trapAim;
        this.trapAt=now+TRAP_CLEAR.lookMs;this.trapAim=undefined;
        const traps=state?.traps;if(!traps?.length)return;
        const length=Math.hypot(x,z),nx=length?x/length:0,nz=length?z/length:0;
        let best:TrapState|undefined,bestAt:number=TRAP_CLEAR.range;
        for(const trap of traps){
            if(trap.owner===self.id||trap.brokenAt!==undefined||Math.abs(trap.y-self.y)>TRAP_CLEAR.level)continue;
            const dx=trap.x-self.x,dz=trap.z-self.z,d=Math.hypot(dx,dz);
            if(d>=bestAt)continue;
            const lane=length>0&&dx*nx+dz*nz>0&&Math.abs(dx*nz-dz*nx)<TRAP_CLEAR.lane;
            if(!lane&&!(to&&Math.hypot(trap.x-to.x,trap.z-to.z)<TRAP_CLEAR.near)||!clear(trap))continue;
            best=trap;bestAt=d;
        }
        if(!best)return;
        const travel=beam?0:bestAt/BALL_SPEED,p=this.trapPoint;
        p.x=best.x;p.y=best.y+TRAP_CLEAR.lift-BALL_GRAVITY*travel*travel/2;p.z=best.z;
        return this.trapAim=p;
    }

    /** A chaos shot: the trigger of a launch machine that is not cooling while another rat stands on its pad.
     * Ordinary shots; the server decides what they do. A `beam` (the Laser) needs no lob. */
    mischief(now:number,self:Vec3Data,state:ChaosState|undefined,visible:readonly PlayerData[],clearControl:(p:Vec3Data)=>boolean,beam=false):Vec3Data|undefined {
        if(now<this.mischiefAt)return this.mischiefAim;
        this.mischiefAt=now+MISCHIEF.lookMs;this.mischiefAim=undefined;
        if(!state)return;
        const others=visible.filter(p=>p.hp>0);
        const speed=BALL_SPEED,gravity=BALL_GRAVITY;
        const lob=(p:Vec3Data)=>{const travel=beam?0:Math.hypot(p.x-self.x,p.z-self.z)/speed;return this.mischiefAim={x:p.x,y:p.y-gravity*travel*travel/2,z:p.z};};
        for(const machine of LAUNCH_MACHINES){
            const pad=machine.pad,onPad=(p:Vec3Data)=>Math.abs(p.y-pad.y)<2&&Math.hypot(p.x-pad.x,p.z-pad.z)<=pad.radius;
            const cooling=state.time<(state.pressure?.fired?.[machine.id]??-Infinity)+PRESSURE_TUNING.cooldownMs;
            if(onPad(self)||cooling||distance(self,machine.target)>MISCHIEF.range||!others.some(onPad)||!clearControl(machine.target))continue;
            return lob(machine.target);
        }
    }
}
