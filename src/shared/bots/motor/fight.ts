import type {Vec3Data} from '../../networkProtocol';
import type {MotorNavigation} from '../motor';
import {EYE} from './aim';

/** How a rat moves in a gunfight, from recorded human fights (docs/bot-overhaul.md, "Motor rewrite"). */
export const FIGHT={
    /** Preferred range per rat, units (humans hold about 35 from the nearest rival; bots shoot worse, so closer). */
    range:[17,27] as readonly [number,number],
    /** Beyond this the fight is over for movement: follow the route. */
    reach:34,
    /** One strafe lasts 220 ms plus an exponential tail with this mean, capped. */
    strafeMs:220,strafeTailMs:420,strafeMaxMs:1400,
    /** After a strafe: chance to stop and shoot, and for how long; otherwise chance to keep the same side. */
    stopChance:.22,stopMs:[180,480] as readonly [number,number],keepSide:.3,
    /** Speeds: strafing, pushing, backing off, units a second. */
    strafe:[8.5,11] as readonly [number,number],push:12.5,retreat:9.5,
    /** A push lasts this long, ms. */
    pushMs:[700,1500] as readonly [number,number],
    /** Cover: look for it this often while hurt, this far away; hide, then peek for these long, ms. */
    coverEveryMs:900,coverDistance:[4,6.5] as readonly [number,number],hideMs:[500,1300] as readonly [number,number],peekMs:[700,1600] as readonly [number,number],
    /** Check a moving step's walkability this often, ms. */
    stepMs:120,
} as const;
const between=(r:()=>number,[a,b]:readonly [number,number])=>a+r()*(b-a);

/** What the fight looks like this tick. */
export interface FightView {
    now:number;
    self:Vec3Data;
    /** Where the enemy is (or was last seen). */
    enemy:Vec3Data;
    /** The enemy is in sight now. */
    visible:boolean;
    /** Back off and use cover. */
    hurt:boolean;
    /** Press in now: the enemy is weak or just emptied a burst. */
    push:boolean;
    nav:MotorNavigation;
    /** Every step must stay where this allows (a Jurisdiction zone). */
    leash?:(from:Vec3Data,to:Vec3Data)=>boolean;
}

/** Strafe and jiggle with irregular timing at a preferred range, stop to shoot, push a weak or reloading
 * enemy, and when hurt back off into cover and peek out of it. Local geometry only; never a city search. */
export class BotFight {
    /** The movement velocity chosen by the last `step`. */
    readonly move={x:0,z:0};
    private side:number;
    private segmentUntil=0;
    private stopUntil=0;
    private pushUntil=0;
    private drift=0;
    private readonly range:number;
    private readonly strafe:number;
    private phase:'fight'|'hide'|'peek'='fight';
    private phaseUntil=0;
    private coverAt=0;
    private readonly cover={x:0,y:0,z:0};
    private readonly peek={x:0,y:0,z:0};
    private step?:Vec3Data;
    private stepAt=0;
    private readonly goal={x:0,y:0,z:0};
    constructor(private readonly random:()=>number,seed:number){
        this.side=seed%2?1:-1;this.range=between(random,FIGHT.range);this.strafe=between(random,FIGHT.strafe);
    }
    reset():void{this.segmentUntil=0;this.stopUntil=0;this.pushUntil=0;this.phase='fight';this.phaseUntil=0;this.coverAt=0;this.step=undefined;this.stepAt=0;}
    /** Hiding or peeking from cover. */
    get covering():boolean{return this.phase!=='fight';}

    /** Choose this tick's fight movement into `move`. */
    run(v:FightView):void {
        const {now,self,enemy}=v,dx=enemy.x-self.x,dz=enemy.z-self.z,d=Math.hypot(dx,dz)||1,tx=dx/d,tz=dz/d;
        if(v.push&&now>=this.pushUntil&&!v.hurt)this.pushUntil=now+between(this.random,FIGHT.pushMs);
        if(v.hurt&&this.phase==='fight'&&now>=this.coverAt)this.findCover(v,tx,tz);
        if(!v.hurt&&this.phase!=='fight'){this.phase='fight';}
        if(this.phase==='hide'){
            const gone=Math.hypot(this.cover.x-self.x,this.cover.z-self.z);
            if(gone>.8){this.walk(v,this.cover.x-self.x,this.cover.z-self.z,FIGHT.retreat);return;}
            if(!this.phaseUntil)this.phaseUntil=now+between(this.random,FIGHT.hideMs);
            if(now<this.phaseUntil){this.move.x=this.move.z=0;return;}
            this.phase='peek';this.phaseUntil=0;
        }
        if(this.phase==='peek'){
            if(!v.visible){
                const back=Math.hypot(this.peek.x-self.x,this.peek.z-self.z);
                // Lost the angle entirely: give cover up and fight in the open.
                if(back<.6){this.phase='fight';this.coverAt=now+FIGHT.coverEveryMs;}
                else {this.walk(v,this.peek.x-self.x,this.peek.z-self.z,this.strafe);return;}
            }else{
                if(!this.phaseUntil)this.phaseUntil=now+between(this.random,FIGHT.peekMs);
                if(now>=this.phaseUntil){this.phase='hide';this.phaseUntil=0;}
                this.move.x=this.move.z=0;return;
            }
        }
        if(now>=this.segmentUntil){
            if(now>=this.stopUntil&&this.random()<FIGHT.stopChance){this.stopUntil=now+between(this.random,FIGHT.stopMs);this.segmentUntil=this.stopUntil;}
            else {
                if(this.random()>=FIGHT.keepSide)this.side*=-1;
                this.segmentUntil=now+FIGHT.strafeMs+Math.min(FIGHT.strafeMaxMs,-Math.log(1-this.random()*.999)*FIGHT.strafeTailMs);
                this.drift=(this.random()-.5)*.7;
            }
        }
        const pushing=now<this.pushUntil;
        if(!pushing&&now<this.stopUntil){this.move.x=this.move.z=0;return;}
        // Toward or away from the enemy along the line, plus the strafe across it.
        const radial=pushing?1.1:v.hurt?-.9:d>this.range+6?.75:d<this.range-6?-.75:this.drift;
        const lateral=pushing?.35:1;
        this.walk(v,tx*radial+tz*this.side*lateral,tz*radial-tx*this.side*lateral,pushing?FIGHT.push:v.hurt?FIGHT.retreat:this.strafe);
    }

    /** Walk in a direction on a checked local step; a blocked side flips the strafe. */
    private walk(v:FightView,dx:number,dz:number,speed:number):void {
        const {now,self,nav}=v,length=Math.hypot(dx,dz);
        this.move.x=this.move.z=0;
        if(length<.01)return;
        const gx=self.x+dx/length*3,gz=self.z+dz/length*3;
        if(now>=this.stepAt||Math.hypot(gx-this.goal.x,gz-this.goal.z)>1.2){
            this.stepAt=now+FIGHT.stepMs;this.goal.x=gx;this.goal.y=self.y;this.goal.z=gz;
            this.step=nav.localStep?nav.localStep(self,this.goal):this.goal;
            if(this.step&&v.leash&&!v.leash(self,this.step))this.step=undefined;
        }
        const step=this.step;
        const sx=step?step.x-self.x:0,sz=step?step.z-self.z:0,d=Math.hypot(sx,sz);
        if(!step||d<.3){this.side*=-1;this.segmentUntil=now;this.stepAt=0;return;}
        this.move.x=sx/d*speed;this.move.z=sz/d*speed;
    }

    /** A spot a few units away, walkable in a straight line, that the enemy can't see. */
    private findCover(v:FightView,tx:number,tz:number):void {
        const {now,self,enemy,nav}=v;
        this.coverAt=now+FIGHT.coverEveryMs;
        if(!nav.ray)return;
        const away=Math.atan2(-tx,-tz),reach=between(this.random,FIGHT.coverDistance);
        for(const turn of [.7,-.7,1.4,-1.4,0,2.1,-2.1]){
            const angle=away+turn*(this.side),x=self.x+Math.sin(angle)*reach,z=self.z+Math.cos(angle)*reach;
            this.goal.x=x;this.goal.y=self.y;this.goal.z=z;
            if(nav.walkable?!nav.walkable(self,this.goal):!nav.localStep?.(self,this.goal))continue;
            if(v.leash&&!v.leash(self,this.goal))continue;
            this.goal.y=self.y+EYE;
            if(!nav.ray(this.goal,{x:enemy.x,y:enemy.y+1,z:enemy.z}))continue;
            this.cover.x=x;this.cover.y=self.y;this.cover.z=z;
            this.peek.x=self.x;this.peek.y=self.y;this.peek.z=self.z;
            this.phase='hide';this.phaseUntil=0;this.stepAt=0;
            return;
        }
    }
}
