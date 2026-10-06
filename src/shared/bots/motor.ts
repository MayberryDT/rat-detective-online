import {BALL_GRAVITY,BALL_SPEED} from '../ballTuning';
import {sewerRampAt} from '../sewerLayout';
import {JURISDICTION_ZONES,zoneContains,type JurisdictionZoneId} from '../jurisdictionZones';
import {activeZone} from '../jurisdiction';
import {activeDestination,destinationPoint} from '../assignments';
import {exposedCarrierCase,shotHitsIronclad} from '../BotTargeting';
import {DISPATCH_STATIONS,LAUNCH_MACHINES,PRESSURE_TUNING,type CaseState,type ChaosState,type LaunchMachine} from '../chaosState';
import {incidentInfo,type IncidentId} from '../incidentCatalog';
import {hasIronclad,heldWeapon,legScale,WEAPON_TUNING,type WeaponKind} from '../pickups';
import type {PlayerData,Vec3Data} from '../networkProtocol';
import type {BotWaypoint} from '../BotLaunchRoutes';
import {BASE_SKILL,type Goal,type MotorMode,type Plan,type SkillDials,type Stance} from './intent';
import type {RayHit} from './motor/bankShot';
import {seededRandom} from './random';
import {BotAim,BotSpray,BotTrigger,EYE,HELD_SLACK_MS} from './motor/aim';
import {BotSteer} from './motor/steer';
import {BotFight,FIGHT,type FightView} from './motor/fight';
import {BotZoneHold} from './motor/zoneHold';
import {BotTricks} from './motor/tricks';
import {zoneStepSafe} from './motor/zoneStepSafe';
import {CarrierSight,type KnownCarrier} from './motor/carriers';
import {FLASHLIGHT_REACH,RAT_MOVEMENT,lookHeading,muzzleReach,noControls,ratMuzzle,type RatControls} from '../rat/ratBody';

export interface MotorNavigation {
    /** A supported local route leg, without replacing the actual objective. */
    travelPoint?(from:Vec3Data,to:Vec3Data):Vec3Data;
    supported?(from:Vec3Data):boolean;
    jumpStep?(from:Vec3Data,to:Vec3Data):Vec3Data|undefined;
    approachStep?(from:Vec3Data,to:Vec3Data):Vec3Data|undefined;
    /** Undefined means the shared planner's frame budget was already used. */
    route(from: Vec3Data, to: Vec3Data): BotWaypoint[] | undefined;
    /** A short waypoint verified against both solid geometry and floor support. */
    localStep?(from:Vec3Data,to:Vec3Data):Vec3Data|undefined;
    /** Whether the whole rat can walk straight from one point to another on supported floor (corner cutting). */
    walkable?(from:Vec3Data,to:Vec3Data):boolean;
    explorationTargets(): Vec3Data[];
    update?(budgetMs?: number): void;
    /** The first solid surface on a segment, with its normal; undefined when clear. Bank shots and cover need it. */
    ray?(from:Vec3Data,to:Vec3Data):RayHit|undefined;
}
/** A genuine (collectible) case under its goal key: `case` for the primary, `case:<id>` for extras. */
export interface CaseEntry { key:string; value:CaseState }
export const distance = (a: Vec3Data, b: Vec3Data) => Math.hypot(a.x-b.x, a.z-b.z, a.y-b.y);
const ROUTE_WAIT_MS=6000,FAILED_GOAL_RETRY_MS=12000;
/** Reached waypoints count as progress only this far from each of the last `PROGRESS_SPOTS` counted spots. */
const PROGRESS_CLEAR=8,PROGRESS_SPOTS=4;
/** The slow, careful pace on stairs, ledges and final approaches, units a second. */
const CAREFUL=6.5;
/** Plans whose movement the fight takes over while a rival is in reach. */
const FIGHTING_MODES:Partial<Record<MotorMode,true>>={combat:true,intercept:true,explore:true};
/** How long a rat keeps fighting (and looking) where a rival was last seen, ms. */
const MEMORY_MS=2500;
/** A focused rat hit this recently fights back as if its plan were a fight, ms. */
const FIGHT_BACK_MS=2000;
/** Hops in a fight, pressed like a player's space bar: after landing, the ground time before the next is this
 * plus an exponential tail with this mean, ms (humans press jump 20 times a fight-minute and are in the air 27%
 * of it; one hop is about 1.1 s of air). With a rival in sight the finger clicks as the space bar goes down and
 * once more `clickMs` later (humans pull about 1.4 times within 200 ms of each jump); a click not fired within
 * `clickWindowMs` of its time is dropped. */
const HOP={afterMs:250,tailMs:1100,clickMs:[110,170],clickWindowMs:250} as const;
/** Keys busy beside a rival (no route to run) stay busy at least this long, ms. */
const IDLE_MS=500;
/** Gunfire from out of sight holds the eye this long, ms; then the rat ignores other gunfire this long. */
const HEARD={lookMs:[900,1600],quietMs:[2000,5000]} as const;
/** A joyrider's ride (docs/bot-overhaul.md, "Archetypes"): every `checkMs` on the ground it looks for a launch
 * machine within `reach` whose pad is at most `detour` out of its way to a destination at least `far` off (roaming,
 * any pad in reach), never with the case. It goes to the pad and works it; a ride not thrown within `ms` is left
 * for `retryMs`. After a landing the next ride waits `restMs`. In the air it steers for its destination and fights. */
const RIDE={reach:45,detour:25,far:40,checkMs:1000,ms:16000,retryMs:30000,restMs:25000} as const;
/** Setting a Mousetrap down (the fire press while holding it): not before `settleMs` in paw, then at a useful spot
 * where the press puts it (`WEAPON_TUNING.trapReach` ahead along the crosshair, on a floor): a doorway or alley
 * (walls within `choke` on both sides), within `objective` of the case, the active zone or the drop-off, or with a
 * rival in sight (the press brings the gun back); anywhere on the way after `patienceMs`. Spots are looked at every
 * `lookMs`; the authority may refuse one unseen, so a press is retried no sooner than `retryMs`. */
const TRAP={settleMs:400,patienceMs:[2000,4500],lookMs:250,retryMs:1200,choke:3.5,objective:12} as const;
/** Another rat's Mousetrap counts as underfoot this near (its snap reach and a margin), units. */
export const TRAP_REACH=WEAPON_TUNING.trapRadius+WEAPON_TUNING.trapFoot+.5;
/** Another rat's unbroken Mousetrap in sight within `reach` of `p` (horizontally, on its level). A rat's own trap
 * is harmless to it; hidden ones are never read. */
export function enemyTrap(self:PlayerData,p:Vec3Data,reach:number,state:ChaosState|undefined,clear:(p:Vec3Data)=>boolean):boolean {
    for(const t of state?.traps??[])if(t.owner!==self.id&&t.brokenAt===undefined&&Math.abs(t.y-p.y)<2.5&&Math.hypot(t.x-p.x,t.z-p.z)<reach&&clear(t))return true;
    return false;
}

/** Firing and movement beyond what every rat does, set at each decision from the rat's archetype and its mind's answer. */
export interface Tactics {
    /** Bank shots at a rat that just went behind cover. */
    bank:boolean;
    /** Shoot launch triggers under other rats. */
    mischief:boolean;
    /** Ride launch machines on the way (`RIDE`). */
    joyride?:boolean;
    /** The preferred fight range's span, and how near a rival must be for the fight to take over the movement,
     * units. Absent: `FIGHT`'s. */
    range?:readonly [number,number];
    reach?:number;
    /** Speculative fire with nobody in sight, as a share of the usual (`BotSpray`). Absent: 1. */
    spray?:number;
    /** The mind's danger (0 safe … 3 about to die), when it gave one. */
    danger?:number;
    /** `fight`: a rival close by takes over the rat's movement whatever the plan; `focus`: only where the plan
     * itself fights (hunting, intercepting, exploring, near the chased carrier, in the zone) or when a rival has
     * just hit it. Firing never depends on it. Absent: `focus`. */
    stance?:Stance;
}

/** The moving half of a bot: runs the current Plan every tick and fires whenever it has a shot, whatever the
 * goal. Routes come from BotNavigation; the rat runs them by pure pursuit at its own pace (`BotSteer`), moves
 * its crosshair like a hand (`BotAim`), strafes, pushes and uses cover in a fight (`BotFight`) and keeps
 * shooting while it carries or delivers. It also keeps the per-goal failure memory the goal code consults.
 * It sees only what a rat in the city could: visible rats, heard shots, advertised objectives. */
export class BotMotor {
    mode: MotorMode = 'explore';
    goal?:Goal;
    key = '';
    destination?: Vec3Data;
    /** Seeded walk index shared by the patrol spots, the recovery turn and the exploration choice. */
    wander: number;
    /** Something happened (a case changed hands, a goal failed, a landing) that warrants deciding now. */
    urgent = false;
    /** Goals given up so far (`failGoal`), for the recorder's goal outcomes. Never reset. */
    failures = 0;
    /** Set at each decision from the rat's archetype and its mind's answer. */
    tactics:Tactics={bank:false,mischief:false};
    private shotTarget?: PlayerData;
    private protectedVisible:PlayerData[]=[];
    private visible:PlayerData[]=[];
    /** A ready Dispatch control in ringing range; shot in passing. */
    private bell?: Vec3Data;
    private readonly bellAim={x:0,y:0,z:0};
    private bellAimAt=0;
    private route: BotWaypoint[] = [];
    private routeIndex = 0;
    /** A planned flight onto a known landing; a `free` one (a joyride) steers for the plan's destination and fights. */
    private flight?:{landing:Vec3Data;started:number;free?:true};
    /** The launch machine a joyrider is heading for or working, since when, and until when it waits for the throw. */
    private ride?:{machine:LaunchMachine;since:number;until:number};
    private rideAt=0;
    /** The zone a `zone-hold` plan holds. */
    private holdZone?:JurisdictionZoneId;
    private jumpTravel?:{goal:Vec3Data;started:number};
    private jumpProbeAt=0;
    private approachAt=0;
    private approach?:Vec3Data;
    private launchWaitAt?:number;
    private plannedDestination?: Vec3Data;
    private pendingPlan?: { from: Vec3Data; to: Vec3Data; started: number };
    private routeWaitStarted?:number;
    private routeProgressGoal?:Vec3Data;
    private bestRouteDistance=Infinity;
    private localWaypoint?:Vec3Data;
    private localStepAt=0;
    /** The direction of the last local step, while stepping without a route; its probe point. */
    private readonly localWay={x:0,z:0,set:false};
    private readonly localGoal={x:0,y:0,z:0};
    private readonly failedGoals=new Map<string,{position:Vec3Data;until:number}>();
    private failedCase?:Vec3Data;
    private stalled=false;
    private planAt = 0;
    private shotAt = 0;
    /** This tick's incident and held weapon. */
    private incident?: IncidentId;
    private weapon?: WeaponKind;
    /** The incident the rat's balls fly under: none with a Tommy Gun (plain balls) or a Laser (a beam). */
    private ballistics?: IncidentId;
    /** A Mousetrap in paw: since when, how long before any spot will do, when a spot is next looked at and pressed. */
    private trapHeldAt?:number;
    private trapPatience=0;
    private trapLookAt=0;
    private trapPressAt=0;
    private readonly trapSpot={x:0,y:0,z:0};
    private readonly trapRay={x:0,y:0,z:0};
    private readonly trapTo={x:0,y:0,z:0};
    /** The step after turning aside from hazards (`veer`), reused every tick. */
    private readonly veered={x:0,z:0};
    private progressAt = 0;
    private readonly progressPosition={x:0,y:0,z:0};
    private progressSet=false;
    private recoverUntil = 0;
    private cases:CaseEntry[]=[];
    private readonly caseLifecycles=new Map<string,{owner:string|null;returning:boolean}>();
    /** Where this rat knows other rats' carried cases are: its own sight or the latest heartbeat ping. */
    private readonly carrierSight=new CarrierSight();
    private assignmentSignature = '';
    private assignmentActive=false;
    private progress=0;
    /** The last few spots where a reached waypoint counted as progress, the first where the life began (a ring):
     * a waypoint counts only well clear of all of them, so pacing between two or three spots never does. */
    private readonly counted=Array.from({length:PROGRESS_SPOTS},()=>({x:0,y:0,z:0}));
    private countedSpots=0;
    private sighting?:{id:string;p:Vec3Data;at:number};
    /** A defended spot near an intercept post, and when to pick another. */
    private post?:Vec3Data;
    private postAt=0;
    /** Gunfire heard from a rat out of sight: where it came from, until when it holds the rat's eye, and when the
     * rat next turns to gunfire (a player glances at a firefight now and then, not at every shot in the city). */
    private readonly heard={x:0,y:0,z:0,until:0,next:0};
    private listenAt=0;
    /** The fight's rival's recent fire: shots in the air lately and the youngest one's age, s. */
    private rivalShots=0;
    private rivalNewest=Infinity;
    private suppressUntil=0;
    private hitAt=-Infinity;
    private lastHp=Infinity;
    private lastDriveAt?:number;
    private lastX=0;
    private lastZ=0;
    private ownSpeed=0;
    private glanceUntil=0;
    private glanceAt=0;
    private glanceTurn=0;
    /** The next fight hop is due (set on landing). */
    private hopAt=0;
    private wasGrounded=false;
    /** Clicks still due with the last hop, and when the next is. */
    private hopClicks=0;
    private hopClickAt=0;
    /** Busy keys beside a rival last at least until then. */
    private idleUntil=0;
    /** The rat's own ground velocity, seen from its position, and the velocity its keys asked for last tick;
     * in a throw, the gap between them is the machine's drift the keys press against. */
    private seenAt?:number;
    private seenX=0;private seenZ=0;private velX=0;private velZ=0;
    private pressX=0;private pressZ=0;private driftX=0;private driftZ=0;
    /** Hot Pursuit's scale on the legs this tick (the body applies it; the motor only expects it). */
    private legs=1;
    /** Since when the keys have pushed without moving the rat (a wall, a bin): a player's cue to jump. */
    private pushingSince?:number;
    /** This tick's controls, reused every tick. */
    private readonly out:RatControls=noControls();
    private readonly fireOut={direction:{x:0,y:0,z:0}};
    private readonly muzzle={x:0,y:0,z:0};
    private readonly eye={x:0,y:0,z:0};
    private readonly dir={x:0,z:0};
    private readonly holdMove={x:0,z:0};
    /** Where a rival was last seen, at chest height: fired at for a moment after it hides. */
    private readonly lost={x:0,y:0,z:0};
    private readonly view:FightView;
    private leashZone?:JurisdictionZoneId;
    private leash?:(from:Vec3Data,to:Vec3Data)=>boolean;
    private readonly aim:BotAim;
    private readonly trigger:BotTrigger;
    private readonly spray:BotSpray;
    private readonly steer:BotSteer;
    private readonly fight:BotFight;
    private readonly zoneHold:BotZoneHold;
    private readonly tricks=new BotTricks();
    private readonly motorRandom:()=>number;
    constructor(private readonly navigation: MotorNavigation, seed: number, private readonly random: () => number,private skill:SkillDials=BASE_SKILL) {
        this.aim=new BotAim(seededRandom(seed),skill);
        this.trigger=new BotTrigger(seededRandom(seed+10000),skill);
        this.spray=new BotSpray(seededRandom(seed+30000));
        this.motorRandom=seededRandom(seed+40000);
        this.steer=new BotSteer(seededRandom(seed+50000));
        this.fight=new BotFight(seededRandom(seed+60000),seed);
        this.view={now:0,self:this.eye,enemy:this.lost,look:0,visible:false,hurt:false,push:false,airborne:false,nav:navigation,range:FIGHT.range};
        this.zoneHold=new BotZoneHold(seed,seededRandom(seed+73001));
        this.wander = seed * 7;
    }
    /** The rat's dials: an archetype's, which can change when a slot's rat changes between rounds. */
    useSkill(skill:SkillDials):void {this.skill=this.aim.skill=this.trigger.skill=skill;}
    /** True while steering a planned launcher or drop flight onto a known landing. */
    get flyingRoute():boolean {return !!this.flight;}
    /** Initial pending work counts as stalled until a usable route or reached goal exists. */
    get navigationStalled():boolean{return this.stalled;}
    /** Counts genuine progress: a route waypoint passed, the goal reached or held, a launch pad worked, a
     * visible fight. Escape hops and local jitter never count, so a parked bot's rescue clock keeps running. */
    get progressMark():number{return this.progress;}
    get failedCasePosition():Readonly<Vec3Data>|undefined{return this.failedCase;}
    /** The rat the motor is shooting at, chosen at the last decision. */
    get target():Readonly<PlayerData>|undefined{return this.shotTarget;}
    /** Rats in sight at the last decision, nearest first. */
    get visibleRats():readonly PlayerData[]{return this.visible;}
    /** A ready alarm bell the motor will ring in passing. */
    get ringing():boolean{return !!this.bell;}
    /** The genuine cases seen this tick. */
    get genuineCases():readonly CaseEntry[]{return this.cases;}
    /** Other rats carrying a case whose place this rat knows, nearest first, as of the last decision: the live rat
     * while in sight, else its last sighting or the case's latest ping. The same array, refreshed in place. */
    get carriers():readonly KnownCarrier[]{return this.carrierSight.known;}
    /** The rat last shot at while in sight, where and when: a bank shot's quarry once it hides. */
    get sighted():Readonly<{id:string;p:Vec3Data;at:number}>|undefined{return this.sighting;}
    reset(): void {
        this.jumpTravel=undefined;this.jumpProbeAt=0;this.approach=undefined;this.approachAt=0;this.protectedVisible=[];this.visible=[];
        this.assignmentActive=false;this.shotAt=0;this.trapHeldAt=undefined;this.trapLookAt=0;this.trapPressAt=0;
        this.aim.reset();this.trigger.reset();this.spray.reset();this.steer.reset();this.fight.reset();this.zoneHold.reset();this.tricks.reset();
        this.key='';this.goal=undefined;this.shotTarget=undefined;this.bell=undefined;this.destination=undefined;this.route=[];this.routeIndex=0;
        this.plannedDestination=undefined;this.pendingPlan=undefined;this.planAt=0;this.progressSet=false;this.recoverUntil=0;
        this.routeWaitStarted=undefined;this.failedGoals.clear();this.failedCase=undefined;this.stalled=false;
        this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;
        this.caseLifecycles.clear();this.cases=[];this.carrierSight.reset();
        this.flight=undefined;this.launchWaitAt=undefined;this.ride=undefined;this.rideAt=0;
        this.assignmentSignature='';this.urgent=false;
        this.sighting=undefined;this.post=undefined;this.postAt=0;this.heard.until=0;this.listenAt=0;this.rivalShots=0;this.rivalNewest=Infinity;
        this.suppressUntil=0;this.hitAt=-Infinity;this.lastHp=Infinity;this.lastDriveAt=undefined;this.ownSpeed=0;this.glanceUntil=0;this.glanceAt=0;
        this.hopAt=0;this.wasGrounded=false;this.idleUntil=0;this.heard.next=0;this.hopClicks=0;
        this.seenAt=undefined;this.pushingSince=undefined;this.velX=this.velZ=this.pressX=this.pressZ=this.driftX=this.driftZ=0;this.legs=1;
    }
    /** Take the decision's plan. A new key restarts routing; the same key keeps the current route. */
    setPlan(plan:Plan): void {
        if(this.key!==plan.key){this.approach=undefined;this.approachAt=0;this.launchWaitAt=undefined;this.route=[];this.routeIndex=0;this.plannedDestination=undefined;this.pendingPlan=undefined;this.routeWaitStarted=undefined;this.recoverUntil=0;this.planAt=0;this.key=plan.key;
            this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;this.steer.reset();this.post=undefined;}
        this.mode=plan.mode;this.goal=plan.goal;this.destination=plan.destination;this.holdZone=plan.zone;
    }
    private failureKey(key:string):string {
        // A carrier with an unreachable route must not immediately become the
        // same unreachable "ordinary combat" destination in the next branch.
        return key.startsWith('carrier:')||key.startsWith('combat:')?`rat:${key.slice(key.indexOf(':')+1)}`:key;
    }
    /** A goal at this position recently failed (unreachable route, stuck launch, abandoned detour). */
    suppressed(key:string,position:Vec3Data,now:number):boolean {
        const id=this.failureKey(key),failed=this.failedGoals.get(id);
        if(!failed)return false;
        if(now>=failed.until||distance(position,failed.position)>7){this.failedGoals.delete(id);return false;}
        return true;
    }
    /** Give up the current goal: remember it as failed for a while and ask for a new decision. */
    failGoal(now:number):void {
        const position=this.destination??this.pendingPlan?.to;
        if(position){
            const retry=this.assignmentActive&&['case','carrier','delivery','zone-hold'].includes(this.mode)?4000:FAILED_GOAL_RETRY_MS;
            this.remember(this.key,position,now+retry);
            if(this.key==='case')this.failedCase={x:position.x,y:position.y,z:position.z};
        }
        this.route=[];this.routeIndex=0;this.pendingPlan=undefined;this.routeWaitStarted=undefined;
        this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;
        this.plannedDestination=undefined;this.destination=undefined;this.urgent=true;this.planAt=0;this.recoverUntil=0;this.failures++;
    }
    /** Leave a detour the rat never reached (the pickup reflex's supply) for `ms` without failing its goal. */
    abandon(key:string,position:Vec3Data,now:number,ms:number):void {this.remember(key,position,now+ms);}
    private remember(key:string,position:Vec3Data,until:number):void {
        this.failedGoals.set(this.failureKey(key),{position:{x:position.x,y:position.y,z:position.z},until});
        if(this.failedGoals.size>32)this.failedGoals.delete(this.failedGoals.keys().next().value!);
    }

    /** Facing from the body's rotation, for the first tick after a reset. */
    private bodyFacing(self:PlayerData):number {
        return Math.atan2(2*(self.meshQw*self.meshQy+self.meshQx*self.meshQz),1-2*(self.meshQy*self.meshQy+self.meshQz*self.meshQz));
    }
    private clearOfCounted(self:Vec3Data):boolean {
        for(let i=0;i<Math.min(this.countedSpots,PROGRESS_SPOTS);i++)if(distance(self,this.counted[i])<=PROGRESS_CLEAR)return false;
        return true;
    }
    private fly(now:number,self:PlayerData,grounded:boolean):RatControls|undefined {
        const flight=this.flight;if(!flight||flight.free)return;
        if(now-flight.started>1000&&grounded&&Math.abs(self.y-flight.landing.y)<2){
            this.flight=undefined;this.route=[];this.routeIndex=0;this.pendingPlan=undefined;
            this.plannedDestination=undefined;this.planAt=0;this.urgent=true;return;
        }
        if(now-flight.started>10000){this.flight=undefined;this.failGoal(now);return;}
        this.stalled=false;
        // Rise clear of the facade before crossing it. Once over the roof,
        // proportional steering brakes above the landing rather than orbiting it.
        const dx=flight.landing.x-self.x,dz=flight.landing.z-self.z,d=Math.hypot(dx,dz);
        const speed=self.y>flight.landing.y+3?Math.min(12,d*3):0;
        this.aim.begin(this.bodyFacing(self));
        if(d>.1&&speed)this.aim.lookAlong(Math.atan2(dx,dz));
        this.aim.update(now);
        return this.controls(self,d>.1&&speed>0?dx/d*speed:0,d>.1&&speed>0?dz/d*speed:0,false);
    }

    /** The rat's own motion this tick, as a player sees their rat move: its ground velocity, and in a throw the
     * drift its keys are not causing. */
    private see(now:number,self:PlayerData,state:ChaosState|undefined,grounded:boolean):void {
        const dt=this.seenAt===undefined?0:(now-this.seenAt)/1000;this.seenAt=now;
        const fresh=dt>0&&dt<.2;
        if(fresh){this.velX=(self.x-this.seenX)/dt;this.velZ=(self.z-this.seenZ)/dt;}
        this.seenX=self.x;this.seenZ=self.z;
        if(this.flight&&!grounded&&fresh){const k=Math.min(1,dt*8);this.driftX+=(this.velX-this.pressX-this.driftX)*k;this.driftZ+=(this.velZ-this.pressZ-this.driftZ)*k;}
        else this.driftX=this.driftZ=0;
        this.legs=legScale(state?.buffs,self.id,state?.time??now);
        // Keys held into something that does not give: since when (the last tick's keys, the rat not moving).
        if(grounded&&Math.hypot(this.pressX,this.pressZ)>3&&Math.hypot(this.velX,this.velZ)<1)this.pushingSince??=now;else this.pushingSince=undefined;
    }

    /** The keys, look and trigger a player would press this tick to move at world velocity (x, z) with the
     * crosshair where the aim holds it, jumping on `jump`, firing at `shoot`. Reused every tick. */
    private controls(self:Vec3Data,x:number,z:number,jump:boolean,shoot?:Vec3Data):RatControls {
        const out=this.out,heading=this.aim.yaw,s=Math.sin(heading),c=Math.cos(heading),run=RAT_MOVEMENT.run;
        // In a throw, press against its drift to hold the wanted course, as far as the keys reach.
        x-=this.driftX;z-=this.driftZ;
        const held=Math.min(1,run/(Math.hypot(x,z)||run));
        this.pressX=x*held*this.legs;this.pressZ=z*held*this.legs;
        out.moveForward=(x*s+z*c)/run;out.moveRight=(z*s-x*c)/run;
        out.lookYaw=lookHeading(heading);out.lookPitch=this.aim.pitch;out.jump=jump;out.fire=undefined;
        if(shoot){
            const m=ratMuzzle(self,heading,this.muzzle,muzzleReach(this.weapon)),dx=shoot.x-m.x,dy=shoot.y-m.y,dz=shoot.z-m.z,length=Math.hypot(dx,dy,dz);
            if(length>0){const d=this.fireOut.direction;d.x=dx/length;d.y=dy/length;d.z=dz/length;out.fire=this.fireOut;}
        }
        return out;
    }

    /** The start of a tick: death, launcher flights and authoritative launches take over the controls. */
    begin(now:number,self:PlayerData,state:ChaosState|undefined,grounded:boolean):RatControls|undefined {
        this.incident=state?.dispatch.phase==='active'?incidentInfo(state.dispatch.incident).id:undefined;
        // A held weapon replaces the incident's shot: plain Tommy Gun balls, a Laser beam that needs no lead or drop.
        const weapon=this.weapon=heldWeapon(state?.buffs,self.id,state?.time??now);
        this.ballistics=weapon?undefined:this.incident;this.aim.hitscan=weapon==='laser';
        if(weapon!=='mousetrap')this.trapHeldAt=undefined;
        else if(this.trapHeldAt===undefined){this.trapHeldAt=now;this.trapPatience=TRAP.patienceMs[0]+this.motorRandom()*(TRAP.patienceMs[1]-TRAP.patienceMs[0]);}
        this.see(now,self,state,grounded);
        if(self.hp<=0){
            this.jumpTravel=undefined;this.flight=undefined;this.launchWaitAt=undefined;this.ride=undefined;this.aim.reset();this.trigger.reset();this.fight.reset();this.zoneHold.reset();
            this.stalled=false;this.lastHp=Infinity;
            return this.controls(self,0,0,false);
        }
        if(this.jumpTravel&&(now-this.jumpTravel.started>2200||grounded&&now-this.jumpTravel.started>250))this.jumpTravel=undefined;
        const airborne=this.fly(now,self,grounded);if(airborne)return airborne;
        const launchStep=this.route[this.routeIndex]?.launch;
        const launch=launchStep&&state?.pressure?.launches.find(e=>e.playerId===self.id&&e.machineId===launchStep.machine.id&&
            e.at>=(this.launchWaitAt??now)&&now-e.at<1500);
        if(launch&&launchStep){
            this.jumpTravel=undefined;this.flight={landing:launchStep.landing,started:now};this.launchWaitAt=undefined;
            return this.fly(now,self,false)!;
        }
        // A joyrider thrown by the machine it worked: the flight is the drive's (steering and fighting in the air).
        const ride=this.ride;
        if(ride&&state?.pressure?.launches.some(e=>e.playerId===self.id&&e.machineId===ride.machine.id&&e.at>=ride.since&&now-e.at<1500)){
            this.ride=undefined;this.jumpTravel=undefined;
            this.flight={landing:{x:ride.machine.pad.x,y:ride.machine.pad.y,z:ride.machine.pad.z},started:now,free:true};
            this.route=[];this.routeIndex=0;this.pendingPlan=undefined;this.plannedDestination=undefined;
        }
    }

    /** Case lifecycle and failure bookkeeping, every tick before any decision. */
    observe(now:number,self:PlayerData,state:ChaosState|undefined):{ownershipChanged:boolean;assignmentChanged:boolean} {
        const cases=this.cases=state?[{key:'case',value:state.case},...(state.extraCases??[]).map(value=>({key:`case:${value.id}`,value}))]:[];
        // Keep each case's failed position independent. Picking up one extra
        // must not erase the evidence that the primary case is unreachable.
        let ownershipChanged=false,assignmentChanged=false;
        const assignment=state?.assignment;
        this.assignmentActive=assignment?.phase==='active';
        // Cancel body fire the moment the silver coat appears, including between decisions.
        if(this.shotTarget&&hasIronclad(state?.buffs,this.shotTarget.id,state?.time??now)&&!exposedCarrierCase(self,this.shotTarget,state,()=>true)){
            this.aim.disengage(now);this.trigger.reset();this.shotTarget=undefined;this.urgent=true;
        }
        const signature=assignment?`${assignment.roundId}:${assignment.phase}:${assignment.deliverySerial}:${assignment.jurisdiction?.serial??0}`:'';
        if(signature!==this.assignmentSignature){this.assignmentSignature=signature;this.urgent=true;assignmentChanged=true;for(const key of this.failedGoals.keys())if(key.startsWith("zone:"))this.failedGoals.delete(key);}
        for(const {key,value} of cases){
            const before=this.caseLifecycles.get(key),returning=value.returningUntil>(state?.time??now);
            if(!before||before.owner!==value.owner||before.returning!==returning){
                ownershipChanged=true;this.failedGoals.delete(key);
                if(before?.owner)this.failedGoals.delete(`rat:${before.owner}`);
                if(value.owner)this.failedGoals.delete(`rat:${value.owner}`);
                if(key==='case')this.failedCase=undefined;
                this.caseLifecycles.set(key,{owner:value.owner,returning});
            }
        }
        for(const key of this.caseLifecycles.keys())if(!cases.some(c=>c.key===key)){
            ownershipChanged=true;this.caseLifecycles.delete(key);this.failedGoals.delete(key);if(key==='case')this.failedCase=undefined;
        }
        if(ownershipChanged)this.urgent=true;
        if(this.failedCase&&state&&distance(this.failedCase,state.case.p)>7){this.failedCase=undefined;this.failedGoals.delete('case');this.urgent=true;}
        this.carrierSight.observe(cases,self.id);
        this.followCase();
        if(this.routeWaitStarted!==undefined&&this.routeProgressGoal){
            const remaining=distance(self,this.routeProgressGoal);
            // Only new net progress earns more search time. Walking back and
            // forth over the same patch cannot keep an impossible goal alive.
            if(remaining<this.bestRouteDistance-.75){this.bestRouteDistance=remaining;this.routeWaitStarted=now;}
        }
        if(!ownershipChanged&&this.pendingPlan&&this.routeWaitStarted!==undefined&&now-this.routeWaitStarted>=ROUTE_WAIT_MS)this.failGoal(now);
        return {ownershipChanged,assignmentChanged};
    }
    private followCase():void {
        if(this.mode!=='case')return;
        const selected=this.cases.find(c=>c.key===this.key);
        if(selected&&!selected.value.owner)this.destination=selected.value.p;
    }

    /** At a decision: who is in sight, where the case carriers are, whom to shoot and whether to ring a bell in
     * passing. Visible carriers first (their exposed case through Ironclad), then Most Wanted, the retained target,
     * the nearest vulnerable rat. A preferred rat (the mind's target) wins when it is visible and shootable. In a
     * Blackout sight reaches only as far as a flashlight. */
    perceive(now:number,self:PlayerData,living:readonly PlayerData[],state:ChaosState|undefined,
        clear:(p:Vec3Data)=>boolean,clearControl:(p:Vec3Data)=>boolean,quietBell:boolean,preferred?:string):void {
        const time=state?.time??now,sight=state?.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='blackout'?FLASHLIGHT_REACH:80;
        const visible=living.filter(p=>distance(self,p)<sight&&clear(p)).sort((a,b)=>distance(self,a)-distance(self,b));
        this.visible=visible;
        this.carrierSight.see(self,visible,living,time);
        // A rat seen dying (the kill feed) is not banked at.
        if(this.sighting&&!living.some(p=>p.id===this.sighting?.id))this.sighting=undefined;
        this.protectedVisible=visible.filter(p=>hasIronclad(state?.buffs,p.id,time));
        const vulnerable=visible.filter(p=>!hasIronclad(state?.buffs,p.id,time));
        const shootable=(p:PlayerData)=>vulnerable.includes(p)||!!exposedCarrierCase(self,p,state,clearControl);
        // Keep a visible opponent through a burst instead of re-reacting every
        // time two similarly close rats trade places. Visible carriers still win.
        // Most Wanted: the leader is in a searchlight everyone can see; hunt them for the bounty.
        const wantedId=state?.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='most-wanted'?state.dispatch.wanted:undefined;
        const chosen=preferred?visible.find(p=>p.id===preferred&&shootable(p)):undefined;
        let carrier:PlayerData|undefined;
        for(const c of this.carrierSight.known)if(c.seen&&shootable(c.rat)){carrier=c.rat;break;}
        this.shotTarget=chosen??carrier??vulnerable.find(p=>p.id===wantedId)??vulnerable.find(p=>p.id===this.shotTarget?.id)??vulnerable[0];
        // Do not interrupt your own scoring, or keep shooting a nearby
        // loose case away while attempting to collect it.
        this.bell=state?.dispatch.phase==='ready'&&!quietBell&&!this.shotTarget ? DISPATCH_STATIONS.map(station=>station.target)
            .filter(target=>distance(self,target)<26&&clearControl(target))
            .sort((a,b)=>distance(self,a)-distance(self,b))[0] : undefined;
    }

    /** Gunfire from rats out of sight (the rat turns toward it), and how the fight's rival has been firing. A
     * few times a second. */
    private listen(now:number,self:PlayerData,state:ChaosState|undefined,rival:string|undefined):void {
        if(now<this.listenAt||!state)return;
        this.listenAt=now+150;
        let shots=0,newest=Infinity;
        for(const shot of state.shots){
            if(!shot.owner||shot.owner===self.id)continue;
            if(shot.owner===rival){shots++;newest=Math.min(newest,shot.age);continue;}
            if(shot.age>.25||now<this.heard.next)continue;
            const ox=shot.p.x-shot.v.x*shot.age,oz=shot.p.z-shot.v.z*shot.age;
            if(Math.hypot(ox-self.x,oz-self.z)>60||this.visible.some(p=>p.id===shot.owner))continue;
            this.heard.x=ox;this.heard.y=shot.p.y-shot.v.y*shot.age-EYE;this.heard.z=oz;this.heard.until=now+HEARD.lookMs[0]+this.motorRandom()*(HEARD.lookMs[1]-HEARD.lookMs[0]);
            this.heard.next=this.heard.until+HEARD.quietMs[0]+this.motorRandom()*(HEARD.quietMs[1]-HEARD.quietMs[0]);
        }
        this.rivalShots=shots;this.rivalNewest=newest;
    }

    /** The rest of the tick: move along the plan, fight and fire. */
    drive(now: number, self: PlayerData, state: ChaosState | undefined,
        clear: (target: Vec3Data) => boolean, blocked: boolean, grounded: boolean,
        clearControl: (target: Vec3Data) => boolean): RatControls {
        const assignment=state?.assignment,time=state?.time??now;
        const dt=this.lastDriveAt===undefined?0:Math.min(.1,Math.max(0,(now-this.lastDriveAt)/1000));this.lastDriveAt=now;
        if(dt>0)this.ownSpeed+=(Math.min(30,Math.hypot(self.x-this.lastX,self.z-this.lastZ)/dt)-this.ownSpeed)*Math.min(1,dt*6);
        this.lastX=self.x;this.lastZ=self.z;
        if(self.hp<this.lastHp&&this.lastHp!==Infinity){this.aim.hit(now);this.hitAt=now;}
        this.lastHp=self.hp;
        const eye=this.eye;eye.x=self.x;eye.y=self.y+EYE;eye.z=self.z;
        this.aim.begin(this.bodyFacing(self));
        // Follow moving objectives without retaining an obsolete snapshot vector. A followed rat's
        // destination is its own record, so it tracks the rat's live position already.
        this.followCase();
        if(this.shotTarget&&this.shotTarget.hp<=0){this.aim.disengage(now);this.shotTarget=undefined;}
        if(!this.progressSet){
            this.progressSet=true;this.progressPosition.x=self.x;this.progressPosition.y=self.y;this.progressPosition.z=self.z;this.progressAt=now;
            this.counted[0].x=self.x;this.counted[0].y=self.y;this.counted[0].z=self.z;this.countedSpots=1;
        }
        if(now-this.progressAt>1500){
            if(this.launchWaitAt===undefined&&!this.pendingPlan&&this.routeIndex<this.route.length&&this.destination&&distance(self,this.destination)>3&&Math.hypot(self.x-this.progressPosition.x,self.z-this.progressPosition.z)<1.1&&grounded){
                this.recoverUntil=now+550;this.planAt=this.recoverUntil;this.route=[];
            }
            this.progressPosition.x=self.x;this.progressPosition.y=self.y;this.progressPosition.z=self.z;this.progressAt=now;
        }
        // Holding the plan's zone with the case: Jurisdiction's active zone, or a camper's spot.
        const held=this.mode==='zone-hold'&&assignment?.phase==='active'?this.holdZone:undefined;
        const holdingZone=held&&state?.case.owner===self.id&&zoneContains(held,self)?held:undefined;
        if(!holdingZone)this.zoneHold.reset();
        else {this.pendingPlan=undefined;this.route=[];this.routeIndex=0;this.routeWaitStarted=undefined;this.recoverUntil=0;}
        if(this.tactics.joyride)this.joyride(now,self,state,grounded,!!holdingZone);
        else this.ride=undefined;
        const ride=this.ride,riding=this.flight?.free?this.flight:undefined;
        // A joyride ends on any landing, wherever the throw and the steering took the rat.
        if(riding&&(grounded&&now-riding.started>1000||now-riding.started>15000)){this.flight=undefined;this.urgent=true;this.planAt=0;this.rideAt=now+RIDE.restMs;}
        const routeDestination=ride?ride.machine.pad:this.destination&&(this.navigation.travelPoint?.(self,this.destination)??this.destination);
        this.planRoute(now,self,routeDestination,!!holdingZone,grounded);
        // Waypoints close by count as reached; as progress only well clear of the last few counted spots (a rat
        // hopping up the next flight and back, or pacing a stair landing and the flight's foot, reaches the same
        // few nodes again).
        while(this.routeIndex<this.route.length&&!this.route[this.routeIndex].launch&&!this.route[this.routeIndex].drop&&distance(self,this.route[this.routeIndex])<1.8){
            this.routeIndex++;
            if(this.clearOfCounted(self)){
                const spot=this.counted[this.countedSpots%PROGRESS_SPOTS];spot.x=self.x;spot.y=self.y;spot.z=self.z;
                this.countedSpots++;this.progress++;
            }
        }
        // Passing nodes while cutting corners moves the route on but is not counted: re-attaching after each
        // search would count the same patch again, and pacing a pocket must never look like progress.
        if(this.routeIndex<this.route.length)this.routeIndex=this.steer.passed(self,this.route,this.routeIndex);
        let waypoint:BotWaypoint|undefined=this.route[this.routeIndex];
        if(waypoint?.drop&&distance(self,waypoint)<2.5){
            this.flight={landing:waypoint.drop,started:now};return this.fly(now,self,false)!;
        }
        if(waypoint?.launch&&Math.hypot(self.x-waypoint.launch.machine.pad.x,self.z-waypoint.launch.machine.pad.z)<2.5&&Math.abs(self.y-waypoint.y)<1){
            this.launchWaitAt??=now;
            // Standing alone fills a machine in 10 s; give up only well past that.
            if(now-this.launchWaitAt>12500){this.launchWaitAt=undefined;this.failGoal(now);waypoint=undefined;}
            else return this.workPad(now,self,state,waypoint.launch.machine,grounded,clearControl);
        }
        if(ride&&Math.hypot(self.x-ride.machine.pad.x,self.z-ride.machine.pad.z)<2.5&&Math.abs(self.y-ride.machine.pad.y)<1)return this.workPad(now,self,state,ride.machine,grounded,clearControl);
        // Defend an interception post from a spot near it, changing spots at irregular intervals.
        const guarding=this.mode==='intercept'&&!!this.destination&&distance(self,this.destination)<6&&grounded;
        if(!guarding)this.post=undefined;
        else if(!this.post||now>=this.postAt){
            this.postAt=now+1500+this.motorRandom()*3000;
            const angle=this.motorRandom()*Math.PI*2,reach=2+this.motorRandom()*3;
            this.post=this.navigation.localStep?.(self,{x:this.destination!.x+Math.sin(angle)*reach,y:this.destination!.y,z:this.destination!.z+Math.cos(angle)*reach});
        }
        if(!holdingZone&&!waypoint&&!guarding&&this.destination){
            // A reached step is replaced at once: a player does not let go of the keys between steps.
            if((now>=this.localStepAt||!!this.localWaypoint&&distance(self,this.localWaypoint)<.6&&now>=this.localStepAt-100)&&!this.jumpTravel){
                this.localStepAt=now+150;
                const goal=routeDestination??this.destination,next=this.navigation.localStep?.(self,goal),way=this.localWay;
                // Round an obstacle toward the goal, a new detour (a step that does not head straight at the goal and turns
                // away from the last one) gives way to carrying on the same way while that is walkable and still gains
                // ground, as a player keeps a key down instead of zig-zagging between the ways round.
                this.localWaypoint=next;
                if(next&&way.set){
                    const nx=next.x-self.x,nz=next.z-self.z,n=Math.hypot(nx,nz),gx=goal.x-self.x,gz=goal.z-self.z,g=Math.hypot(gx,gz)||1;
                    if(nx*gx+nz*gz<.995*n*g&&nx*way.x+nz*way.z<.94*n&&way.x*gx+way.z*gz>.5*g){
                        const probe=this.localGoal;probe.x=self.x+way.x*2.5;probe.y=self.y;probe.z=self.z+way.z*2.5;
                        const on=this.navigation.localStep?.(self,probe);
                        if(on&&(on.x-self.x)*way.x+(on.z-self.z)*way.z>.94*Math.hypot(on.x-self.x,on.z-self.z))this.localWaypoint=on;
                    }
                }
                const lx=this.localWaypoint?this.localWaypoint.x-self.x:0,lz=this.localWaypoint?this.localWaypoint.z-self.z:0,l=Math.hypot(lx,lz);
                way.set=l>.3;if(way.set){way.x=lx/l;way.z=lz/l;}
            }
            if(this.localWaypoint&&distance(self,this.localWaypoint)>.3)waypoint=this.localWaypoint;
        }else this.localWay.set=false;
        if(guarding)waypoint=this.post&&distance(self,this.post)>.5?this.post:undefined;
        let approachingCase=false;
        if(this.mode==='case'&&this.destination&&grounded&&!this.jumpTravel&&distance(self,this.destination)<10&&clearControl(this.destination)){
            if(now>=this.approachAt){this.approachAt=now+150;this.approach=this.navigation.approachStep?.(self,this.destination);}
            if(this.approach){waypoint=this.approach;approachingCase=true;}
        }else{this.approach=undefined;this.approachAt=0;}
        let obstacleJump=false;
        if(!holdingZone&&!approachingCase&&!this.jumpTravel&&grounded&&now>=this.jumpProbeAt&&routeDestination&&!waypoint?.launch&&!waypoint?.drop){
            this.jumpProbeAt=now+900;
            const landing=this.navigation.jumpStep?.(self,routeDestination);
            if(landing&&!enemyTrap(self,landing,3,state,clear)){
                waypoint=landing;obstacleJump=true;
                // A hop bypasses the old walking detour. Reattach on landing.
                this.route=[];this.routeIndex=0;this.pendingPlan=undefined;this.plannedDestination=undefined;this.recoverUntil=0;this.planAt=now;
            }
        }
        this.stalled=!waypoint&&!guarding&&!(this.destination&&distance(self,this.destination)<3);
        let x=0,z=0,sharp=true;
        if(waypoint){
            // On the route: run at the furthest point walkable in a straight line, at the rat's own pace.
            const onRoute=waypoint===this.route[this.routeIndex];
            if(onRoute)this.steer.pursue(now,self,this.route,this.routeIndex,this.ownSpeed,this.navigation);
            const aimAt=onRoute?this.steer.carrot:waypoint;
            const dx=aimAt.x-self.x,dz=aimAt.z-self.z,d=Math.hypot(dx,dz);
            const level=Math.abs(waypoint.y-self.y)<.7,left=this.destination?distance(self,this.destination):Infinity;
            let speed=level&&left>5?this.steer.cruise(now):CAREFUL;
            if(onRoute&&speed>CAREFUL){
                // Ease off into a sharp bend just ahead, and while still swinging round.
                const next=this.route[this.steer.carrotIndex+1];
                if(next&&d<4){
                    const turn=Math.abs(Math.atan2(Math.sin(Math.atan2(next.x-aimAt.x,next.z-aimAt.z)-Math.atan2(dx,dz)),Math.cos(Math.atan2(next.x-aimAt.x,next.z-aimAt.z)-Math.atan2(dx,dz))));
                    if(turn>1)speed*=1-.25*Math.min(1,(turn-1)/1.2);
                }
                if(left<9)speed=Math.max(CAREFUL,Math.min(speed,CAREFUL+(left-5)*2));
            }
            sharp=!onRoute||!level||obstacleJump||approachingCase;
            if(d>.25){
                this.steer.turn(now,dx,dz,sharp,this.dir);
                if(!sharp&&this.steer.behind(dx,dz)>1.2)speed*=.6;
                x=this.dir.x*speed;z=this.dir.z*speed;
            }
        }
        if(!this.pendingPlan&&now<this.recoverUntil){const turn=this.wander%2?1:-1,heading=Math.atan2(x,z)||this.aim.yaw;x=Math.sin(heading+turn*1.05)*5;z=Math.cos(heading+turn*1.05)*5;}
        if(this.mode==='zone-hold'&&this.destination&&distance(self,this.destination)<.8){x=0;z=0;this.stalled=false;}
        // Stop at the objective rather than repeatedly running across the case.
        if(this.destination&&(this.mode==='case'&&distance(self,this.destination)<1.15||this.mode==='dispatch'&&distance(self,this.destination)<1.5)){x=0;z=0;}
        if(guarding||this.destination&&distance(self,this.destination)<3)this.progress++;
        // Tunnel ramps are walking links. Recovery hops hit their arched ceiling.
        // Jump at a ledge just ahead, or when the keys have pushed into something for a moment without moving the rat.
        const stuck=blocked&&this.pushingSince!==undefined&&now-this.pushingSince>=150;
        let jump=!sewerRampAt(self)&&!approachingCase&&grounded&&(obstacleJump||!this.pendingPlan&&now<this.recoverUntil||stuck&&!!waypoint||
            !!waypoint&&waypoint.y-self.y>1.1&&Math.hypot(waypoint.x-self.x,waypoint.z-self.z)<3);
        // Who the fight is with: the target in sight, or where it was seen moments ago.
        const target=this.shotTarget;
        this.protectedVisible=this.visible.filter(p=>p.hp>0&&hasIronclad(state?.buffs,p.id,time));
        const protectedTarget=!!target&&hasIronclad(state?.buffs,target.id,time);
        const casePoint=protectedTarget?exposedCarrierCase(self,target,state,clearControl):undefined;
        const visibleTarget=!!target?.hp&&distance(self,target)<85&&clear(target)&&(!protectedTarget||!!casePoint);
        // Every rat remembers its quarry (a mind may ask for a bank shot); only `tactics.bank` shoots at it.
        if(visibleTarget&&target&&!casePoint){
            const seen=this.sighting??={id:target.id,p:{x:0,y:0,z:0},at:now};
            seen.id=target.id;seen.p.x=target.x;seen.p.y=target.y;seen.p.z=target.z;seen.at=now;
        }
        this.listen(now,self,state,target?.id);
        const seen=this.sighting,recent=!!seen&&!!target&&seen.id===target.id&&now-seen.at<MEMORY_MS;
        const quietZone=holdingZone&&!(visibleTarget&&target&&distance(self,target)<22);
        if(holdingZone&&quietZone){
            this.zoneHold.hold(now,holdingZone,assignment!.jurisdiction?`${assignment!.roundId}:${assignment!.jurisdiction.serial}`:this.key,self,this.navigation,this.holdMove);
            x=this.holdMove.x;z=this.holdMove.z;jump=false;this.stalled=false;this.progress++;
        }
        // A hop never ends the fight: its keys stay held in the air.
        const fighting=this.assignmentActive&&!obstacleJump&&!this.jumpTravel&&!!target&&!protectedTarget&&recent&&!!seen&&
            Math.hypot(seen.p.x-self.x,seen.p.z-self.z)<(this.tactics.reach??FIGHT.reach)&&
            (FIGHTING_MODES[this.mode]||this.mode!=='pickup'&&(this.tactics.stance==='fight'||now-this.hitAt<FIGHT_BACK_MS)||this.mode==='carrier'&&Math.hypot(seen.p.x-self.x,seen.p.z-self.z)<12||!!holdingZone&&!quietZone);
        // With nowhere to run (at its case, beside the carrier it chases) and a rat in sight close by, the keys
        // stay busy as in a fight: players hardly ever stand still near a rival. This is not progress.
        const near=this.visible[0];
        // Once the keys are busy they stay busy a moment: a route that comes and goes must not flicker them.
        const idleNear=!fighting&&!holdingZone&&!obstacleJump&&!this.jumpTravel&&(Math.hypot(x,z)<1||now<this.idleUntil)&&!!near&&near.hp>0&&distance(self,near)<FIGHT.reach;
        if(idleNear&&now>=this.idleUntil)this.idleUntil=now+IDLE_MS;
        if(fighting||idleNear){
            const hurt=self.hp<=2||(this.tactics.danger??0)>=2&&self.hp<=3||now-this.hitAt<1500&&self.hp<=3;
            const push=fighting&&(!!target&&target.hp<=2&&self.hp>=3||this.rivalShots>=3&&this.rivalNewest>.35);
            const view=this.view;
            view.now=now;view.self=self;view.enemy=fighting?seen!.p:near!;view.look=this.aim.yaw;view.visible=fighting?visibleTarget:true;view.hurt=hurt;view.push=push;view.airborne=!grounded;
            view.range=this.tactics.range??FIGHT.range;
            if(holdingZone&&this.leashZone!==holdingZone){const zone=this.leashZone=holdingZone;this.leash=(from,to)=>zoneStepSafe(zone,from,to);}
            view.leash=holdingZone?this.leash:undefined;
            this.fight.run(view);
            x=this.fight.move.x;z=this.fight.move.z;if(holdingZone)jump=false;
            if(fighting){this.stalled=false;this.progress++;}
        }else this.fight.reset();
        // On a joyride, out of a fight: steer for the destination through the air (the drift is pressed against).
        if(this.flight?.free&&!grounded&&!fighting){
            const to=this.destination??this.flight.landing,dx=to.x-self.x,dz=to.z-self.z,d=Math.hypot(dx,dz),speed=Math.min(RAT_MOVEMENT.run,d*2);
            x=d>.5?dx/d*speed:0;z=d>.5?dz/d*speed:0;jump=false;this.stalled=false;
        }
        // Players hop as they fight, jump-strafing and shooting in the air: the space bar, pressed some time
        // after each landing while a rival is close.
        if(grounded&&!this.wasGrounded)this.hopAt=now+HOP.afterMs-Math.log(1-this.motorRandom()*.999)*HOP.tailMs;
        this.wasGrounded=grounded;
        const hop=!jump&&grounded&&now>=this.hopAt&&(fighting||visibleTarget&&!!target&&distance(self,target)<FIGHT.reach)&&!holdingZone&&
            !this.jumpTravel&&!sewerRampAt(self)&&!approachingCase&&!obstacleJump&&!waypoint?.launch&&!waypoint?.drop;
        if(hop){jump=true;this.hopAt=now+400;this.hopClicks=2;this.hopClickAt=now;}
        if(this.hopClicks&&now>this.hopClickAt+HOP.clickWindowMs)this.hopClicks=0;
        const bell=this.bell;
        const dispatchReady=!!bell&&state?.dispatch.phase==='ready'&&clearControl(bell);
        // Follow an armored carrier without running into their gun at point-blank range.
        if(!obstacleJump&&this.mode==='carrier'&&this.destination&&grounded){
            const carrier=this.protectedVisible.find(p=>`carrier:${p.id}`===this.key);
            if(carrier&&distance(self,carrier)<10){
                const dx=self.x-carrier.x,dz=self.z-carrier.z,d=Math.hypot(dx,dz)||1;
                const safe=this.navigation.localStep?.(self,{x:self.x+dx/d*4,y:self.y,z:self.z+dz/d*4});
                const sx=safe?safe.x-self.x:0,sz=safe?safe.z-self.z:0,len=Math.hypot(sx,sz);
                if(len){x=sx/len*6;z=sz/len*6;}
            }
        }
        // Aim and fire: a bell, another rat's Mousetrap in the way, a gremlin's trick, the rival in sight, a bank at one
        // just hidden, fire where one just was, and otherwise a look ahead with the odd speculative group.
        const laser=this.weapon==='laser',tommy=this.weapon==='tommy-gun',trapping=this.weapon==='mousetrap';
        const mischief=this.tactics.mischief&&!holdingZone&&!dispatchReady?this.tricks.mischief(now,self,state,this.visible,clearControl,laser):undefined;
        const clearing=!trapping&&!visibleTarget&&!dispatchReady?this.tricks.clearTrap(now,self,state,x,z,this.destination,clear,laser):undefined;
        if(visibleTarget&&target){
            const point=casePoint??target;
            if(this.aim.engagedId!==target.id)this.trigger.reset();
            this.aim.engage(now,eye,target.id,point,!!casePoint);
        }else if(this.aim.engagedId){
            this.aim.disengage(now);
            if(this.motorRandom()<.35)this.suppressUntil=now+200+this.motorRandom()*500;
        }
        // Crossfire makes a banked ball lethal: every rat with the cheese gun tries bank shots then, whatever its tactics.
        const bank=(this.tactics.bank||this.ballistics==='crossfire')&&!visibleTarget&&!holdingZone&&!dispatchReady&&!mischief&&!clearing?this.tricks.bank(now,self,state,this.sighting,this.protectedVisible,this.navigation,this.ballistics,laser):undefined;
        const suppressing=!visibleTarget&&now<this.suppressUntil&&!!seen;
        const trick=clearing??mischief??bank;
        let shoot:Vec3Data|undefined;
        if(dispatchReady&&bell&&!visibleTarget){
            // The bell is a big box shootable from any side; aim somewhere on it, imperfectly.
            if(now>=this.bellAimAt){this.bellAimAt=now+700;this.bellAim.x=bell.x+(this.motorRandom()-.5)*3;this.bellAim.y=bell.y+(this.motorRandom()-.5)*2.4;this.bellAim.z=bell.z+(this.motorRandom()-.5)*3;}
            this.aim.look(eye,this.bellAim,true);
        }else if(trick&&!visibleTarget)this.aim.look(eye,trick,true);
        else if(suppressing){this.lost.x=seen!.p.x;this.lost.y=seen!.p.y+1.2;this.lost.z=seen!.p.z;this.aim.look(eye,this.lost,true);}
        else if(!visibleTarget)this.preAim(now,self,state,waypoint,x,z,!!holdingZone);
        this.aim.difficulty(visibleTarget&&target?distance(self,target):25,visibleTarget?this.aim.targetSpeed:0,this.ownSpeed);
        this.aim.update(now);
        const facing=this.aim.yaw;
        // The Tommy Gun's trigger is held down (a shot every `tommyIntervalMs`); a Mousetrap's press sets it down instead.
        if(trapping){if(this.setTrap(now,self,state,grounded,visibleTarget))shoot=this.aim.point(eye,30);}
        else if(now>=this.shotAt){
            if(dispatchReady&&bell&&!visibleTarget){
                if(this.aim.offBy(eye,this.bellAim)<.06){shoot=this.aim.point(eye,distance(eye,this.bellAim));this.shotAt=now+350+this.random()*400;}
            }else if(trick&&!visibleTarget){
                // A bank is lined up with care; a chaos shot only needs to be close.
                if(!this.aim.flicking&&this.aim.felt<(trick===bank?0.02:0.05)){shoot=this.aim.point(eye,distance(eye,trick));if(trick===bank)this.tricks.banked();}
            }else if(visibleTarget&&target){
                // Fire once the crosshair is roughly where the rat believes the target is (it cannot see its own miss),
                // as a hand does, not when it is perfect; a player jumping in a fight clicks as the space bar goes down
                // and just after, once the crosshair is near the rival (three times as loose).
                const range=distance(eye,casePoint??target),tolerance=Math.atan2(1.5,range)+.04,click=this.hopClicks>0&&now>=this.hopClickAt;
                if(tommy){if(this.aim.onTarget&&!this.aim.flicking&&this.aim.felt<tolerance*2)shoot=this.aim.point(eye,range);}
                else if(this.aim.onTarget&&!this.aim.flicking&&this.aim.felt<(click?tolerance*3:tolerance)&&this.trigger.pull(now,click)){
                    shoot=this.aim.point(eye,range);
                    if(click){this.hopClicks--;this.hopClickAt=now+HOP.clickMs[0]+this.motorRandom()*(HOP.clickMs[1]-HOP.clickMs[0]);}
                }
            }else if(suppressing){
                if(this.aim.error<.08&&(tommy||this.trigger.pull(now)))shoot=this.aim.point(eye,Math.max(8,distance(self,seen!.p)));
            }else{
                const spray=!holdingZone&&!dispatchReady&&!this.protectedVisible.length&&!(this.mode==='case'&&this.destination&&distance(self,this.destination)<24);
                if(this.spray.pull(now,spray,!bank&&!mischief&&this.aim.error<.3,this.tactics.spray,tommy?WEAPON_TUNING.tommyIntervalMs:undefined))shoot=this.aim.point(eye,this.spray.range);
            }
            // Held, the Tommy Gun fires on the first tick no more than `HELD_SLACK_MS` short of its interval.
            if(shoot&&!(dispatchReady&&bell&&!visibleTarget))this.shotAt=now+(tommy?WEAPON_TUNING.tommyIntervalMs-HELD_SLACK_MS:this.skill.fireGapMs);
        }
        if(shoot&&!trapping&&shotHitsIronclad(self,facing,shoot,this.protectedVisible,state))shoot=undefined;
        if(this.jumpTravel&&!grounded){
            // A floor probe is expected to fail in the air. Keep steering toward
            // the takeoff's landing target, then brake there instead of jumping
            // vertically because a short local walking step disappeared.
            const dx=this.jumpTravel.goal.x-self.x,dz=this.jumpTravel.goal.z-self.z,d=Math.hypot(dx,dz);
            const speed=Math.min(CAREFUL,d*5);x=d>.15?dx/d*speed:0;z=d>.15?dz/d*speed:0;
        }
        // Steer around another rat's Mousetrap the current step would enter.
        // Local, bounded and visible-only: the bot never reads hidden traps, it
        // simply refuses to walk into one it can see ahead of it. Its own trap is harmless to it.
        const traps=state?.traps;
        if(traps?.length&&(x||z)){
            const stepLength=Math.hypot(x,z)||1,nx=x/stepLength,nz=z/stepLength,veered=this.veered;
            veered.x=x;veered.z=z;
            for(const trap of traps)if(trap.owner!==self.id&&trap.brokenAt===undefined)this.veer(self,trap,nx,nz,stepLength,clear);
            x=veered.x;z=veered.z;
        }
        if(jump&&!hop&&Math.hypot(x,z)>.5){
            const speed=Math.hypot(x,z),goal=waypoint&&!holdingZone?waypoint:{x:self.x+x/speed*3,y:self.y,z:self.z+z/speed*3};
            this.jumpTravel={goal:{x:goal.x,y:goal.y,z:goal.z},started:now};
        }
        // Check the final composed intent, including buffs and trap avoidance.
        if(holdingZone&&!zoneStepSafe(holdingZone,self,{x:self.x+x*.35,y:self.y,z:self.z+z*.35},.6)){
            x=0;z=0;jump=false;this.jumpTravel=undefined;this.zoneHold.invalidate();
        }
        return this.controls(self,x,z,jump,shoot);
    }

    /** Where the eyes go with no rival in sight: a rat just lost, gunfire just heard, the case being run at, the
     * zone's approaches, the carrier's side of an intercept, else where it runs, as a player steers with the mouse
     * over held keys. Now and then, a glance to the side. */
    private preAim(now:number,self:PlayerData,state:ChaosState|undefined,waypoint:Vec3Data|undefined,x:number,z:number,holding:boolean):void {
        const eye=this.eye,seen=this.sighting;
        if(seen&&now-seen.at<MEMORY_MS){this.aim.look(eye,seen.p);return;}
        if(now<this.heard.until){this.aim.look(eye,this.heard);return;}
        if(holding&&this.zoneHold.look){this.aim.look(eye,this.zoneHold.look);return;}
        if(this.mode==='case'&&this.destination&&distance(self,this.destination)<30){this.aim.look(eye,this.destination,true);return;}
        const carried=this.mode==='intercept'&&this.post!==undefined&&state?.case.owner&&state.case.owner!==self.id?this.carrierSight.caseAt('case',state.case,self.id):undefined;
        if(carried){this.aim.look(eye,carried);return;}
        if(now>=this.glanceAt){this.glanceAt=now+8000+this.motorRandom()*12000;this.glanceUntil=now+350+this.motorRandom()*450;this.glanceTurn=(this.motorRandom()<.5?-1:1)*(.5+this.motorRandom()*.5);}
        const running=Math.hypot(x,z)>1;
        if(now<this.glanceUntil&&running){this.aim.lookAlong(Math.atan2(x,z)+this.glanceTurn);return;}
        if(running){this.aim.lookAlong(Math.atan2(x,z),true);return;}
        if(waypoint&&distance(self,waypoint)>2)this.aim.look(eye,waypoint);
    }

    /** Turn the step aside (into `veered`) from a hazard at `p` it would enter: on this level, ahead within 8 along
     * the step (nx, nz), beside it within 3, in sight; it goes to the side the hazard is not on. */
    private veer(self:Vec3Data,p:Vec3Data,nx:number,nz:number,stepLength:number,clear:(p:Vec3Data)=>boolean):void {
        const dx=p.x-self.x,dz=p.z-self.z,ahead=dx*nx+dz*nz;
        if(ahead<=0||ahead>8||Math.abs(p.y-self.y)>2.5)return;
        // Right-hand perpendicular; steer to the side the trap is not on.
        const side=dx*nz-dz*nx;
        if(Math.abs(side)>3||!clear(p))return;
        const away=side>=0?-1:1;
        this.veered.x=nx*stepLength*.5+nz*away*stepLength*1.2;
        this.veered.z=nz*stepLength*.5-nx*away*stepLength*1.2;
    }

    /** Whether to press fire now to set the Mousetrap in paw down (`TRAP`): on the ground, once it has come up into the
     * paw (the swap a human watches, `trapLockMs`; the room refuses earlier presses), where the press puts it
     * (`trapReach` ahead along the crosshair) is a floor with nothing solid in between, and the spot is useful. */
    private setTrap(now:number,self:PlayerData,state:ChaosState|undefined,grounded:boolean,rival:boolean):boolean {
        const since=this.trapHeldAt;
        if(since===undefined||now-since<TRAP.settleMs||now<this.trapPressAt||now<this.trapLookAt||!grounded||this.jumpTravel||this.flight)return false;
        this.trapLookAt=now+TRAP.lookMs;
        const nav=this.navigation,ray=nav.ray,reach=WEAPON_TUNING.trapReach,sx=Math.sin(this.aim.yaw),sz=Math.cos(this.aim.yaw);
        const spot=this.trapSpot,from=this.trapRay,to=this.trapTo;
        spot.x=self.x+sx*reach;spot.y=self.y;spot.z=self.z+sz*reach;
        if(nav.supported&&!nav.supported(spot))return false;
        from.x=self.x;from.y=self.y+.5;from.z=self.z;to.x=spot.x;to.y=self.y+.5;to.z=spot.z;
        if(ray?.(from,to))return false;
        let useful=rival||now-since>=this.trapPatience||this.nearObjective(spot,self.id,state);
        if(!useful&&ray){
            // A doorway or an alley: walls close on both sides of the spot.
            from.x=spot.x;from.y=self.y+.8;from.z=spot.z;to.y=from.y;
            to.x=spot.x+sz*TRAP.choke;to.z=spot.z-sx*TRAP.choke;
            if(ray(from,to)){to.x=spot.x-sz*TRAP.choke;to.z=spot.z+sx*TRAP.choke;useful=!!ray(from,to);}
        }
        if(useful)this.trapPressAt=now+TRAP.retryMs;
        return useful;
    }
    /** The spot is within `TRAP.objective` of the case (where this rat knows it is), the active Jurisdiction zone or the drop-off. */
    private nearObjective(spot:Vec3Data,selfId:string,state:ChaosState|undefined):boolean {
        if(!state)return false;
        const known=this.carrierSight.caseAt('case',state.case,selfId);
        if(known&&distance(spot,known)<TRAP.objective)return true;
        const assignment=state.assignment;
        if(assignment?.phase!=='active')return false;
        const j=assignment.jurisdiction;
        if(j){const zone=activeZone(j);if(zoneContains(zone,spot)||distance(spot,JURISDICTION_ZONES[zone].posts[0])<TRAP.objective)return true;}
        const destination=activeDestination(assignment);
        return !!destination&&distance(spot,destinationPoint(destination))<TRAP.objective;
    }

    /** Stand on a launcher's pad and fire real cheese at its trigger until the machine throws. Only the
     * authoritative launch event starts flight steering. */
    private workPad(now:number,self:PlayerData,state:ChaosState|undefined,machine:LaunchMachine,grounded:boolean,clearControl:(p:Vec3Data)=>boolean):RatControls {
        const target=machine.target,eye=this.eye;
        const dx=machine.pad.x-self.x,dz=machine.pad.z-self.z,d=Math.hypot(dx,dz);
        // A ball is lobbed onto the trigger; a Laser beam goes straight.
        const travel=this.weapon==='laser'?0:Math.hypot(target.x-self.x,target.z-self.z)/BALL_SPEED;
        const lob={x:target.x,y:target.y-BALL_GRAVITY*travel*travel/2,z:target.z};
        this.aim.look(eye,lob,true);this.aim.update(now);
        let shoot:Vec3Data|undefined;
        // Standing builds pressure; every hit on the trigger adds more. Keep pumping it (a Mousetrap in paw is kept
        // for a better spot than the pad).
        const cooling=(state?.time??now)<(state?.pressure?.fired?.[machine.id]??-Infinity)+PRESSURE_TUNING.cooldownMs;
        if(d<.6&&grounded&&this.weapon!=='mousetrap'&&now>=this.shotAt&&!cooling&&this.aim.offBy(eye,lob)<.05&&clearControl(target)){
            shoot=this.aim.point(eye,distance(eye,lob));this.shotAt=now+350;
        }
        const speed=d>.25?Math.min(6,d*4):0;
        this.stalled=false;this.progress++;
        return this.controls(self,d?dx/d*speed:0,d?dz/d*speed:0,false,shoot);
    }

    /** A joyrider's choice of ride (`RIDE`), or giving up one never thrown. Never with the case, in a held zone, or
     * on the way to a supply or an alarm pillar; the plan's goal is untouched, so the game carries on either way. */
    private joyride(now:number,self:PlayerData,state:ChaosState|undefined,grounded:boolean,holding:boolean):void {
        let carrying=false;for(const c of this.cases)if(c.value.owner===self.id){carrying=true;break;}
        const errand=this.mode==='pickup'||this.mode==='dispatch'||this.mode==='zone-hold';
        const ride=this.ride;
        if(ride){
            if(now<ride.until&&!holding&&!carrying&&!errand&&this.destination)return;
            if(now>=ride.until)this.remember(`ride:${ride.machine.id}`,ride.machine.pad,now+RIDE.retryMs);
            this.ride=undefined;this.rideAt=now+RIDE.checkMs;return;
        }
        if(now<this.rideAt||!grounded||this.flight||holding||carrying||errand||!this.destination||!state)return;
        this.rideAt=now+RIDE.checkMs;
        const to=this.destination,far=distance(self,to),roaming=this.mode==='explore';
        if(!roaming&&far<RIDE.far)return;
        let best:LaunchMachine|undefined,bestAt:number=RIDE.reach;
        for(const machine of LAUNCH_MACHINES){
            const pad=machine.pad,d=Math.hypot(pad.x-self.x,pad.z-self.z);
            if(d>=bestAt||Math.abs(pad.y-self.y)>2||!roaming&&d+distance(pad,to)-far>RIDE.detour||this.suppressed(`ride:${machine.id}`,pad,now))continue;
            best=machine;bestAt=d;
        }
        if(best)this.ride={machine:best,since:now,until:now+RIDE.ms};
    }

    /** Search a route toward the travel point when due; attach it at the nearest supported waypoint. */
    private planRoute(now:number,self:PlayerData,routeDestination:Vec3Data|undefined,holdingZone:boolean,grounded:boolean):void {
        const movedGoal=routeDestination&&this.plannedDestination&&distance(routeDestination,this.plannedDestination)>7;
        if(!routeDestination||holdingZone||this.jumpTravel||now<this.planAt||!(this.pendingPlan||this.routeIndex>=this.route.length||movedGoal)||!(grounded||this.navigation.supported?.(self)))return;
        // Attach searches while supported, never to an upstairs node mid-jump.
        // Queue/cache keys include the start. Keep BOTH endpoints stable
        // while an incremental search runs, even if momentum moves the rat.
        // A moving case/carrier may replace a stale goal, at most once/sec.
        if(!this.pendingPlan||(now-this.pendingPlan.started>=1000&&distance(routeDestination,this.pendingPlan.to)>7)){
            this.pendingPlan={from:{x:self.x,y:self.y,z:self.z},to:{...routeDestination},started:now};
            this.routeProgressGoal={...routeDestination};this.bestRouteDistance=distance(self,routeDestination);
        }
        const pending=this.pendingPlan;
        const route=this.navigation.route(pending.from,pending.to);
        if(route?.length){
            let nearest=-1,nearestDistance=4;
            for(let i=0;i<route.length;i++){
                const d=distance(self,route[i]);
                if(Math.abs(self.y-route[i].y)<1.5&&d<=nearestDistance){nearest=i;nearestDistance=d;}
            }
            if(nearest<0&&(distance(self,pending.from)>3||Math.abs(self.y-route[0].y)>=1.5)){
                // The old origin is no longer a usable attachment, including
                // a waypoint upstairs after landing below it. Replan from
                // the supported current pose instead of chasing that node.
                this.pendingPlan=undefined;this.plannedDestination=undefined;this.planAt=now+150;
            }else{
                this.route=route;this.routeIndex=Math.max(0,nearest);this.plannedDestination=pending.to;this.steer.carrotIndex=-1;
                this.pendingPlan=undefined;this.routeWaitStarted=undefined;this.routeProgressGoal=undefined;
                this.planAt=now+900+this.random()*400;if(this.key==='case')this.failedCase=undefined;
            }
        }else{
            // A denied shared budget has not submitted/failed a search.
            if(route!==undefined)this.routeWaitStarted??=now;
            this.planAt=now+(now-pending.started>5000?1000:140+this.random()*160);
        }
    }
}
