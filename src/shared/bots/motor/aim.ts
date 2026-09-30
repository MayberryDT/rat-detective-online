import type {Vec3Data} from '../../networkProtocol';
import {BALL_GRAVITY,BALL_SPEED} from '../../ballTuning';
import type {SkillDials} from '../intent';

/** Gun height above the feet (the hosted muzzle's height). Aim angles are taken from here. */
export const EYE=1.376;
/** Where on a rat the crosshair goes: the chest, just under the head. Pre-aim sits at head height. */
const CHEST=1.2,HEAD=1.6;
export const AIM={
    /** The fastest a crosshair moves, rad/s: a hard flick. */
    maxRate:14,
    /** A flick's duration: base plus per radian of travel (Fitts-like), ms. */
    flickMs:90,flickPerRadMs:120,
    /** A gap bigger than this starts a flick instead of tracking, radians (engaged; a calm look uses 3×). */
    flickAt:.18,
    /** Time constant of a calm look (no target), ms. */
    lookMs:240,
    /** Point blank: closer than this (units), a moving rat crosses the screen faster than a hand follows. For a rat
     * moving at 8 units a second or more, the miss at the muzzle grows by `pointBlankMiss` (a share of the mid-range
     * miss) and the hand lets the crosshair drift `pointBlankHold` times further before correcting; both fade out to
     * this distance and with a slower rat (humans hit a quarter of their shots under 5 units, a tenth at 5–10). */
    pointBlank:15,pointBlankMiss:15,pointBlankHold:6,
    /** Share of the last miss the next one keeps (the rest is fresh). */
    missKeep:.7,
    /** How long the eye takes to register where a target is, ms (visual lag before tracking). */
    seeMs:70,
    /** A hit knocks the crosshair this far (radians, random direction) and widens the wander for `flinchMs`. */
    flinch:[.04,.11] as readonly [number,number],flinchMs:700,
    /** Noticing a rat off to the side (60°–120° from the crosshair) or behind, on top of the reaction, ms. */
    sideMs:[120,260] as readonly [number,number],rearMs:[320,600] as readonly [number,number],
    /** A target seen again this soon after losing it is re-acquired at this share of a reaction. */
    reseenMs:1200,reseenShare:.4,
    /** A hand holds the mouse still until the crosshair is this far off (radians; a calm look: 2×; engaged at point
     * blank, more: see `difficulty`), then corrects at this share of its tracking lag to a fresh point near where it
     * means to aim (the wander) until it is within `settleAt`, and holds again (humans hold aim still 44% of a
     * fight). A deliberate shot (a trigger, a bell, a bank) is lined up without holding. */
    holdAt:.09,settleAt:.02,correctShare:.35,
} as const;
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
/** About one standard deviation of noise from three uniforms. */
const normal=(r:()=>number)=>(r()+r()+r()-1.5)*2;
const between=(r:()=>number,[a,b]:readonly [number,number])=>a+r()*(b-a);

/** A rat's crosshair: yaw and pitch it moves like a hand on a mouse. A calm look drifts toward pre-aim
 * points; an engaged target is noticed after a reaction, flicked to (landing short or long), then tracked
 * with lag and imperfect lead. Shots leave along the crosshair, so every miss is one the rat actually made. */
export class BotAim {
    yaw=0;pitch=0;
    private ready=false;
    private desiredYaw=0;private desiredPitch=0;
    private engaged=false;
    /** Lining up a deliberate shot (a trigger, a bell, a bank): the hand moves with purpose, not calmly. */
    private deliberate=false;
    private flickStart=0;private flickEnd=0;
    /** Running where it looks: the hand keeps the crosshair on the heading closely (`lookAlong`). */
    private steering=false;
    /** A flick starts here and lands off the (moving) aim point by this much: the hand follows the target. */
    private fromYaw=0;private fromPitch=0;private offYaw=0;private offPitch=0;
    private wanderYaw=0;private wanderPitch=0;
    private holding=false;
    private flinchUntil=0;
    private lastAt?:number;
    private targetId?:string;
    private readyAt=0;
    private lostAt=-Infinity;
    private trackMs=150;
    private lead=.5;
    private readonly seen={x:0,y:0,z:0};
    private readonly last={x:0,y:0,z:0};
    private vx=0;private vz=0;
    private trackedAt=0;
    /** Scales the miss this tick: distance, motion, being hit. */
    private scale=1;
    /** How far an engaged crosshair may drift before the hand corrects, radians (`difficulty`). */
    private hold:number=AIM.holdAt;
    constructor(private readonly random:()=>number,private readonly skill:SkillDials){}
    reset():void {
        this.ready=false;this.engaged=false;this.flickEnd=0;this.wanderYaw=this.wanderPitch=0;this.flinchUntil=0;this.lastAt=undefined;
        this.targetId=undefined;this.lostAt=-Infinity;this.vx=this.vz=0;this.holding=false;
    }
    /** The crosshair starts where the body faces. */
    begin(facing:number):void {if(!this.ready){this.yaw=this.desiredYaw=facing;this.pitch=this.desiredPitch=0;this.ready=true;}}
    /** In the first three quarters of a flick; the finger may pull as the crosshair arrives. */
    get flicking():boolean{return this.lastAt!==undefined&&this.lastAt<this.flickStart+(this.flickEnd-this.flickStart)*.75;}
    /** The rat engaged and past its reaction. */
    get onTarget():boolean{return this.engaged&&(this.lastAt??0)>=this.readyAt;}
    /** How fast the engaged target seems to move, units a second. */
    get targetSpeed():number{return this.engaged?Math.hypot(this.vx,this.vz):0;}
    get engagedId():string|undefined{return this.engaged?this.targetId:undefined;}

    /** Flinch: a hit knocks the crosshair and shakes the aim for a moment. */
    hit(now:number):void {
        const kick=between(this.random,AIM.flinch),angle=this.random()*Math.PI*2;
        this.yaw+=Math.cos(angle)*kick;this.pitch+=Math.sin(angle)*kick*.6;this.flinchUntil=now+AIM.flinchMs;
        if(this.flicking)this.flickEnd=now;
    }
    /** Lose the engaged target (out of sight, dead, switched away). */
    disengage(now:number):void {if(this.engaged){this.engaged=false;this.lostAt=now;}}

    /** Engage a visible rat (or, with `fixed`, a point on it such as an exposed case): notice it after a
     * reaction, then aim where it is seen, led by a share of its motion, at chest height with some drop. */
    engage(now:number,eye:Vec3Data,id:string,target:Vec3Data,fixed=false):void {
        if(!this.engaged||id!==this.targetId){
            const again=id===this.targetId&&now-this.lostAt<AIM.reseenMs;
            const off=Math.abs(wrap(Math.atan2(target.x-eye.x,target.z-eye.z)-this.yaw));
            const notice=off>Math.PI*2/3?between(this.random,AIM.rearMs):off>Math.PI/3?between(this.random,AIM.sideMs):0;
            this.readyAt=now+(again?between(this.random,this.skill.reactionMs)*AIM.reseenShare:between(this.random,this.skill.reactionMs)+notice);
            if(!again){
                this.trackMs=between(this.random,this.skill.trackingMs);this.lead=between(this.random,this.skill.lead);
                this.seen.x=this.last.x=target.x;this.seen.y=this.last.y=target.y;this.seen.z=this.last.z=target.z;this.vx=this.vz=0;
            }
            this.trackedAt=now;this.targetId=id;this.engaged=true;
        }
        const dt=Math.min(.1,Math.max(0,(now-this.trackedAt)/1000));this.trackedAt=now;
        if(dt>0){
            const see=1-Math.exp(-dt*1000/AIM.seeMs),feel=1-Math.exp(-dt*1000/200);
            this.vx+=((target.x-this.last.x)/dt-this.vx)*feel;this.vz+=((target.z-this.last.z)/dt-this.vz)*feel;
            this.seen.x+=(target.x-this.seen.x)*see;this.seen.y+=(target.y-this.seen.y)*see;this.seen.z+=(target.z-this.seen.z)*see;
        }
        this.last.x=target.x;this.last.y=target.y;this.last.z=target.z;
        if(now<this.readyAt)return;
        const d=Math.hypot(this.seen.x-eye.x,this.seen.z-eye.z),travel=d/BALL_SPEED;
        const x=this.seen.x+(fixed?0:this.vx*travel*this.lead),z=this.seen.z+(fixed?0:this.vz*travel*this.lead);
        const y=this.seen.y+(fixed?0:CHEST)-BALL_GRAVITY*travel*travel/2*.7;
        this.desiredYaw=Math.atan2(x-eye.x,z-eye.z);this.desiredPitch=Math.atan2(y-eye.y,Math.max(.5,Math.hypot(x-eye.x,z-eye.z)));
    }
    /** A calm look at a point (pre-aim, a corner, a heard shot), or a deliberate trick shot's point when `exact`. */
    look(eye:Vec3Data,point:Vec3Data,exact=false):void {
        if(this.engaged)return;
        const y=exact?point.y:point.y+HEAD;
        this.deliberate=exact;this.steering=false;
        this.desiredYaw=Math.atan2(point.x-eye.x,point.z-eye.z);this.desiredPitch=Math.atan2(y-eye.y,Math.max(.5,Math.hypot(point.x-eye.x,point.z-eye.z)));
    }
    /** Look along a heading, level. With `steer` the rat runs where it looks, as a player steers with the mouse over
     * the forward key: the hand keeps the crosshair on the heading closely, correcting quickly. */
    lookAlong(heading:number,steer=false):void {if(!this.engaged){this.desiredYaw=heading;this.desiredPitch=0;this.deliberate=false;this.steering=steer;}}
    /** How far the crosshair is from where the rat wants it, radians. */
    get error():number{return Math.hypot(wrap(this.desiredYaw-this.yaw),this.desiredPitch-this.pitch);}
    /** How far off the rat believes its crosshair is: from where its hand means to be, its own miss unnoticed. */
    get felt():number{return Math.hypot(wrap(this.desiredYaw+this.wanderYaw-this.yaw),this.desiredPitch+this.wanderPitch-this.pitch);}
    /** The angle a point subtends away from the crosshair, radians. */
    offBy(eye:Vec3Data,point:Vec3Data):number {
        const yaw=Math.atan2(point.x-eye.x,point.z-eye.z),pitch=Math.atan2(point.y-eye.y,Math.max(.5,Math.hypot(point.x-eye.x,point.z-eye.z)));
        return Math.hypot(wrap(yaw-this.yaw),pitch-this.pitch);
    }
    /** How hard aiming is this tick: distance to what it aims at (far is hard; so is point blank, where a moving rat
     * crosses the screen faster than a hand follows, so the hand also lets it drift further before correcting),
     * the target's and its own speed. */
    difficulty(distance:number,targetSpeed:number,ownSpeed:number):void {
        const close=Math.max(0,1-distance/AIM.pointBlank)*Math.min(1,targetSpeed/8);
        this.scale=(.8+Math.min(80,distance)/80+AIM.pointBlankMiss*close)*(1+.5*Math.min(1,targetSpeed/12))*(1+.6*Math.min(1,ownSpeed/13));
        this.hold=AIM.holdAt*(1+AIM.pointBlankHold*close);
    }
    /** Where the next movement of the hand lands, off where the rat means to aim: wider when aiming is hard and
     * after a hit; a calm look barely misses. A hand tends to miss the same way for a while, so each miss keeps
     * part of the last. */
    private miss(engaged:boolean,now:number):void {
        const sigma=this.skill.aimWanderRadians*(engaged?this.scale:.2)*(now<this.flinchUntil?1.8:1),keep=AIM.missKeep,fresh=Math.sqrt(1-keep*keep);
        this.wanderYaw=this.wanderYaw*keep+sigma*fresh*normal(this.random);this.wanderPitch=this.wanderPitch*keep+sigma*fresh*.6*normal(this.random);
    }

    /** Move the crosshair for this tick. */
    update(now:number):void {
        const dt=this.lastAt===undefined?0:Math.min(.1,Math.max(0,(now-this.lastAt)/1000));this.lastAt=now;
        if(!dt)return;
        const engaged=this.engaged&&now>=this.readyAt,purposeful=engaged||this.deliberate&&!this.engaged,quick=purposeful||this.steering&&!this.engaged;
        // The hand aims at where it thinks the target is, off by its miss; only a big gap to that is a flick.
        let gapYaw=wrap(this.desiredYaw+this.wanderYaw-this.yaw),gapPitch=this.desiredPitch+this.wanderPitch-this.pitch,gap=Math.hypot(gapYaw,gapPitch);
        if(now<this.flickEnd){
            // Minimum-jerk path to where the hand decided to land, relative to the target as it moves.
            const t=(now-this.flickStart)/(this.flickEnd-this.flickStart),s=t*t*t*(10-15*t+6*t*t);
            this.yaw=wrap(this.fromYaw+wrap(this.desiredYaw+this.wanderYaw+this.offYaw-this.fromYaw)*s);
            this.pitch=this.fromPitch+(this.desiredPitch+this.wanderPitch+this.offPitch-this.fromPitch)*s;return;
        }
        // Hold still while close enough. A deliberate shot never holds.
        const steady=engaged||!this.deliberate;
        if(steady&&this.holding&&gap<(engaged?this.hold:quick?AIM.holdAt:AIM.holdAt*2))return;
        if(this.holding||gap>AIM.flickAt*(purposeful?1:3)){
            // The hand starts to move: toward a fresh miss.
            this.miss(engaged,now);this.holding=false;
            gapYaw=wrap(this.desiredYaw+this.wanderYaw-this.yaw);gapPitch=this.desiredPitch+this.wanderPitch-this.pitch;gap=Math.hypot(gapYaw,gapPitch);
        }
        if(gap>AIM.flickAt*(purposeful?1:3)){
            // A flick lands short or long along its line, and a little to one side.
            const along=1-.04+normal(this.random)*this.skill.flickError,across=normal(this.random)*this.skill.flickError*.35;
            const ux=gapYaw/gap,uy=gapPitch/gap;
            this.fromYaw=this.yaw;this.fromPitch=this.pitch;
            this.offYaw=gapYaw*(along-1)-uy*gap*across;this.offPitch=gapPitch*(along-1)+ux*gap*across;
            this.flickStart=now;this.flickEnd=now+Math.max(gap/AIM.maxRate*1000,(AIM.flickMs+AIM.flickPerRadMs*gap)*(quick?1:1.5));return;
        }
        // A correction: in quickly, then hold again.
        this.holding=steady&&gap<AIM.settleAt;
        if(this.holding)return;
        const follow=1-Math.exp(-dt*1000/(quick?this.trackMs*AIM.correctShare:AIM.lookMs)),limit=AIM.maxRate*dt;
        const dy=gapYaw*follow,dp=gapPitch*follow;
        this.yaw=wrap(this.yaw+Math.max(-limit,Math.min(limit,dy)));this.pitch+=Math.max(-limit,Math.min(limit,dp));
    }
    /** A point along the crosshair `range` away from the eye: where a shot now would go. */
    point(eye:Vec3Data,range:number):Vec3Data {
        const c=Math.cos(this.pitch);
        return {x:eye.x+Math.sin(this.yaw)*c*range,y:eye.y+Math.sin(this.pitch)*range,z:eye.z+Math.cos(this.yaw)*c*range};
    }
}

/** When the finger pulls: long runs of clicks with short pauses (humans pull about 260 times a fight-minute),
 * never faster than the dials allow. */
export class BotTrigger {
    private nextShot=0;
    private remaining=0;
    private pauseUntil=0;
    constructor(private readonly random:()=>number,private readonly skill:SkillDials){}
    reset():void{this.nextShot=0;this.remaining=0;this.pauseUntil=0;}
    /** Whether to fire now, given the crosshair is where the rat wants it. With `anyway` the hand clicks as it
     * does something else (a jump): the click counts toward the run but ignores the gaps. */
    pull(now:number,anyway=false):boolean {
        if(!anyway&&(now<this.nextShot||now<this.pauseUntil))return false;
        if(!this.remaining)this.remaining=3+Math.floor(this.random()*7);
        this.remaining--;
        this.nextShot=now+between(this.random,this.skill.burstShotMs);
        if(!this.remaining)this.pauseUntil=now+60+this.random()*this.random()*400;
        return true;
    }
}

export const SPRAY={
    pauseMs:[220,600] as readonly [number,number],quietMs:[800,1800] as readonly [number,number],activeMs:[7000,12000] as readonly [number,number],
    shotMs:[220,320] as readonly [number,number],range:[18,42] as readonly [number,number],
} as const;
/** Fire at where a rat might be, with nobody in sight: groups of shots at the pre-aim point, in active
 * stretches and quiet ones. Cheese banks off walls, so this is round-corner fire, not waste. */
export class BotSpray {
    private nextShot?:number;
    private remaining=0;
    private activeUntil=0;
    /** How far the current group reaches. */
    range=30;
    constructor(private readonly random:()=>number){}
    reset():void{this.nextShot=undefined;this.remaining=0;this.activeUntil=0;}
    pull(now:number,enabled:boolean,allowed:boolean):boolean {
        if(!enabled){this.reset();return false;}
        if(this.nextShot===undefined){this.nextShot=now+800+this.random()*1000;return false;}
        if(this.activeUntil&&now>=this.activeUntil){this.activeUntil=0;this.remaining=0;this.nextShot=now+between(this.random,SPRAY.quietMs);}
        if(!allowed||now<this.nextShot)return false;
        if(!this.activeUntil)this.activeUntil=now+between(this.random,SPRAY.activeMs);
        if(!this.remaining){this.remaining=this.random()<.4?1:2+Math.floor(this.random()*4);this.range=between(this.random,SPRAY.range);}
        this.remaining--;
        this.nextShot=now+between(this.random,this.remaining?SPRAY.shotMs:SPRAY.pauseMs);
        return true;
    }
}
