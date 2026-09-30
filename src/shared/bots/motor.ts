import {sewerRampAt} from '../sewerLayout';
import {BotManeuver} from './motor/BotManeuver';
import {BotPurposefulHolding} from './motor/BotPurposefulHolding';
import {BotAttention} from './motor/BotAttention';
import {BotOpportunisticFire} from './motor/BotOpportunisticFire';
import {zoneStepSafe} from './motor/zoneStepSafe';
import {activeZone} from '../jurisdiction';
import {zoneContains} from '../jurisdictionZones';
import {BotCombat,combatRandom} from '../BotCombat';
import {exposedCarrierCase,shotHitsIronclad} from '../BotTargeting';
import {DISPATCH_STATIONS,LAUNCH_MACHINES,PRESSURE_TUNING,type CaseState,type ChaosState} from '../chaosState';
import {incidentInfo} from '../incidentCatalog';
import {hasHustle,hasIronclad,PICKUP_TUNING} from '../pickups';
import type {PlayerData,Vec3Data} from '../networkProtocol';
import type {BotWaypoint} from '../BotLaunchRoutes';
import {BALL_GRAVITY,BALL_SPEED} from '../ballTuning';
import {BASE_SKILL,type MotorMode,type Plan,type SkillDials} from './intent';
import {BANK,bankShot,type RayHit} from './motor/bankShot';

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
    explorationTargets(): Vec3Data[];
    update?(budgetMs?: number): void;
    /** The first solid surface on a segment, with its normal; undefined when clear. Bank shots need it. */
    ray?(from:Vec3Data,to:Vec3Data):RayHit|undefined;
}
/** One tick's controls: walking velocity, a jump, an optional shot and the gun's facing. */
export interface MotorIntent { x: number; z: number; jump: boolean; zoneHop?: boolean; shoot?: Vec3Data; facing: number }
/** A genuine (collectible) case under its goal key: `case` for the primary, `case:<id>` for extras. */
export interface CaseEntry { key:string; value:CaseState }
export const distance = (a: Vec3Data, b: Vec3Data) => Math.hypot(a.x-b.x, a.z-b.z, a.y-b.y);
const ROUTE_WAIT_MS=6000,FAILED_GOAL_RETRY_MS=12000;
/** Gremlin mischief: a counterfeit is shot when another rat is within `bait` of it and this rat further than
 * `safe`; a trigger when another rat stands on its pad. Targets within `range`, looked for every `lookMs`. */
const MISCHIEF={bait:5,safe:10,range:50,lookMs:200} as const;

/** Firing beyond the aimed and speculative shots every rat takes. */
export interface Tactics {
    /** Bank shots at a rat that just went behind cover. */
    bank:boolean;
    /** Shoot counterfeits next to other rats and launch triggers under them. */
    mischief:boolean;
}
/** The moving half of a bot: executes the current Plan every tick (routes, launches and flights, local
 * steps, case approaches, obstacle jumps, zone holding, strafing, Ironclad caution) and fires whenever it
 * has a shot, whatever the goal. It also keeps the per-goal failure memory the goal code consults.
 * Combat uses visible observations and imperfect aim; speculative shots follow local routes without
 * reading hidden opponents. */
export class BotMotor {
    mode: MotorMode = 'explore';
    key = '';
    destination?: Vec3Data;
    /** Seeded walk index shared by the patrol angle, the recovery turn and the exploration choice. */
    wander: number;
    /** Something happened (a case changed hands, a goal failed, a landing) that warrants deciding now. */
    urgent = false;
    private shotTarget?: PlayerData;
    private protectedVisible:PlayerData[]=[];
    private visible:PlayerData[]=[];
    private caseAim=false;
    /** A ready Dispatch control in ringing range; shot in passing. */
    private bell?: Vec3Data;
    private route: BotWaypoint[] = [];
    private flight?:{landing:Vec3Data;started:number};
    private jumpTravel?:{goal:Vec3Data;started:number};
    private jumpProbeAt=0;
    private approachAt=0;
    private approach?:Vec3Data;
    private launchWaitAt?:number;
    private routeIndex = 0;
    private plannedDestination?: Vec3Data;
    private pendingPlan?: { from: Vec3Data; to: Vec3Data; started: number };
    private routeWaitStarted?:number;
    private routeProgressGoal?:Vec3Data;
    private bestRouteDistance=Infinity;
    private localWaypoint?:Vec3Data;
    private localStepAt=0;
    private readonly failedGoals=new Map<string,{position:Vec3Data;until:number}>();
    private failedCase?:Vec3Data;
    private stalled=false;
    private planAt = 0;
    private shotAt = 0;
    private readonly combat: BotCombat;
    private readonly opportunisticFire: BotOpportunisticFire;
    private jumpAt = 0;
    private progressAt = 0;
    private progressPosition?: Vec3Data;
    private recoverUntil = 0;
    private heading = 0;
    private cases:CaseEntry[]=[];
    private readonly caseLifecycles=new Map<string,{owner:string|null;returning:boolean}>();
    private assignmentSignature = '';
    private assignmentActive=false;
    private readonly zoneHolding:BotPurposefulHolding;
    private readonly maneuver:BotManeuver;
    private readonly attention=new BotAttention();
    private progress=0;
    /** Set at each decision from the rat's personality and its mind's answer. */
    tactics:Tactics={bank:false,mischief:false};
    private sighting?:{id:string;p:Vec3Data;at:number};
    private bankAt=0;
    private bankAim?:{point:Vec3Data;until:number};
    private mischiefAt=0;
    private mischiefAim?:Vec3Data;
    private readonly tacticRandom:()=>number;
    constructor(private readonly navigation: MotorNavigation, seed: number, private readonly random: () => number,private readonly skill:SkillDials=BASE_SKILL) {
        this.zoneHolding=new BotPurposefulHolding(seed);this.maneuver=new BotManeuver(seed);
        this.combat = new BotCombat(combatRandom(seed),skill);
        this.opportunisticFire = new BotOpportunisticFire(combatRandom(seed+10000));
        this.tacticRandom=combatRandom(seed+30000);
        this.wander = seed * 7;
    }
    /** True while steering a planned launcher or drop flight onto a known landing. */
    get flyingRoute():boolean {return !!this.flight;}
    /** Initial pending work counts as stalled until a usable route or reached goal exists. */
    get navigationStalled():boolean{return this.stalled;}
    /** Counts genuine progress: a route waypoint reached, the goal reached or held, a launch pad worked, a
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
    /** The rat last shot at while in sight, where and when: a bank shot's quarry once it hides. */
    get sighted():Readonly<{id:string;p:Vec3Data;at:number}>|undefined{return this.sighting;}
    reset(): void {
        this.jumpTravel=undefined;this.jumpProbeAt=0;this.approach=undefined;this.approachAt=0;this.maneuver.reset();this.attention.reset();this.protectedVisible=[];this.visible=[];this.caseAim=false;this.zoneHolding.reset();
        this.assignmentActive=false;
        this.combat.reset();this.opportunisticFire.reset();this.shotAt=0;
        this.key='';this.shotTarget=undefined;this.bell=undefined;this.destination=undefined;this.route=[];this.routeIndex=0;
        this.plannedDestination=undefined;this.pendingPlan=undefined;this.planAt=0;this.progressPosition=undefined;this.recoverUntil=0;
        this.routeWaitStarted=undefined;this.failedGoals.clear();this.failedCase=undefined;this.stalled=false;
        this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;
        this.caseLifecycles.clear();this.cases=[];
        this.flight=undefined;this.launchWaitAt=undefined;
        this.assignmentSignature='';this.urgent=false;
        this.sighting=undefined;this.bankAim=undefined;this.bankAt=0;this.mischiefAim=undefined;this.mischiefAt=0;
    }
    /** Take the decision's plan. A new key restarts routing; the same key keeps the current route. */
    setPlan(plan:Plan): void {
        if(this.key!==plan.key){this.approach=undefined;this.approachAt=0;this.maneuver.reset();this.launchWaitAt=undefined;this.route=[];this.routeIndex=0;this.plannedDestination=undefined;this.pendingPlan=undefined;this.routeWaitStarted=undefined;this.recoverUntil=0;this.planAt=0;this.key=plan.key;
            this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;}
        this.mode=plan.mode;this.destination=plan.destination;
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
            const copy={x:position.x,y:position.y,z:position.z};
            const retry=this.assignmentActive&&['case','carrier','delivery','zone-hold'].includes(this.mode)?4000:FAILED_GOAL_RETRY_MS;
            this.failedGoals.set(this.failureKey(this.key),{position:copy,until:now+retry});
            if(this.key==='case')this.failedCase=copy;
            if(this.failedGoals.size>32)this.failedGoals.delete(this.failedGoals.keys().next().value!);
        }
        this.route=[];this.routeIndex=0;this.pendingPlan=undefined;this.routeWaitStarted=undefined;
        this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;
        this.plannedDestination=undefined;this.destination=undefined;this.urgent=true;this.planAt=0;this.recoverUntil=0;
    }

    private fly(now:number,self:Vec3Data,grounded:boolean):MotorIntent|undefined {
        const flight=this.flight;if(!flight)return;
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
        if(d>.1&&speed)this.heading=Math.atan2(dx,dz);
        return {x:d>.1&&speed>0?dx/d*speed:0,z:d>.1&&speed>0?dz/d*speed:0,jump:false,facing:this.heading};
    }

    /** The start of a tick: death, launcher flights and authoritative launches take over the controls. */
    begin(now:number,self:PlayerData,state:ChaosState|undefined,grounded:boolean):MotorIntent|undefined {
        if(self.hp<=0){this.jumpTravel=undefined;this.maneuver.reset();this.attention.reset();this.zoneHolding.reset();this.flight=undefined;this.launchWaitAt=undefined;this.combat.reset();this.opportunisticFire.reset();this.stalled=false;return{x:0,z:0,jump:false,facing:this.heading};}
        if(this.jumpTravel&&(now-this.jumpTravel.started>2200||grounded&&now-this.jumpTravel.started>250))this.jumpTravel=undefined;
        const airborne=this.fly(now,self,grounded);if(airborne)return airborne;
        const launchStep=this.route[this.routeIndex]?.launch;
        const launch=launchStep&&state?.pressure?.launches.find(e=>e.playerId===self.id&&e.machineId===launchStep.machine.id&&
            e.at>=(this.launchWaitAt??now)&&now-e.at<1500);
        if(launch&&launchStep){
            this.jumpTravel=undefined;this.flight={landing:launchStep.landing,started:now};this.launchWaitAt=undefined;
            return this.fly(now,self,false)!;
        }
    }

    /** Case lifecycle and failure bookkeeping, every tick before any decision. */
    observe(now:number,self:PlayerData,state:ChaosState|undefined):{ownershipChanged:boolean;assignmentChanged:boolean} {
        // Counterfeits are lethal hazards, never objectives: a bot that routed to one
        // would simply kill itself on loop. Only genuine cases are collectible goals.
        const cases=this.cases=state?[{key:'case',value:state.case},...(state.extraCases??[]).filter(value=>!value.fake).map(value=>({key:`case:${value.id}`,value}))]:[];
        // Keep each case's failed position independent. Picking up one extra
        // must not erase the evidence that the primary case is unreachable.
        let ownershipChanged=false,assignmentChanged=false;
        const assignment=state?.assignment;
        this.assignmentActive=assignment?.phase==='active';
        // Cancel body-shot follow-through immediately when the silver coat
        // appears, including during the interval between decisions.
        if(this.shotTarget&&hasIronclad(state?.buffs,this.shotTarget.id,state?.time??now)&&!this.caseAim){
            this.combat.reset();this.shotTarget=undefined;this.urgent=true;
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

    /** At a decision: who is in sight, whom to shoot and whether to ring a bell in passing. Visible carriers
     * first (their exposed case through Ironclad), then Most Wanted, the retained target, the nearest
     * vulnerable rat. A preferred rat (the mind's target) wins when it is visible and shootable. */
    perceive(now:number,self:PlayerData,living:readonly PlayerData[],carriers:readonly PlayerData[],state:ChaosState|undefined,
        clear:(p:Vec3Data)=>boolean,clearControl:(p:Vec3Data)=>boolean,quietBell:boolean,preferred?:string):void {
        const time=state?.time??now;
        const visible=living.filter(p=>distance(self,p)<80&&clear(p)).sort((a,b)=>distance(self,a)-distance(self,b));
        this.visible=visible;
        // A rat seen dying (the kill feed) is not banked at.
        if(this.sighting&&!living.some(p=>p.id===this.sighting?.id))this.sighting=undefined;
        this.protectedVisible=visible.filter(p=>hasIronclad(state?.buffs,p.id,time));
        const vulnerable=visible.filter(p=>!hasIronclad(state?.buffs,p.id,time));
        const shootable=(p:PlayerData)=>vulnerable.includes(p)||!!exposedCarrierCase(self,p,state,clearControl);
        // Keep a visible opponent through a burst instead of resetting reaction
        // every time two similarly close rats trade places. Visible carriers still win.
        // Most Wanted: the leader is in a searchlight everyone can see; hunt them for the bounty.
        const wantedId=state?.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='most-wanted'?state.dispatch.wanted:undefined;
        const chosen=preferred?visible.find(p=>p.id===preferred&&shootable(p)):undefined;
        this.shotTarget=chosen??carriers.find(p=>visible.includes(p)&&shootable(p))??vulnerable.find(p=>p.id===wantedId)??vulnerable.find(p=>p.id===this.shotTarget?.id)??vulnerable[0];
        // Do not interrupt your own scoring, or keep shooting a nearby
        // loose case away while attempting to collect it.
        this.bell=state?.dispatch.phase==='ready'&&!quietBell&&!this.shotTarget ? DISPATCH_STATIONS.map(station=>station.target)
            .filter(target=>distance(self,target)<26&&clearControl(target))
            .sort((a,b)=>distance(self,a)-distance(self,b))[0] : undefined;
    }

    /** The rest of the tick: move along the plan, fight and fire. */
    drive(now: number, self: PlayerData, state: ChaosState | undefined,
        clear: (target: Vec3Data) => boolean, blocked: boolean, grounded: boolean,
        clearControl: (target: Vec3Data) => boolean): MotorIntent {
        const initialFacing=Math.atan2(2*(self.meshQw*self.meshQy+self.meshQx*self.meshQz),1-2*(self.meshQy*self.meshQy+self.meshQz*self.meshQz));
        const assignment=state?.assignment;
        // Follow moving objectives without retaining an obsolete snapshot vector. A followed rat's
        // destination is its own record, so it tracks the rat's live position already.
        this.followCase();
        if(this.shotTarget?.hp===0){this.combat.reset();this.shotTarget=undefined;}
        if(!this.progressPosition){this.progressPosition={...self};this.progressAt=now;}
        if(now-this.progressAt>1500){
            if(this.launchWaitAt===undefined&&!this.pendingPlan&&this.routeIndex<this.route.length&&this.destination&&distance(self,this.destination)>3&&Math.hypot(self.x-this.progressPosition.x,self.z-this.progressPosition.z)<1.1&&grounded){
                this.recoverUntil=now+550;this.planAt=this.recoverUntil;this.route=[];
            }
            this.progressPosition={...self};this.progressAt=now;
        }
        const holdingZone=this.mode==='zone-hold'&&assignment?.phase==='active'&&assignment.jurisdiction&&state?.case.owner===self.id&&zoneContains(activeZone(assignment.jurisdiction),self) ? activeZone(assignment.jurisdiction) : undefined;
        if(!holdingZone)this.zoneHolding.reset();
        else {this.pendingPlan=undefined;this.route=[];this.routeIndex=0;this.routeWaitStarted=undefined;this.recoverUntil=0;}
        const routeDestination=this.destination&&(this.navigation.travelPoint?.(self,this.destination)??this.destination);
        const movedGoal=routeDestination&&this.plannedDestination&&distance(routeDestination,this.plannedDestination)>7;
        if(routeDestination&&!holdingZone&&!this.jumpTravel&&now>=this.planAt&&(this.pendingPlan||this.routeIndex>=this.route.length||movedGoal)&&(grounded||this.navigation.supported?.(self))){
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
                    this.route=route;this.routeIndex=Math.max(0,nearest);this.plannedDestination=pending.to;
                    this.pendingPlan=undefined;this.routeWaitStarted=undefined;this.routeProgressGoal=undefined;
                    this.planAt=now+900+this.random()*400;if(this.key==='case')this.failedCase=undefined;
                }
            }else{
                // A denied shared budget has not submitted/failed a search.
                if(route!==undefined)this.routeWaitStarted??=now;
                this.planAt=now+(now-pending.started>5000?1000:140+this.random()*160);
            }
        }
        while(this.routeIndex<this.route.length&&!this.route[this.routeIndex].launch&&!this.route[this.routeIndex].drop&&distance(self,this.route[this.routeIndex])<1.8){this.routeIndex++;this.progress++;}
        let waypoint:BotWaypoint|undefined=this.route[this.routeIndex];
        if(waypoint?.drop&&distance(self,waypoint)<2.5){
            this.flight={landing:waypoint.drop,started:now};return this.fly(now,self,false)!;
        }
        if(waypoint?.launch&&Math.hypot(self.x-waypoint.launch.machine.pad.x,self.z-waypoint.launch.machine.pad.z)<2.5&&Math.abs(self.y-waypoint.y)<1){
            this.launchWaitAt??=now;
            // Standing alone fills a machine in 10 s; give up only well past that.
            if(now-this.launchWaitAt>12500){this.launchWaitAt=undefined;this.failGoal(now);waypoint=undefined;}
            else{
                const machine=waypoint.launch.machine,target=machine.target;
                const dx=machine.pad.x-self.x,dz=machine.pad.z-self.z,d=Math.hypot(dx,dz);
                let shoot:Vec3Data|undefined;
                // Standing builds pressure; every hit on the trigger adds more. Keep pumping it.
                const cooling=(state?.time??now)<(state?.pressure?.fired?.[machine.id]??-Infinity)+PRESSURE_TUNING.cooldownMs;
                if(d<.6&&grounded&&now>=this.shotAt&&!cooling&&clearControl(target)){
                    const travel=Math.hypot(target.x-self.x,target.z-self.z)/BALL_SPEED;
                    shoot={x:target.x,y:target.y-BALL_GRAVITY*travel*travel/2,z:target.z};
                    this.shotAt=now+350;this.heading=Math.atan2(target.x-self.x,target.z-self.z);
                }
                // Stand on the real pad and fire real cheese at its trigger.
                // Only the authoritative launch event starts flight steering.
                const speed=d>.25?Math.min(6,d*4):0;
                this.stalled=false;this.progress++;return{x:d?dx/d*speed:0,z:d?dz/d*speed:0,jump:false,facing:this.heading,shoot};
            }
        }
        const patrolling=this.mode==='intercept'&&this.destination&&distance(self,this.destination)<6&&grounded;
        if(!holdingZone&&(!waypoint||patrolling)&&this.destination){
            if(now>=this.localStepAt&&!this.jumpTravel){
                this.localStepAt=now+150;
                // Defend an interception area by moving among supported nearby posts.
                const angle=Math.floor(now/1800)*Math.PI/2+this.wander;
                const goal=patrolling?{x:this.destination.x+Math.cos(angle)*4,y:this.destination.y,z:this.destination.z+Math.sin(angle)*4}:routeDestination??this.destination;
                this.localWaypoint=this.navigation.localStep?.(self,goal);
            }
            if(this.localWaypoint&&distance(self,this.localWaypoint)>.3)waypoint=this.localWaypoint;
        }
        let approachingCase=false;
        if(this.mode==='case'&&this.destination&&grounded&&!this.jumpTravel&&distance(self,this.destination)<10&&clearControl(this.destination)){
            if(now>=this.approachAt){this.approachAt=now+150;this.approach=this.navigation.approachStep?.(self,this.destination);}
            if(this.approach){waypoint=this.approach;approachingCase=true;}
        }else{this.approach=undefined;this.approachAt=0;}
        let obstacleJump=false;
        if(!holdingZone&&!approachingCase&&!this.jumpTravel&&grounded&&now>=this.jumpAt&&now>=this.jumpProbeAt&&routeDestination&&!waypoint?.launch&&!waypoint?.drop){
            this.jumpProbeAt=now+900;
            const landing=this.navigation.jumpStep?.(self,routeDestination);
            if(landing&&!state?.extraCases?.some(c=>c.fake&&distance(c.p,landing)<3&&clear(c.p))){
                waypoint=landing;obstacleJump=true;
                // A hop bypasses the old walking detour. Reattach on landing.
                this.route=[];this.routeIndex=0;this.pendingPlan=undefined;this.plannedDestination=undefined;this.recoverUntil=0;this.planAt=now;
            }
        }
        this.stalled=!waypoint&&!(this.destination&&distance(self,this.destination)<3);
        let x=0,z=0;
        const pursuingAssignment=!!assignment&&assignment.phase==='active';
        if(waypoint){
            const dx=waypoint.x-self.x,dz=waypoint.z-self.z,d=Math.hypot(dx,dz);
            // Sprint on traversable flat routes; retain measured movement on
            // stairs and final pickup approaches.
            const speed=Math.abs(waypoint.y-self.y)<.7&&this.destination&&distance(self,this.destination)>5?12:6.5;
            if(d>.25){x=dx/d*speed;z=dz/d*speed;this.heading=Math.atan2(dx,dz);}
        }
        if(!this.pendingPlan&&now<this.recoverUntil){const turn=this.wander%2?1:-1;x=Math.sin(this.heading+turn*1.05)*5;z=Math.cos(this.heading+turn*1.05)*5;}
        if(this.mode==='zone-hold'&&this.destination&&distance(self,this.destination)<.8){x=0;z=0;this.stalled=false;}
        // Stop at the objective rather than repeatedly running across the case.
        if(this.destination&&(this.mode==='case'&&distance(self,this.destination)<1.15||this.mode==='dispatch'&&distance(self,this.destination)<1.5)){x=0;z=0;}
        if(patrolling||this.destination&&distance(self,this.destination)<3)this.progress++;
        let facing=this.heading;
        // Tunnel ramps are walking links. Recovery hops hit their arched ceiling.
        let jump=!sewerRampAt(self)&&!approachingCase&&grounded&&now>=this.jumpAt&&(obstacleJump||!this.pendingPlan&&now<this.recoverUntil||blocked&&!!waypoint||!!waypoint&&waypoint.y-self.y>1.1);
        if(jump)this.jumpAt=now+1800+this.random()*1400;
        if(holdingZone){
            const threat=this.visible.find(p=>p.hp>0&&distance(self,p)<22);
            const hold=this.zoneHolding.step(now,holdingZone,`${assignment!.roundId}:${assignment!.jurisdiction!.serial}`,self,threat,grounded,this.navigation,clearControl);
            x=hold.x;z=hold.z;facing=hold.facing;jump=hold.jump;this.stalled=false;this.progress++;
        }
        const target=this.shotTarget;
        this.protectedVisible=this.visible.filter(p=>p.hp>0&&hasIronclad(state?.buffs,p.id,state?.time??now));
        const protectedTarget=!!target&&hasIronclad(state?.buffs,target.id,state?.time??now);
        const casePoint=protectedTarget?exposedCarrierCase(self,target,state,clearControl):undefined;
        if(protectedTarget&&!casePoint||this.caseAim&&!casePoint)this.combat.reset();
        this.caseAim=!!casePoint;
        const visibleTarget=!!target?.hp&&distance(self,target)<85&&clear(target)&&(!protectedTarget||!!casePoint);
        // Strafe a close visible fight on supported local steps.
        if(!obstacleJump&&pursuingAssignment&&(this.mode==='combat'||this.mode==='carrier'&&target&&distance(self,target)<10||this.mode==='intercept')&&visibleTarget&&target&&distance(self,target)<22&&grounded){
            this.progress++;
            const safe=this.maneuver.step(now,this.key,self,target,this.navigation);
            if(safe){const sx=safe.x-self.x,sz=safe.z-self.z,d=Math.hypot(sx,sz);if(d>.3){x=sx/d*8;z=sz/d*8;}}
        }
        const bell=this.bell;
        const dispatchReady=bell&&state?.dispatch.phase==='ready'&&now>=this.shotAt&&clearControl(bell);
        // Follow an armored carrier without running into their gun at point-blank range.
        if(!obstacleJump&&this.mode==='carrier'&&this.destination&&grounded){
            const carrier=this.protectedVisible.find(p=>`carrier:${p.id}`===this.key&&hasIronclad(state?.buffs,p.id,state?.time??now));
            if(carrier&&distance(self,carrier)<10){
                const dx=self.x-carrier.x,dz=self.z-carrier.z,d=Math.hypot(dx,dz)||1;
                const safe=this.navigation.localStep?.(self,{x:self.x+dx/d*4,y:self.y,z:self.z+dz/d*4});
                const sx=safe?safe.x-self.x:0,sz=safe?safe.z-self.z:0,len=Math.hypot(sx,sz);
                x=len?sx/len*6:0;z=len?sz/len*6:0;
            }
        }
        // Every rat remembers its quarry (a mind may ask for a bank shot); only `tactics.bank` shoots at it.
        if(visibleTarget&&target&&!casePoint){
            const seen=this.sighting??={id:target.id,p:{x:0,y:0,z:0},at:now};
            seen.id=target.id;seen.p.x=target.x;seen.p.y=target.y;seen.p.z=target.z;seen.at=now;
        }
        const mischief=this.tactics.mischief&&!holdingZone&&!dispatchReady?this.mischiefTarget(now,self,state,clearControl):undefined;
        const combat=this.combat.step(now,self,target,visibleTarget,now>=this.shotAt&&!dispatchReady&&!mischief,casePoint,target?this.attention.acquisitionCost(self,target,initialFacing):0);
        if(combat.aim)facing=Math.atan2(combat.aim.x-self.x,combat.aim.z-self.z);
        const bank=this.tactics.bank&&!visibleTarget&&!combat.aim&&!holdingZone&&!dispatchReady&&!mischief?this.bankTarget(now,self,state):undefined;
        const speculative=this.opportunisticFire.step(now,self,this.heading,waypoint,
            !holdingZone&&!visibleTarget&&!dispatchReady&&!this.protectedVisible.some(p=>hasIronclad(state?.buffs,p.id,state?.time??now))&&!(this.mode==='case'&&this.destination&&distance(self,this.destination)<24),now>=this.shotAt&&!combat.aim&&!bank&&!mischief);
        const speculativeFacing=this.opportunisticFire.facing(now);
        if(!combat.aim&&speculativeFacing!==undefined)facing=speculativeFacing;
        // A deliberate trick shot turns the gun its way.
        const trick=mischief??bank;
        if(trick)facing=Math.atan2(trick.x-self.x,trick.z-self.z);
        let shoot:Vec3Data|undefined;
        if(bell&&dispatchReady){
            // The bell is a big box shootable from any side; aim somewhere on it, imperfectly.
            shoot={x:bell.x+(this.random()-.5)*3,y:bell.y+(this.random()-.5)*2.4,z:bell.z+(this.random()-.5)*3};
            facing=Math.atan2(bell.x-self.x,bell.z-self.z);
        } else if(mischief&&now>=this.shotAt){
            shoot=mischief;
        } else if(combat.shoot){
            shoot=combat.shoot;this.shotAt=now+this.skill.fireGapMs;
        } else if(bank&&now>=this.shotAt){
            shoot=bank;
        } else if(speculative){
            shoot=speculative;this.shotAt=now+this.skill.fireGapMs;
            facing=Math.atan2(shoot.x-self.x,shoot.z-self.z);
        }
        facing=this.attention.turn(now,facing,initialFacing);
        // Do not emit a sideways/rear shot while the visible gun is turning.
        if(shoot&&!this.attention.aligned(Math.atan2(shoot.x-self.x,shoot.z-self.z)))shoot=undefined;
        if(shoot&&shotHitsIronclad(self,facing,shoot,this.protectedVisible,state))shoot=undefined;
        // Turning toward a Dispatch control is not a fired shot. Keep aiming
        // until aligned; consuming its cooldown early repeatedly turns us away.
        if(shoot&&dispatchReady)this.shotAt=now+350+this.random()*400;
        // A trick shot spends the fire cap only when it actually leaves the gun.
        if(shoot&&shoot===trick){this.shotAt=now+this.skill.fireGapMs;if(shoot===bank)this.bankAim=undefined;}
        if(this.jumpTravel&&!grounded){
            // A floor probe is expected to fail in the air. Keep steering toward
            // the takeoff's landing target, then brake there instead of jumping
            // vertically because a short local walking step disappeared.
            const dx=this.jumpTravel.goal.x-self.x,dz=this.jumpTravel.goal.z-self.z,d=Math.hypot(dx,dz);
            const speed=Math.min(6.5,d*5);x=d>.15?dx/d*speed:0;z=d>.15?dz/d*speed:0;
        }
        if(hasHustle(state?.buffs,self.id,state?.time??now)){
            x*=PICKUP_TUNING.hustleMultiplier;z*=PICKUP_TUNING.hustleMultiplier;
        }
        // Steer around any planted counterfeit the current step would enter.
        // Local, bounded and visible-only: the bot never reads hidden traps, it
        // simply refuses to walk into one it can see ahead of it.
        const fakes = state?.extraCases;
        if (fakes?.length && (x || z)) {
            const stepLength = Math.hypot(x, z) || 1, nx = x / stepLength, nz = z / stepLength;
            for (const fake of fakes) {
                if (!fake.fake) continue;
                const dx = fake.p.x - self.x, dz = fake.p.z - self.z;
                const ahead = dx * nx + dz * nz;
                if (ahead <= 0 || ahead > 8 || Math.abs(fake.p.y - self.y) > 2.5) continue;
                // Right-hand perpendicular; steer to the side the trap is not on.
                const perpX = nz, perpZ = -nx;
                const side = dx * perpX + dz * perpZ;
                if (Math.abs(side) > 3) continue;
                if (!clear(fake.p)) continue;
                const away = side >= 0 ? -1 : 1;
                x = nx * stepLength * .5 + perpX * away * stepLength * 1.2;
                z = nz * stepLength * .5 + perpZ * away * stepLength * 1.2;
            }
        }
        if(jump&&Math.hypot(x,z)>.5){
            const speed=Math.hypot(x,z),goal=waypoint&&!holdingZone?waypoint:{x:self.x+x/speed*3,y:self.y,z:self.z+z/speed*3};
            this.jumpTravel={goal:{...goal},started:now};
        }
        // Check the final composed intent, including buffs and trap avoidance.
        if(holdingZone&&!zoneStepSafe(holdingZone,self,{x:self.x+x*.35,y:self.y,z:self.z+z*.35},.6)){
            x=0;z=0;jump=false;this.jumpTravel=undefined;this.zoneHolding.invalidate();
        }
        return{x,z,jump,...(jump&&holdingZone?{zoneHop:true}:{}),shoot,facing};
    }

    /** A bank shot at the rat last in sight, if it went behind cover moments ago nearby: a held solution, or
     * a fresh bounded attempt at most every `BANK.attemptMs`. */
    private bankTarget(now:number,self:Vec3Data,state:ChaosState|undefined):Vec3Data|undefined {
        if(this.bankAim&&now<this.bankAim.until)return this.bankAim.point;
        this.bankAim=undefined;
        const seen=this.sighting,ray=this.navigation.ray;
        if(!seen||!ray||now<this.bankAt||now-seen.at>BANK.memoryMs||distance(self,seen.p)>BANK.range||hasIronclad(state?.buffs,seen.id,state?.time??now))return;
        this.bankAt=now+BANK.attemptMs;
        const point=bankShot({x:self.x,y:self.y+1.376,z:self.z},{x:seen.p.x,y:seen.p.y+.9,z:seen.p.z},ray,this.protectedVisible.map(p=>({x:p.x,y:p.y+1,z:p.z})));
        if(!point)return;
        this.bankAim={point:this.skew(self,point),until:now+BANK.holdMs};
        return this.bankAim.point;
    }

    /** A gremlin's chaos shot: a visible counterfeit with another rat beside it (never one close to this rat),
     * else the trigger of a launch machine that is not cooling while another rat stands on its pad. Ordinary
     * shots; the server decides what they do. */
    private mischiefTarget(now:number,self:Vec3Data,state:ChaosState|undefined,clearControl:(p:Vec3Data)=>boolean):Vec3Data|undefined {
        if(now<this.mischiefAt)return this.mischiefAim;
        this.mischiefAt=now+MISCHIEF.lookMs;this.mischiefAim=undefined;
        if(!state)return;
        const others=this.visible.filter(p=>p.hp>0);
        const lob=(p:Vec3Data)=>{const travel=Math.hypot(p.x-self.x,p.z-self.z)/BALL_SPEED;return this.mischiefAim=this.skew(self,{x:p.x,y:p.y-BALL_GRAVITY*travel*travel/2,z:p.z});};
        for(const fake of state.extraCases??[]){
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

    /** The skill dials' aim error on a deliberate shot, as seen from the gun. */
    private skew(self:Vec3Data,point:Vec3Data):Vec3Data {
        const eye={x:self.x,y:self.y+1.376,z:self.z},dx=point.x-eye.x,dy=point.y-eye.y,dz=point.z-eye.z,length=Math.hypot(dx,dy,dz);
        const [min,max]=this.skill.aimErrorRadians,angle=min+this.tacticRandom()*(max-min),azimuth=this.tacticRandom()*Math.PI*2;
        const yaw=Math.atan2(dx,dz)+Math.cos(azimuth)*angle,pitch=Math.atan2(dy,Math.hypot(dx,dz))+Math.sin(azimuth)*angle;
        return {x:eye.x+Math.sin(yaw)*Math.cos(pitch)*length,y:eye.y+Math.sin(pitch)*length,z:eye.z+Math.cos(yaw)*Math.cos(pitch)*length};
    }
}
