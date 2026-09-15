import {sewerRampAt} from './sewerLayout';
import {DEFAULT_BOT_EXPERIMENT,botBehaviors,type BotExperiment} from './BotExperiments';
import {BotManeuver} from './BotManeuver';
import {BotPurposefulHolding} from './BotPurposefulHolding';
import {BotAttention} from './BotAttention';
import { BotZoneHolding, zoneStepSafe } from './BotZoneHolding';
import { activeZone, nextZone, JURISDICTION_TUNING } from './jurisdiction';
import { JURISDICTION_ZONES, jurisdictionTravelPoint, zoneContains } from './jurisdictionZones';
import { BotOpportunisticFire } from './BotOpportunisticFire';
import { BotCombat, combatRandom } from './BotCombat';
import {exposedCarrierCase,shotHitsIronclad} from './BotTargeting';
import { DISPATCH_STATIONS, type ChaosState } from './chaosState';
import { incidentInfo } from './incidentCatalog';
import { activeDestination, destinationPoint } from './assignments';
import { hasHustle, hasIronclad, PICKUP_TUNING, type PickupState } from './pickups';
import type { PlayerData, Vec3Data } from './networkProtocol';
import type {BotWaypoint} from './BotLaunchRoutes';
import {BALL_GRAVITY,BALL_SPEED} from './ballTuning';

export interface ObjectiveNavigation {
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
}
export interface ObjectiveBotIntent { x: number; z: number; jump: boolean; zoneHop?: boolean; shoot?: Vec3Data; facing: number }
export type BotObjective = 'case' | 'carrier' | 'combat' | 'explore' | 'delivery' | 'evade' | 'intercept' | 'pickup' | 'zone-hold';
const distance = (a: Vec3Data, b: Vec3Data) => Math.hypot(a.x-b.x, a.z-b.z, a.y-b.y);
const ROUTE_WAIT_MS=6000,FAILED_GOAL_RETRY_MS=12000;

/** Objective selection knows the same globally advertised case position as a
 * human. Combat uses visible observations and imperfect aim; speculative shots
 * follow local routes without reading hidden opponents. */
export class ObjectiveBotBrain {
    objective: BotObjective = 'explore';
    /** Read-only view of the current goal key, for tests and diagnostics. */
    get goalKey(): string { return this.key; }
    private key = '';
    private target?: PlayerData;
    private protectedVisible:PlayerData[]=[];
    private visibleRats:PlayerData[]=[];
    private caseAim=false;
    private dispatchTarget?: Vec3Data;
    private destination?: Vec3Data;
    private route: BotWaypoint[] = [];
    private flight?:{landing:Vec3Data;started:number};
    private jumpTravel?:{goal:Vec3Data;started:number};
    private jumpProbeAt=0;
    private approachAt=0;
    private approach?:Vec3Data;
    private launchWaitAt?:number;
    private supplyTripAt=0;
    private pickupUntil=0;
    private nextPickupAt=0;
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
    private decisionAt = 0;
    private planAt = 0;
    private shotAt = 0;
    private readonly combat: BotCombat;
    private readonly opportunisticFire: BotOpportunisticFire;
    private jumpAt = 0;
    private progressAt = 0;
    private progressPosition?: Vec3Data;
    private recoverUntil = 0;
    private heading = 0;
    private wanderIndex: number;
    private readonly caseLifecycles=new Map<string,{owner:string|null;returning:boolean}>();
    private explorationAt = 0;
    private deliveryKey = '';
    private deliveryEntering = false;
    private assignmentSignature = '';
    private assignmentActive=false;
    private evadeAt=0;
    private readonly behaviors:ReturnType<typeof botBehaviors>;
    private readonly zoneHolding:BotZoneHolding|BotPurposefulHolding;
    private readonly maneuver:BotManeuver;
    private readonly attention=new BotAttention();
    private zonePostAt=0;
    private zonePost=0;
    private readonly zoneLane:number;
    private readonly places: Vec3Data[];
    constructor(private readonly navigation: ObjectiveNavigation, seed = 0, private readonly random: () => number = Math.random, experiment:BotExperiment=DEFAULT_BOT_EXPERIMENT) {
        this.behaviors=botBehaviors(experiment);
        this.zoneLane=Math.abs(seed)%3;this.zoneHolding=this.behaviors.maneuvers?new BotPurposefulHolding(seed):new BotZoneHolding(seed);this.maneuver=new BotManeuver(seed);
        this.combat = new BotCombat(combatRandom(seed));
        this.opportunisticFire = new BotOpportunisticFire(combatRandom(seed+10000));
        this.places = navigation.explorationTargets();
        this.wanderIndex = seed * 7;
    }
    /** Initial pending work counts as stalled until a usable route or reached goal exists. */
    get navigationStalled():boolean{return this.stalled;}
    get failedCasePosition():Readonly<Vec3Data>|undefined{return this.failedCase;}
    reset(): void {
        this.jumpTravel=undefined;this.jumpProbeAt=0;this.approach=undefined;this.approachAt=0;this.maneuver.reset();this.attention.reset();this.protectedVisible=[];this.visibleRats=[];this.caseAim=false;this.zoneHolding.reset();
        this.pickupUntil=0;this.nextPickupAt=0;
        this.assignmentActive=false;
        this.combat.reset();this.opportunisticFire.reset();this.shotAt=0;
        this.key='';this.target=undefined;this.dispatchTarget=undefined;this.destination=undefined;this.route=[];this.routeIndex=0;
        this.plannedDestination=undefined;this.pendingPlan=undefined;this.decisionAt=0;this.planAt=0;this.progressPosition=undefined;this.recoverUntil=0;
        this.routeWaitStarted=undefined;this.failedGoals.clear();this.failedCase=undefined;this.stalled=false;
        this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;
        this.caseLifecycles.clear();
        this.flight=undefined;this.launchWaitAt=undefined;this.supplyTripAt=0;
        this.deliveryKey='';this.deliveryEntering=false;this.assignmentSignature='';this.evadeAt=0;this.zonePostAt=0;this.zonePost=0;
    }
    private setObjective(objective: BotObjective, key: string, destination: Vec3Data | undefined): void {
        if(this.key!==key){this.approach=undefined;this.approachAt=0;this.maneuver.reset();this.launchWaitAt=undefined;this.route=[];this.routeIndex=0;this.plannedDestination=undefined;this.pendingPlan=undefined;this.routeWaitStarted=undefined;this.recoverUntil=0;this.planAt=0;this.key=key;
            this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;}
        this.objective=objective;this.destination=destination;
    }
    private failureKey(key:string):string {
        // A carrier with an unreachable route must not immediately become the
        // same unreachable "ordinary combat" destination in the next branch.
        return key.startsWith('carrier:')||key.startsWith('combat:')?`rat:${key.slice(key.indexOf(':')+1)}`:key;
    }
    private suppressed(key:string,position:Vec3Data,now:number):boolean {
        const id=this.failureKey(key),failed=this.failedGoals.get(id);
        if(!failed)return false;
        if(now>=failed.until||distance(position,failed.position)>7){this.failedGoals.delete(id);return false;}
        return true;
    }
    private failPendingGoal(now:number):void {
        const position=this.destination??this.pendingPlan?.to;
        if(position){
            const copy={x:position.x,y:position.y,z:position.z};
            const retry=this.assignmentActive&&['case','carrier','delivery','zone-hold'].includes(this.objective)?4000:FAILED_GOAL_RETRY_MS;
            this.failedGoals.set(this.failureKey(this.key),{position:copy,until:now+retry});
            if(this.key==='case')this.failedCase=copy;
            if(this.failedGoals.size>32)this.failedGoals.delete(this.failedGoals.keys().next().value!);
        }
        this.route=[];this.routeIndex=0;this.pendingPlan=undefined;this.routeWaitStarted=undefined;
        this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;
        this.plannedDestination=undefined;this.destination=undefined;this.decisionAt=0;this.planAt=0;this.recoverUntil=0;
    }
    /** Immediate detours stay visible and on the current floor. Longer armor
     * trips use the separate, throttled map-site policy below. */
    private wantedPickup(state: ChaosState | undefined, self: PlayerData, now:number, clear:(p:Vec3Data)=>boolean, allowed:(p:PickupState)=>boolean=()=>true) {
        return state?.pickups?.filter(p=>(p.availableAt??0)<=(state?.time??now))
            .filter(p=>p.kind!=='quick-fix'||self.hp<3)
            .filter(p=>Math.abs(p.y-.7-self.y)<2.5&&distance(self,p)<24&&clear(p))
            .filter(p=>!this.suppressed(`pickup:${p.id}`,p,now))
            .filter(allowed)
            .sort((a,b)=>distance(self,a)-distance(self,b))[0];
    }

    /** Fixed supply sites are map knowledge. A bounded occasional trip can use
     * stairs or a launcher; it never replaces pursuit of an advertised carrier. */
    private armorTrip(state:ChaosState|undefined,self:PlayerData,now:number){
        const candidates=state?.pickups?.filter(p=>p.kind==='ironclad'&&(p.availableAt??0)<=(state.time??now)&&
            Math.hypot(p.x-self.x,p.z-self.z)<65&&!this.suppressed(`pickup:${p.id}`,p,now))??[];
        const current=candidates.find(p=>this.key===`pickup:${p.id}`);
        if(current)return current;
        if(now<this.supplyTripAt||(state?.buffs?.[self.id]?.ironcladUntil??0)>(state?.time??now)+4000)return;
        candidates.sort((a,b)=>distance(self,a)-distance(self,b));
        return candidates[0];
    }

    private fly(now:number,self:Vec3Data,grounded:boolean):ObjectiveBotIntent|undefined {
        const flight=this.flight;if(!flight)return;
        if(now-flight.started>1000&&grounded&&Math.abs(self.y-flight.landing.y)<2){
            this.flight=undefined;this.route=[];this.routeIndex=0;this.pendingPlan=undefined;
            this.plannedDestination=undefined;this.planAt=0;this.decisionAt=0;return;
        }
        if(now-flight.started>10000){this.flight=undefined;this.failPendingGoal(now);return;}
        this.stalled=false;
        // Rise clear of the facade before crossing it. Once over the roof,
        // proportional steering brakes above the landing rather than orbiting it.
        const dx=flight.landing.x-self.x,dz=flight.landing.z-self.z,d=Math.hypot(dx,dz);
        const speed=self.y>flight.landing.y+3?Math.min(12,d*3):0;
        if(d>.1&&speed)this.heading=Math.atan2(dx,dz);
        return {x:d>.1&&speed>0?dx/d*speed:0,z:d>.1&&speed>0?dz/d*speed:0,jump:false,facing:this.heading};
    }

    step(now: number, self: PlayerData, others: Iterable<PlayerData>, state: ChaosState | undefined,
        clear: (target: Vec3Data) => boolean, blocked: boolean, grounded: boolean,
        clearControl: (target: Vec3Data) => boolean = clear): ObjectiveBotIntent {
        if(self.hp<=0){this.jumpTravel=undefined;this.maneuver.reset();this.attention.reset();this.zoneHolding.reset();this.flight=undefined;this.launchWaitAt=undefined;this.combat.reset();this.opportunisticFire.reset();this.stalled=false;return{x:0,z:0,jump:false,facing:this.heading};}
        const initialFacing=Math.atan2(2*(self.meshQw*self.meshQy+self.meshQx*self.meshQz),1-2*(self.meshQy*self.meshQy+self.meshQz*self.meshQz));
        if(this.jumpTravel&&(now-this.jumpTravel.started>2200||grounded&&now-this.jumpTravel.started>250))this.jumpTravel=undefined;
        const airborne=this.fly(now,self,grounded);if(airborne)return airborne;
        const launchStep=this.route[this.routeIndex]?.launch;
        const launch=launchStep&&state?.pressure?.launches.find(e=>e.playerId===self.id&&e.machineId===launchStep.machine.id&&
            e.at>=(this.launchWaitAt??now)&&now-e.at<1500);
        if(launch&&launchStep){
            this.jumpTravel=undefined;this.flight={landing:launchStep.landing,started:now};this.launchWaitAt=undefined;
            return this.fly(now,self,false)!;
        }
        // Counterfeits are lethal hazards, never objectives: a bot that routed to one
        // would simply kill itself on loop. Only genuine cases are collectible goals.
        const cases=state?[{key:'case',value:state.case},...(state.extraCases??[]).filter(value=>!value.fake).map(value=>({key:`case:${value.id}`,value}))]:[];
        // Keep each case's failed position independent. Picking up one extra
        // must not erase the evidence that the primary case is unreachable.
        let ownershipChanged=false;
        const assignment=state?.assignment;
        this.assignmentActive=assignment?.phase==='active';
        // Cancel body-shot follow-through immediately when the silver coat
        // appears, including during the interval between navigation decisions.
        if(this.target&&hasIronclad(state?.buffs,this.target.id,state?.time??now)&&!this.caseAim){
            this.combat.reset();this.target=undefined;this.decisionAt=0;
        }
        const signature=assignment?`${assignment.roundId}:${assignment.phase}:${assignment.deliverySerial}:${assignment.jurisdiction?.serial??0}`:'';
        if(signature!==this.assignmentSignature){this.assignmentSignature=signature;this.decisionAt=0;this.zonePostAt=0;for(const key of this.failedGoals.keys())if(key.startsWith("zone:"))this.failedGoals.delete(key);}
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
        if(ownershipChanged)this.decisionAt=0;
        if(this.failedCase&&state&&distance(this.failedCase,state.case.p)>7){this.failedCase=undefined;this.failedGoals.delete('case');this.decisionAt=0;}
        if(this.objective==='case'){
            const selected=cases.find(c=>c.key===this.key);
            if(selected&&!selected.value.owner)this.destination=selected.value.p;
        }
        if(this.routeWaitStarted!==undefined&&this.routeProgressGoal){
            const remaining=distance(self,this.routeProgressGoal);
            // Only new net progress earns more search time. Walking back and
            // forth over the same patch cannot keep an impossible goal alive.
            if(remaining<this.bestRouteDistance-.75){this.bestRouteDistance=remaining;this.routeWaitStarted=now;}
        }
        if(!ownershipChanged&&this.pendingPlan&&this.routeWaitStarted!==undefined&&now-this.routeWaitStarted>=ROUTE_WAIT_MS)this.failPendingGoal(now);
        if(now>=this.decisionAt){
            this.decisionAt=now+180+this.random()*120;
            const living=[...others].filter(p=>p.id!==self.id&&p.hp>0);
            const carrying=cases.some(c=>c.value.owner===self.id);
            const carriers=living.filter(p=>cases.some(c=>c.value.owner===p.id)).sort((a,b)=>distance(self,a)-distance(self,b));
            const carrier=carriers.find(p=>!this.suppressed(`carrier:${p.id}`,p,now));
            const visible=living.filter(p=>distance(self,p)<80&&clear(p)).sort((a,b)=>distance(self,a)-distance(self,b));
            this.visibleRats=visible;
            this.protectedVisible=visible.filter(p=>hasIronclad(state?.buffs,p.id,state?.time??now));
            const vulnerable=visible.filter(p=>!hasIronclad(state?.buffs,p.id,state?.time??now));
            // Keep a visible opponent through a burst instead of resetting reaction
            // every time two similarly close rats trade places. Visible carriers still win.
            this.target=carriers.find(p=>visible.includes(p)&&(vulnerable.includes(p)||exposedCarrierCase(self,p,state,clearControl)))??vulnerable.find(p=>p.id===this.target?.id)??vulnerable[0];
            this.dispatchTarget=state?.dispatch.phase==='ready' ? DISPATCH_STATIONS.map(station=>station.target)
                .filter(target=>distance(self,target)<26&&clearControl(target))
                .sort((a,b)=>distance(self,a)-distance(self,b))[0] : undefined;
            const evidence=state?.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='evidence-tampering';
            const available=carrying||evidence?undefined:cases.filter(({key,value})=>!value.owner&&value.returningUntil<=(state?.time??now)&&
                (value.previousOwner!==self.id||value.pickupAfter<=(state?.time??now))&&!this.suppressed(key,value.p,now))
                .sort((a,b)=>distance(self,a.value.p)-distance(self,b.value.p))[0];
            const candidates=vulnerable.filter(p=>!this.suppressed(`combat:${p.id}`,p,now));
            let combat=candidates[0];
            if(this.behaviors.commitment&&!ownershipChanged){
                const retained=candidates.find(p=>this.key===`combat:${p.id}`);
                // A 20% / four-unit improvement is material; tiny distance
                // swaps should not discard a valid shared route. Case priorities
                // below still interrupt immediately, as do death and failed routes.
                if(retained&&(!combat||distance(self,combat)+Math.max(4,distance(self,retained)*.2)>=distance(self,retained)))combat=retained;
            }
            const active=assignment?.phase==='active';
            // A mapped roof trip is still possible between objectives, but a
            // live case takes priority even when it is on the other side of town.
            const armor=!carrying&&!carrier&&!(available&&(active||distance(self,available.value.p)<24))?this.armorTrip(state,self,now):undefined;
            // Do not interrupt your own scoring, or keep shooting a nearby
            // loose case away while attempting to collect it.
            if(carrying||this.target||available&&distance(self,available.value.p)<24)this.dispatchTarget=undefined;
            const destination=assignment?.phase==='active'&&state?.case.owner===self.id?activeDestination(assignment):undefined;
            let delivery:Vec3Data|undefined,deliveryKey='';
            if(destination&&assignment){
                const key=`${assignment.roundId}:${assignment.deliverySerial}:${destination}`;
                if(key!==this.deliveryKey){this.deliveryKey=key;this.deliveryEntering=false;}
                const approach=destinationPoint(destination);
                if(!this.deliveryEntering&&distance(self,approach)<2)this.deliveryEntering=true;
                else if(this.deliveryEntering&&distance(self,destinationPoint(destination,false))<2)this.deliveryEntering=false;
                const point=destinationPoint(destination,!this.deliveryEntering);
                deliveryKey=`delivery:${key}:${this.deliveryEntering?'enter':'approach'}`;
                if(!this.suppressed(deliveryKey,point,now))delivery=point;
            }else {this.deliveryKey='';this.deliveryEntering=false;}
            let intercept:Vec3Data|undefined;
            const next=assignment?.phase==='active'?activeDestination(assignment):undefined;
            if(!carrying&&carrier&&next&&this.wanderIndex%3===0&&distance(self,carrier)>35){
                const approach=destinationPoint(next);
                if(distance(self,approach)+12<distance(carrier,approach)&&!this.suppressed(`intercept:${next}`,approach,now))intercept=approach;
            }
            const jurisdiction=assignment?.phase==='active'?assignment.jurisdiction:undefined;
            let zoneGoal:Vec3Data|undefined,zoneKey='',zoneEarly=false;
            if(jurisdiction&&carrying){
                const current=activeZone(jurisdiction),upcoming=nextZone(jurisdiction);
                const travelMs=distance(self,JURISDICTION_ZONES[upcoming].posts[0])/12*1000;
                // A small travel estimate makes leaving early a real choice; ownership remains physical.
                zoneEarly=!zoneContains(current,self)&&jurisdiction.remainingMs<=JURISDICTION_TUNING.warningMs&&jurisdiction.remainingMs<travelMs+1000&&this.zoneLane===0;
                const id=zoneEarly?upcoming:current,zone=JURISDICTION_ZONES[id];
                if(!this.zonePostAt){this.zonePost=0;this.zonePostAt=now+3500;}
                else if(now>=this.zonePostAt&&visible.some(p=>distance(self,p)<22)&&distance(self,zone.posts[(this.zonePost+this.zoneLane)%zone.posts.length])<2){this.zonePost=(this.zonePost+1)%zone.posts.length;this.zonePostAt=now+6000;}
                zoneGoal=zone.posts[(this.zonePost+this.zoneLane)%zone.posts.length];
                zoneKey=`zone:${assignment!.roundId}:${jurisdiction.serial}:${id}:${(this.zonePost+this.zoneLane)%zone.posts.length}`;
                zoneGoal=jurisdictionTravelPoint(self,zoneGoal);
                zoneKey+=`:${zoneGoal.x},${zoneGoal.y},${zoneGoal.z}`;
                if(this.suppressed(zoneKey,zoneGoal,now)){this.zonePost++;this.zonePostAt=now+6000;zoneGoal=undefined;}
            }
            if(jurisdiction&&!carrying&&carrier&&this.zoneLane===0&&!zoneContains(activeZone(jurisdiction),carrier)&&jurisdiction.remainingMs<=JURISDICTION_TUNING.warningMs&&distance(self,carrier)>35){
                const id=nextZone(jurisdiction),post=JURISDICTION_ZONES[id].approaches[0];
                if(distance(self,post)<distance(carrier,post))intercept=post;
            }
            if(jurisdiction&&!carrying&&carrier&&!intercept&&this.zoneLane!==0&&zoneContains(activeZone(jurisdiction),carrier)&&distance(self,carrier)>45){
                const zone=JURISDICTION_ZONES[activeZone(jurisdiction)],post=zone.approaches[this.zoneLane%zone.approaches.length];
                if(distance(self,post)>5&&distance(self,post)+distance(post,carrier)<distance(self,carrier)+8&&!this.suppressed(`intercept:${post.x},${post.z}`,post,now))intercept=jurisdictionTravelPoint(self,post);
            }
            let escape:Vec3Data|undefined,escapeKey='';
            if(carrying&&assignment?.id==='closing-time'&&assignment.phase==='active'){
                if(this.objective==='evade'&&this.destination&&distance(self,this.destination)>3&&now<this.evadeAt){escape=this.destination;escapeKey=this.key;}
                else {
                    const options=this.places.map((point,index)=>({point,index,d:distance(self,point)}))
                        .filter(({point,index,d})=>d>10&&d<55&&Math.abs(point.y-self.y)<2&&!this.suppressed(`evade:${index}`,point,now));
                    const safety=(point:Vec3Data)=>visible.length?Math.min(...visible.map(p=>distance(point,p))):10;
                    options.sort((a,b)=>(safety(b.point)-b.d*.35)-(safety(a.point)-a.d*.35));
                    if(options[0]){escape=options[0].point;escapeKey=`evade:${options[0].index}`;this.evadeAt=now+2200;}
                    else if(visible[0]){
                        const threat=visible[0],dx=self.x-threat.x,dz=self.z-threat.z,d=Math.hypot(dx,dz)||1;
                        escape=this.navigation.localStep?.(self,{x:self.x+dx/d*8,y:self.y,z:self.z+dz/d*8});
                        if(escape){escapeKey='evade:local';this.evadeAt=now+1000;}
                    }
                }
            }
            const goal=available?.value.p??(!carrying?carrier:undefined)??zoneGoal??delivery??escape??(carrying&&active?combat:undefined);
            const scoring=!!jurisdiction&&carrying&&zoneContains(activeZone(jurisdiction),self);
            const pickup=this.wantedPickup(state,self,now,clear,p=>{
                if(!active||!goal)return true;
                const d=distance(self,p),emergency=p.kind==='quick-fix'&&self.hp===1&&d<=6;
                if(scoring&&!zoneContains(activeZone(jurisdiction!),{x:p.x,y:p.y-.7,z:p.z}))return false;
                if(!emergency){
                    if(available&&distance(self,available.value.p)<8)return false;
                    if((this.key===`pickup:${p.id}`?now>=this.pickupUntil:now<this.nextPickupAt))return false;
                    // Collect useful supplies along the route without walking
                    // back for a refresh or making a 24-unit side excursion.
                    if(d>12||d+distance(p,goal)-distance(self,goal)>5)return false;
                    const buff=state?.buffs?.[self.id],until=p.kind==='ironclad'?buff?.ironcladUntil:p.kind==='hustle'?buff?.hustleUntil:0;
                    if((until??0)>(state?.time??now)+2000)return false;
                }
                return true;
            });
            if(pickup){
                if(this.key!==`pickup:${pickup.id}`){this.pickupUntil=now+2200;this.nextPickupAt=now+8000;}
                this.setObjective('pickup',`pickup:${pickup.id}`,pickup);
            }
            else if(armor){
                if(this.key!==`pickup:${armor.id}`)this.supplyTripAt=now+25000+this.random()*10000;
                this.setObjective('pickup',`pickup:${armor.id}`,armor);
            }
            else if(available)this.setObjective('case',available.key,available.value.p);
            else if(intercept)this.setObjective('intercept',`intercept:${jurisdiction?`${intercept.x},${intercept.z}`:next}`,intercept);
            else if(!carrying&&carrier)this.setObjective('carrier',`carrier:${carrier.id}`,carrier);
            else if(zoneGoal)this.setObjective(zoneEarly?'delivery':'zone-hold',zoneKey,zoneGoal);
            else if(delivery)this.setObjective('delivery',deliveryKey,delivery);
            else if(escape)this.setObjective('evade',escapeKey,escape);
            else if(combat)this.setObjective('combat',`combat:${combat.id}`,combat);
            else {
                if(this.objective!=='explore'||!this.destination||this.suppressed(this.key,this.destination,now)||distance(self,this.destination)<3||now>this.explorationAt+20000){
                    this.destination=undefined;
                    const nearby:Array<{index:number;point:Vec3Data;score:number}>=[];
                    for(let i=0;i<this.places.length;i++){
                        const candidate=this.places[i],d=distance(self,candidate);
                        if(d<3||this.suppressed(`explore:${i}`,candidate,now))continue;
                        nearby.push({index:i,point:candidate,score:d+Math.abs(candidate.y-self.y)*2});
                        nearby.sort((a,b)=>a.score-b.score);if(nearby.length>4)nearby.pop();
                    }
                    const useful=nearby.filter(p=>p.score<=nearby[0].score+20);
                    const choice=useful.length?useful[(this.wanderIndex+1)%useful.length]:undefined;
                    if(choice){this.wanderIndex=choice.index;this.destination=choice.point;}
                    this.explorationAt=now;
                }
                this.setObjective('explore',this.destination?`explore:${this.wanderIndex}`:'explore:none',this.destination);
            }
        }
        // Follow moving objectives without retaining an obsolete snapshot vector.
        if(this.objective==='case'){
            const selected=cases.find(c=>c.key===this.key);
            if(selected&&!selected.value.owner)this.destination=selected.value.p;
        }
        if(this.target?.hp===0){this.combat.reset();this.target=undefined;}
        if(!this.progressPosition){this.progressPosition={...self};this.progressAt=now;}
        if(now-this.progressAt>1500){
            if(this.launchWaitAt===undefined&&!this.pendingPlan&&this.routeIndex<this.route.length&&this.destination&&distance(self,this.destination)>3&&Math.hypot(self.x-this.progressPosition.x,self.z-this.progressPosition.z)<1.1&&grounded){
                this.recoverUntil=now+550;this.planAt=this.recoverUntil;this.route=[];
            }
            this.progressPosition={...self};this.progressAt=now;
        }
        const holdingZone=this.objective==='zone-hold'&&assignment?.phase==='active'&&assignment.jurisdiction&&state?.case.owner===self.id&&zoneContains(activeZone(assignment.jurisdiction),self) ? activeZone(assignment.jurisdiction) : undefined;
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
        while(this.routeIndex<this.route.length&&!this.route[this.routeIndex].launch&&!this.route[this.routeIndex].drop&&distance(self,this.route[this.routeIndex])<1.8)this.routeIndex++;
        let waypoint:BotWaypoint|undefined=this.route[this.routeIndex];
        if(waypoint?.drop&&distance(self,waypoint)<2.5){
            this.flight={landing:waypoint.drop,started:now};return this.fly(now,self,false)!;
        }
        if(waypoint?.launch&&Math.hypot(self.x-waypoint.launch.machine.pad.x,self.z-waypoint.launch.machine.pad.z)<2.5&&Math.abs(self.y-waypoint.y)<1){
            this.launchWaitAt??=now;
            if(now-this.launchWaitAt>8500){this.launchWaitAt=undefined;this.failPendingGoal(now);waypoint=undefined;}
            else{
                const machine=waypoint.launch.machine,target=machine.target;
                const dx=machine.pad.x-self.x,dz=machine.pad.z-self.z,d=Math.hypot(dx,dz);
                let shoot:Vec3Data|undefined;
                if(d<.6&&grounded&&now>=this.shotAt&&(state?.pressure?.cooldowns?.[machine.id]??0)<=(state?.time??now)&&clearControl(target)){
                    const travel=Math.hypot(target.x-self.x,target.z-self.z)/BALL_SPEED;
                    shoot={x:target.x,y:target.y-BALL_GRAVITY*travel*travel/2,z:target.z};
                    this.shotAt=now+650;this.heading=Math.atan2(target.x-self.x,target.z-self.z);
                }
                // Stand on the real pad and fire real cheese at its trigger.
                // Only the authoritative launch event starts flight steering.
                const speed=d>.25?Math.min(6,d*4):0;
                this.stalled=false;return{x:d?dx/d*speed:0,z:d?dz/d*speed:0,jump:false,facing:this.heading,shoot};
            }
        }
        const patrolling=this.objective==='intercept'&&this.destination&&distance(self,this.destination)<6&&grounded;
        if(!holdingZone&&(!waypoint||patrolling)&&this.destination){
            if(now>=this.localStepAt&&!this.jumpTravel){
                this.localStepAt=now+150;
                // Defend an interception area by moving among supported nearby posts.
                const angle=Math.floor(now/1800)*Math.PI/2+this.wanderIndex;
                const goal=patrolling?{x:this.destination.x+Math.cos(angle)*4,y:this.destination.y,z:this.destination.z+Math.sin(angle)*4}:routeDestination??this.destination;
                this.localWaypoint=this.navigation.localStep?.(self,goal);
            }
            if(this.localWaypoint&&distance(self,this.localWaypoint)>.3)waypoint=this.localWaypoint;
        }
        let approachingCase=false;
        if(this.objective==='case'&&this.destination&&grounded&&!this.jumpTravel&&distance(self,this.destination)<10&&clearControl(this.destination)){
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
        if(!this.pendingPlan&&now<this.recoverUntil){const turn=this.wanderIndex%2?1:-1;x=Math.sin(this.heading+turn*1.05)*5;z=Math.cos(this.heading+turn*1.05)*5;}
        if(this.objective==='zone-hold'&&this.destination&&distance(self,this.destination)<.8){x=0;z=0;this.stalled=false;}
        // Stop at the objective rather than repeatedly running across the case.
        if(this.objective==='case'&&this.destination&&distance(self,this.destination)<1.15){x=0;z=0;}
        let facing=this.heading;
        // Tunnel ramps are walking links. Recovery hops hit their arched ceiling.
        let jump=!sewerRampAt(self)&&!approachingCase&&grounded&&now>=this.jumpAt&&(obstacleJump||!this.pendingPlan&&now<this.recoverUntil||blocked&&!!waypoint||!!waypoint&&waypoint.y-self.y>1.1);
        if(jump)this.jumpAt=now+1800+this.random()*1400;
        if(holdingZone){
            const threat=this.visibleRats.find(p=>p.hp>0&&distance(self,p)<22);
            const hold=this.zoneHolding.step(now,holdingZone,`${assignment!.roundId}:${assignment!.jurisdiction!.serial}`,self,threat,grounded,this.navigation,clearControl);
            x=hold.x;z=hold.z;facing=hold.facing;jump=hold.jump;this.stalled=false;
        }
        this.protectedVisible=this.visibleRats.filter(p=>p.hp>0&&hasIronclad(state?.buffs,p.id,state?.time??now));
        const protectedTarget=!!this.target&&hasIronclad(state?.buffs,this.target.id,state?.time??now);
        const casePoint=protectedTarget?exposedCarrierCase(self,this.target!,state,clearControl):undefined;
        if(protectedTarget&&!casePoint||this.caseAim&&!casePoint)this.combat.reset();
        this.caseAim=!!casePoint;
        const visibleTarget=!!this.target?.hp&&distance(self,this.target)<85&&clear(this.target)&&(!protectedTarget||!!casePoint);
        if(!obstacleJump&&pursuingAssignment&&(this.objective==='combat'||this.objective==='carrier'&&this.target&&distance(self,this.target)<10||this.objective==='intercept')&&visibleTarget&&this.target&&distance(self,this.target)<22&&grounded){
            const dx=self.x-this.target.x,dz=self.z-this.target.z,length=Math.hypot(dx,dz)||1;
            const side=(this.wanderIndex+Math.floor(now/2600))%2?1:-1,back=length<9?1:.1;
            const point={x:self.x+(dx*back+dz*side)/length*5,y:self.y,z:self.z+(dz*back-dx*side)/length*5};
            const safe=this.behaviors.maneuvers?this.maneuver.step(now,this.key,self,this.target,this.navigation):this.navigation.localStep?.(self,point);
            if(safe){const sx=safe.x-self.x,sz=safe.z-self.z,d=Math.hypot(sx,sz);if(d>.3){x=sx/d*8;z=sz/d*8;}}
        }
        const dispatchReady=this.dispatchTarget&&state?.dispatch.phase==='ready'&&now>=this.shotAt&&clearControl(this.dispatchTarget);
        // Follow an armored carrier without running into their gun at point-blank range.
        if(!obstacleJump&&this.objective==='carrier'&&this.destination&&grounded){
            const carrier=this.protectedVisible.find(p=>`carrier:${p.id}`===this.key&&hasIronclad(state?.buffs,p.id,state?.time??now));
            if(carrier&&distance(self,carrier)<10){
                const dx=self.x-carrier.x,dz=self.z-carrier.z,d=Math.hypot(dx,dz)||1;
                const safe=this.navigation.localStep?.(self,{x:self.x+dx/d*4,y:self.y,z:self.z+dz/d*4});
                const sx=safe?safe.x-self.x:0,sz=safe?safe.z-self.z:0,len=Math.hypot(sx,sz);
                x=len?sx/len*6:0;z=len?sz/len*6:0;
            }
        }
        const combat=this.combat.step(now,self,this.target,visibleTarget,now>=this.shotAt&&!dispatchReady,casePoint,this.behaviors.attention&&this.target?this.attention.acquisitionCost(self,this.target,initialFacing):0);
        if(combat.aim)facing=Math.atan2(combat.aim.x-self.x,combat.aim.z-self.z);
        const speculative=this.opportunisticFire.step(now,self,this.heading,waypoint,
            !(holdingZone&&this.behaviors.maneuvers)&&!visibleTarget&&!dispatchReady&&!this.protectedVisible.some(p=>hasIronclad(state?.buffs,p.id,state?.time??now))&&!(this.objective==='case'&&this.destination&&distance(self,this.destination)<24),now>=this.shotAt&&!combat.aim);
        const speculativeFacing=this.opportunisticFire.facing(now);
        if(!combat.aim&&speculativeFacing!==undefined)facing=speculativeFacing;
        let shoot:Vec3Data|undefined;
        if(this.dispatchTarget&&dispatchReady){
            // Shoot the visible red face while passing; it never replaces the
            // case route with a detour to a control somewhere else in the city.
            shoot={x:this.dispatchTarget.x+(this.random()-.5)*.15,y:this.dispatchTarget.y+(this.random()-.5)*.15,z:this.dispatchTarget.z};
            facing=Math.atan2(this.dispatchTarget.x-self.x,this.dispatchTarget.z-self.z);
        } else if(combat.shoot){
            shoot=combat.shoot;this.shotAt=now+200;
        } else if(speculative){
            shoot=speculative;this.shotAt=now+200;
            facing=Math.atan2(shoot.x-self.x,shoot.z-self.z);
        }
        if(this.behaviors.attention){
            const desired=facing;
            facing=this.attention.turn(now,desired,initialFacing);
            // Do not emit a sideways/rear shot while the visible gun is turning.
            if(shoot&&!this.attention.aligned(Math.atan2(shoot.x-self.x,shoot.z-self.z)))shoot=undefined;
        }
        if(shoot&&shotHitsIronclad(self,facing,shoot,this.protectedVisible,state))shoot=undefined;
        // Turning toward a Dispatch control is not a fired shot. Keep aiming
        // until aligned; consuming its cooldown early repeatedly turns us away.
        if(shoot&&dispatchReady)this.shotAt=now+350+this.random()*400;
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
}
