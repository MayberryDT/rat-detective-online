import { BotOpportunisticFire } from './BotOpportunisticFire';
import { BotCombat, combatRandom } from './BotCombat';
import { DISPATCH_STATIONS, type ChaosState } from './chaosState';
import { incidentInfo } from './incidentCatalog';
import { activeDestination, destinationPoint } from './assignments';
import type { PlayerData, Vec3Data } from './networkProtocol';

export interface ObjectiveNavigation {
    /** Undefined means the shared planner's frame budget was already used. */
    route(from: Vec3Data, to: Vec3Data): Vec3Data[] | undefined;
    /** A short waypoint verified against both solid geometry and floor support. */
    localStep?(from:Vec3Data,to:Vec3Data):Vec3Data|undefined;
    explorationTargets(): Vec3Data[];
    update?(budgetMs?: number): void;
}
export interface ObjectiveBotIntent { x: number; z: number; jump: boolean; shoot?: Vec3Data; facing: number }
export type BotObjective = 'case' | 'carrier' | 'combat' | 'explore' | 'delivery' | 'evade' | 'intercept';
const distance = (a: Vec3Data, b: Vec3Data) => Math.hypot(a.x-b.x, a.z-b.z, a.y-b.y);
const ROUTE_WAIT_MS=6000,FAILED_GOAL_RETRY_MS=12000;

/** Objective selection knows the same globally advertised case position as a
 * human. Combat uses visible observations and imperfect aim; speculative shots
 * follow local routes without reading hidden opponents. */
export class ObjectiveBotBrain {
    objective: BotObjective = 'explore';
    private key = '';
    private target?: PlayerData;
    private dispatchTarget?: Vec3Data;
    private destination?: Vec3Data;
    private route: Vec3Data[] = [];
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
    private evadeAt=0;
    private readonly places: Vec3Data[];
    constructor(private readonly navigation: ObjectiveNavigation, seed = 0, private readonly random: () => number = Math.random) {
        this.combat = new BotCombat(combatRandom(seed));
        this.opportunisticFire = new BotOpportunisticFire(combatRandom(seed+10000));
        this.places = navigation.explorationTargets();
        this.wanderIndex = seed * 7;
    }
    /** Initial pending work counts as stalled until a usable route or reached goal exists. */
    get navigationStalled():boolean{return this.stalled;}
    get failedCasePosition():Readonly<Vec3Data>|undefined{return this.failedCase;}
    reset(): void {
        this.combat.reset();this.opportunisticFire.reset();this.shotAt=0;
        this.key='';this.target=undefined;this.dispatchTarget=undefined;this.destination=undefined;this.route=[];this.routeIndex=0;
        this.plannedDestination=undefined;this.pendingPlan=undefined;this.decisionAt=0;this.planAt=0;this.progressPosition=undefined;this.recoverUntil=0;
        this.routeWaitStarted=undefined;this.failedGoals.clear();this.failedCase=undefined;this.stalled=false;
        this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;
        this.caseLifecycles.clear();
        this.deliveryKey='';this.deliveryEntering=false;this.assignmentSignature='';this.evadeAt=0;
    }
    private setObjective(objective: BotObjective, key: string, destination: Vec3Data | undefined): void {
        if(this.key!==key){this.route=[];this.routeIndex=0;this.plannedDestination=undefined;this.pendingPlan=undefined;this.routeWaitStarted=undefined;this.recoverUntil=0;this.planAt=0;this.key=key;
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
            this.failedGoals.set(this.failureKey(this.key),{position:copy,until:now+FAILED_GOAL_RETRY_MS});
            if(this.key==='case')this.failedCase=copy;
            if(this.failedGoals.size>32)this.failedGoals.delete(this.failedGoals.keys().next().value!);
        }
        this.route=[];this.routeIndex=0;this.pendingPlan=undefined;this.routeWaitStarted=undefined;
        this.routeProgressGoal=undefined;this.bestRouteDistance=Infinity;this.localWaypoint=undefined;this.localStepAt=0;
        this.plannedDestination=undefined;this.destination=undefined;this.decisionAt=0;this.planAt=0;this.recoverUntil=0;
    }
    step(now: number, self: PlayerData, others: Iterable<PlayerData>, state: ChaosState | undefined,
        clear: (target: Vec3Data) => boolean, blocked: boolean, grounded: boolean,
        clearControl: (target: Vec3Data) => boolean = clear): ObjectiveBotIntent {
        if(self.hp<=0){this.combat.reset();this.opportunisticFire.reset();this.stalled=false;return{x:0,z:0,jump:false,facing:this.heading};}
        const cases=state?[{key:'case',value:state.case},...(state.extraCases??[]).map(value=>({key:`case:${value.id}`,value}))]:[];
        // Keep each case's failed position independent. Picking up one extra
        // must not erase the evidence that the primary case is unreachable.
        let ownershipChanged=false;
        const assignment=state?.assignment;
        const signature=assignment?`${assignment.roundId}:${assignment.phase}:${assignment.deliverySerial}`:'';
        if(signature!==this.assignmentSignature){this.assignmentSignature=signature;this.decisionAt=0;}
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
            this.target=carriers.find(p=>visible.includes(p))??visible[0];
            this.dispatchTarget=state?.dispatch.phase==='ready' ? DISPATCH_STATIONS.map(station=>station.target)
                .filter(target=>distance(self,target)<26&&clearControl(target))
                .sort((a,b)=>distance(self,a)-distance(self,b))[0] : undefined;
            const evidence=state?.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='evidence-tampering';
            const available=carrying||evidence?undefined:cases.filter(({key,value})=>!value.owner&&value.returningUntil<=(state?.time??now)&&
                (value.previousOwner!==self.id||value.pickupAfter<=(state?.time??now))&&!this.suppressed(key,value.p,now))
                .sort((a,b)=>distance(self,a.value.p)-distance(self,b.value.p))[0];
            const combat=visible.find(p=>!this.suppressed(`combat:${p.id}`,p,now));
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
            let escape:Vec3Data|undefined,escapeKey='';
            if(carrying&&assignment?.id==='closing-time'&&assignment.phase==='active'){
                if(this.objective==='evade'&&this.destination&&distance(self,this.destination)>3&&now<this.evadeAt){escape=this.destination;escapeKey=this.key;}
                else {
                    const options=this.places.map((point,index)=>({point,index,d:distance(self,point)}))
                        .filter(({point,index,d})=>d>10&&d<55&&Math.abs(point.y-self.y)<2&&!this.suppressed(`evade:${index}`,point,now));
                    const safety=(point:Vec3Data)=>visible.length?Math.min(...visible.map(p=>distance(point,p))):10;
                    options.sort((a,b)=>(safety(b.point)-b.d*.35)-(safety(a.point)-a.d*.35));
                    if(options[0]){escape=options[0].point;escapeKey=`evade:${options[0].index}`;this.evadeAt=now+2200;}
                }
            }
            if(available)this.setObjective('case',available.key,available.value.p);
            else if(intercept)this.setObjective('intercept',`intercept:${next}`,intercept);
            else if(!carrying&&carrier)this.setObjective('carrier',`carrier:${carrier.id}`,carrier);
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
            if(!this.pendingPlan&&this.routeIndex<this.route.length&&this.destination&&distance(self,this.destination)>3&&distance(self,this.progressPosition)<1.1&&grounded){
                this.recoverUntil=now+550;this.planAt=this.recoverUntil;this.route=[];
            }
            this.progressPosition={...self};this.progressAt=now;
        }
        const movedGoal=this.destination&&this.plannedDestination&&distance(this.destination,this.plannedDestination)>7;
        if(this.destination&&now>=this.planAt&&(this.pendingPlan||this.routeIndex>=this.route.length||movedGoal)){
            // Queue/cache keys include the start. Keep BOTH endpoints stable
            // while an incremental search runs, even if momentum moves the rat.
            // A moving case/carrier may replace a stale goal, at most once/sec.
            if(!this.pendingPlan||(now-this.pendingPlan.started>=1000&&distance(this.destination,this.pendingPlan.to)>7)){
                this.pendingPlan={from:{x:self.x,y:self.y,z:self.z},to:{...this.destination},started:now};
                this.routeProgressGoal={...this.destination};this.bestRouteDistance=distance(self,this.destination);
            }
            const pending=this.pendingPlan;
            const route=this.navigation.route(pending.from,pending.to);
            if(route?.length){
                let nearest=-1,nearestDistance=4;
                for(let i=0;i<route.length;i++){
                    const d=distance(self,route[i]);
                    if(Math.abs(self.y-route[i].y)<1.5&&d<=nearestDistance){nearest=i;nearestDistance=d;}
                }
                if(nearest<0&&distance(self,pending.from)>3){
                    // Local movement left this old search origin behind. Ask
                    // from the current pose instead of turning back across town.
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
        while(this.routeIndex<this.route.length&&distance(self,this.route[this.routeIndex])<1.8)this.routeIndex++;
        let waypoint=this.route[this.routeIndex];
        if(!waypoint&&this.destination){
            if(now>=this.localStepAt){
                this.localStepAt=now+150;
                this.localWaypoint=this.navigation.localStep?.(self,this.destination);
            }
            if(this.localWaypoint&&distance(self,this.localWaypoint)>.3)waypoint=this.localWaypoint;
        }
        this.stalled=!waypoint&&!(this.destination&&distance(self,this.destination)<3);
        let x=0,z=0;
        const pursuingAssignment=!!assignment&&assignment.phase==='active';
        if(waypoint){
            const dx=waypoint.x-self.x,dz=waypoint.z-self.z,d=Math.hypot(dx,dz);
            // Sprint on traversable flat routes; retain measured movement on
            // stairs, final pickup approaches and legacy/practice matches.
            const speed=pursuingAssignment&&Math.abs(waypoint.y-self.y)<.7&&this.destination&&distance(self,this.destination)>5?12:6.5;
            if(d>.25){x=dx/d*speed;z=dz/d*speed;this.heading=Math.atan2(dx,dz);}
        }
        if(!this.pendingPlan&&now<this.recoverUntil){const turn=this.wanderIndex%2?1:-1;x=Math.sin(this.heading+turn*1.05)*5;z=Math.cos(this.heading+turn*1.05)*5;}
        // Stop at the objective rather than repeatedly running across the case.
        if(this.objective==='case'&&this.destination&&distance(self,this.destination)<1.15){x=0;z=0;}
        let facing=this.heading;
        const jump=grounded&&now>=this.jumpAt&&(!this.pendingPlan&&now<this.recoverUntil||blocked&&!!waypoint||!!waypoint&&waypoint.y-self.y>1.1);
        if(jump)this.jumpAt=now+1800+this.random()*1400;
        const visibleTarget=!!this.target?.hp&&distance(self,this.target)<85&&clear(this.target);
        if(pursuingAssignment&&this.objective==='combat'&&visibleTarget&&this.target&&distance(self,this.target)<22&&grounded){
            const dx=self.x-this.target.x,dz=self.z-this.target.z,length=Math.hypot(dx,dz)||1;
            const side=(this.wanderIndex+Math.floor(now/2600))%2?1:-1,back=length<9?1:.1;
            const point={x:self.x+(dx*back+dz*side)/length*5,y:self.y,z:self.z+(dz*back-dx*side)/length*5};
            const safe=this.navigation.localStep?.(self,point);
            if(safe){const sx=safe.x-self.x,sz=safe.z-self.z,d=Math.hypot(sx,sz);if(d>.3){x=sx/d*8;z=sz/d*8;}}
        }
        const dispatchReady=this.dispatchTarget&&state?.dispatch.phase==='ready'&&now>=this.shotAt&&clearControl(this.dispatchTarget);
        const combat=this.combat.step(now,self,this.target,visibleTarget,now>=this.shotAt&&!dispatchReady);
        if(combat.aim)facing=Math.atan2(combat.aim.x-self.x,combat.aim.z-self.z);
        const speculative=this.opportunisticFire.step(now,self,this.heading,waypoint,
            !visibleTarget&&!dispatchReady&&!(this.objective==='case'&&this.destination&&distance(self,this.destination)<24),now>=this.shotAt&&!combat.aim);
        const speculativeFacing=this.opportunisticFire.facing(now);
        if(!combat.aim&&speculativeFacing!==undefined)facing=speculativeFacing;
        let shoot:Vec3Data|undefined;
        if(this.dispatchTarget&&dispatchReady){
            this.shotAt=now+350+this.random()*400;
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
        return{x,z,jump,shoot,facing};
    }
}
