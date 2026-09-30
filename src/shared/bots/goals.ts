import {GOALS,type Goal,type Personality,type Plan,type PlaceOption} from './intent';
import {distance,type BotMotor,type CaseEntry,type MotorNavigation} from './motor';
import {activeZone,nextZone,JURISDICTION_TUNING} from '../jurisdiction';
import {JURISDICTION_ZONES,jurisdictionTravelPoint,zoneContains} from '../jurisdictionZones';
import {DISPATCH_STATIONS,type ChaosState} from '../chaosState';
import {incidentInfo} from '../incidentCatalog';
import {activeDestination,destinationPoint,ASSIGNMENT_DESTINATIONS} from '../assignments';
import {hasIronclad,type PickupState} from '../pickups';
import {MAX_HP,type PlayerData,type Vec3Data} from '../networkProtocol';

const DISPATCH_DETOUR_MS=12000;
/** How far an alarm pillar may be for a detour, and how many times nearer than the case or carrier. */
const PILLAR_REACH={other:{range:45,ratio:2},gremlin:{range:90,ratio:1}} as const;

/** What a decision starts from, gathered once per decision. */
export interface GoalInput {
    now:number;
    self:PlayerData;
    state:ChaosState|undefined;
    /** Genuine cases this tick. */
    cases:readonly CaseEntry[];
    /** Other living rats. */
    living:readonly PlayerData[];
    /** Rats carrying a genuine case, nearest first. */
    carriers:readonly PlayerData[];
    carrying:boolean;
    /** A case changed hands (or started or stopped returning) this tick. */
    ownershipChanged:boolean;
    /** Why the decision is taken now: an event (a case changed hands, a goal failed, the assignment moved on) or the beat. */
    trigger:'beat'|'event';
    clear:(p:Vec3Data)=>boolean;
    /** Gremlins look further for alarm pillars. */
    personality:Personality;
}
interface Post {key:string;point:Vec3Data}
interface Place extends Post {index:number;what:string}
/** The situation as goal code sees it: every candidate the old priority ladder weighed. Built once per decision. */
export interface GoalContext extends GoalInput {
    active:boolean;
    /** Rats in sight, nearest first. */
    visible:readonly PlayerData[];
    /** The nearest carrier this rat has not failed to reach. */
    carrier?:PlayerData;
    /** The nearest case this rat can take. */
    available?:CaseEntry;
    /** The rat to fight. */
    combat?:PlayerData;
    /** The rat the motor last shot at while it was in sight, where and when (bank shots). */
    sighting?:Readonly<{id:string;p:Vec3Data;at:number}>;
    /** A useful pickup on the way (or an emergency medkit). */
    pickup?:PickupState;
    /** A mapped Ironclad site worth an occasional trip. */
    armor?:PickupState;
    /** Nearby ready alarm pillars worth a detour, nearest first. */
    pillars:readonly Place[];
    delivery?:Post;
    intercept?:Post;
    zone?:Post&{early:boolean};
    escape?:Post;
    offered:readonly Goal[];
    /** Candidate places for an open-ended goal (flee, ambush, roam, mischief), for a mind to pick an id from. */
    places(goal:Goal):readonly PlaceOption[];
    /** Per-decision memo for the lazily listed places. */
    readonly memo:{explore?:Exploration;flee?:Place[];ambush?:Place[];options?:Partial<Record<Goal,PlaceOption[]>>};
}
interface Exploration {kept:boolean;options:Place[];choice?:Place}

const COMPASS=['north','north-east','east','south-east','south','south-west','west','north-west'];
/** Plain words for where a point lies from the rat (north is −z): a distance band, a direction, a level. */
function where(self:Vec3Data,point:Vec3Data):string {
    const dx=point.x-self.x,dz=point.z-self.z,d=Math.hypot(dx,dz),dy=point.y-self.y;
    const level=dy>3?', upstairs':dy<-3?', below':'';
    if(d<6)return `next to me${level}`;
    const band=d<25?'a short run':d<60?'a long run':'across the city';
    return `${band} ${COMPASS[Math.round(Math.atan2(dx,-dz)/(Math.PI/4))&7]}${level}`;
}

/** Which goals are valid now and the plan each makes: the old priority ladder's candidates, one goal at a
 * time. Holds the per-rat timers those candidates need. Only a carrier scores in a Jurisdiction zone, so the
 * zone is part of keeping the case, never a goal of its own. */
export class BotGoals {
    private supplyTripAt=0;
    private pickupUntil=0;
    private nextPickupAt=0;
    /** When the current alarm-pillar detour is abandoned if its bell still has not rung. */
    private dispatchGiveUpAt=0;
    private explorationAt=0;
    private deliveryKey='';
    private deliveryEntering=false;
    private evadeAt=0;
    private fleeAt=0;
    private zonePostAt=0;
    private zonePost=0;
    private readonly zoneLane:number;
    private readonly places:Vec3Data[];
    constructor(private readonly navigation:MotorNavigation,private readonly motor:BotMotor,seed:number,private readonly random:()=>number){
        this.zoneLane=Math.abs(seed)%3;
        this.places=navigation.explorationTargets();
    }
    reset():void {
        this.pickupUntil=0;this.nextPickupAt=0;this.supplyTripAt=0;this.dispatchGiveUpAt=0;
        this.deliveryKey='';this.deliveryEntering=false;this.evadeAt=0;this.fleeAt=0;this.zonePostAt=0;this.zonePost=0;
    }
    /** A new round, phase, delivery or zone: pick the zone post afresh. */
    newAssignment():void {this.zonePostAt=0;}

    /** The nearest genuine case this rat may pick up now (never while carrying or during Evidence Tampering). */
    takeable(input:GoalInput):CaseEntry|undefined {
        const {now,self,state}=input,time=state?.time??now;
        const evidence=state?.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='evidence-tampering';
        return input.carrying||evidence?undefined:input.cases.filter(({key,value})=>!value.owner&&value.returningUntil<=time&&
            (value.previousOwner!==self.id||value.pickupAfter<=time)&&!this.motor.suppressed(key,value.p,now))
            .sort((a,b)=>distance(self,a.value.p)-distance(self,b.value.p))[0];
    }

    /** Immediate detours stay visible and on the current floor. Longer armor
     * trips use the separate, throttled map-site policy below. */
    private wantedPickup(state: ChaosState | undefined, self: PlayerData, now:number, clear:(p:Vec3Data)=>boolean, allowed:(p:PickupState)=>boolean) {
        return state?.pickups?.filter(p=>(p.availableAt??0)<=(state?.time??now))
            .filter(p=>p.kind!=='quick-fix'||self.hp<MAX_HP)
            .filter(p=>Math.abs(p.y-.7-self.y)<2.5&&distance(self,p)<24&&clear(p))
            .filter(p=>!this.motor.suppressed(`pickup:${p.id}`,p,now))
            .filter(allowed)
            .sort((a,b)=>distance(self,a)-distance(self,b))[0];
    }
    /** Fixed supply sites are map knowledge. A bounded occasional trip can use
     * stairs or a launcher; it never replaces pursuit of an advertised carrier. */
    private armorTrip(state:ChaosState|undefined,self:PlayerData,now:number){
        const candidates=state?.pickups?.filter(p=>p.kind==='ironclad'&&(p.availableAt??0)<=(state.time??now)&&
            Math.hypot(p.x-self.x,p.z-self.z)<65&&!this.motor.suppressed(`pickup:${p.id}`,p,now))??[];
        const current=candidates.find(p=>this.motor.key===`pickup:${p.id}`);
        if(current)return current;
        if(now<this.supplyTripAt||(state?.buffs?.[self.id]?.ironcladUntil??0)>(state?.time??now)+4000)return;
        candidates.sort((a,b)=>distance(self,a)-distance(self,b));
        return candidates[0];
    }

    /** Gather every candidate, in the old ladder's order and with its side effects (delivery two-step, zone
     * post rotation, evade timer, abandoned pillar detours). */
    survey(input:GoalInput,available:CaseEntry|undefined):GoalContext {
        const {now,self,state,carriers,carrying}=input,motor=this.motor,time=state?.time??now;
        const assignment=state?.assignment,active=assignment?.phase==='active';
        const carrier=carriers.find(p=>!motor.suppressed(`carrier:${p.id}`,p,now));
        const visible=motor.visibleRats;
        const vulnerable=visible.filter(p=>!hasIronclad(state?.buffs,p.id,time));
        const wantedId=state?.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='most-wanted'?state.dispatch.wanted:undefined;
        const wanted=wantedId&&wantedId!==self.id?input.living.find(p=>p.id===wantedId&&distance(self,p)<90&&!hasIronclad(state?.buffs,p.id,time)):undefined;
        const candidates=vulnerable.filter(p=>!motor.suppressed(`combat:${p.id}`,p,now));
        let combat=candidates[0];
        if(!input.ownershipChanged){
            const retained=candidates.find(p=>motor.key===`combat:${p.id}`);
            // A 20% / four-unit improvement is material; tiny distance
            // swaps should not discard a valid shared route. Case priorities
            // still interrupt immediately, as do death and failed routes.
            if(retained&&(!combat||distance(self,combat)+Math.max(4,distance(self,retained)*.2)>=distance(self,retained)))combat=retained;
        }
        if(wanted&&!motor.suppressed(`combat:${wanted.id}`,wanted,now))combat=wanted;
        // A mapped roof trip is still possible between objectives, but a
        // live case takes priority even when it is on the other side of town.
        const armor=!carrying&&!carrier&&!(available&&(active||distance(self,available.value.p)<24))?this.armorTrip(state,self,now):undefined;
        // A short detour to a nearby ready alarm pillar whose bell is not yet in reach, to ring it from
        // its open side: never with the case, in a fight, with a loose case close by, or when the case
        // or its carrier is less than twice as far as the pillar (gremlins: up to twice as far away, and
        // whenever the case is further than the pillar). A bell still unrung after
        // DISPATCH_DETOUR_MS is given up for a while, so a bad angle never parks the bot there.
        if(motor.mode==='dispatch'&&now>=this.dispatchGiveUpAt)motor.failGoal(now);
        const chase=Math.min(available?distance(self,available.value.p):Infinity,carrier?distance(self,carrier):Infinity);
        const reach=PILLAR_REACH[input.personality==='gremlin'?'gremlin':'other'];
        const pillars=state?.dispatch.phase==='ready'&&!motor.ringing&&!carrying&&!motor.target&&chase>=24?DISPATCH_STATIONS
            .map((station,index)=>{const point={x:station.x+Math.sin(station.face)*5,y:station.y,z:station.z+Math.cos(station.face)*5};
                return {key:`dispatch:${station.id}`,index,d:distance(self,station),point,what:`an alarm pillar, ${where(self,point)}`};})
            .filter(({key,d,point})=>d<reach.range&&d*reach.ratio<chase&&Math.abs(point.y-self.y)<3&&!motor.suppressed(key,point,now)).sort((a,b)=>a.d-b.d):[];
        const destination=active&&state?.case.owner===self.id?activeDestination(assignment!):undefined;
        let delivery:Post|undefined;
        if(destination&&assignment){
            const key=`${assignment.roundId}:${assignment.deliverySerial}:${destination}`;
            if(key!==this.deliveryKey){this.deliveryKey=key;this.deliveryEntering=false;}
            const approach=destinationPoint(destination);
            if(!this.deliveryEntering&&distance(self,approach)<2)this.deliveryEntering=true;
            else if(this.deliveryEntering&&distance(self,destinationPoint(destination,false))<2)this.deliveryEntering=false;
            const point=destinationPoint(destination,!this.deliveryEntering);
            const deliveryKey=`delivery:${key}:${this.deliveryEntering?'enter':'approach'}`;
            if(!motor.suppressed(deliveryKey,point,now))delivery={key:deliveryKey,point};
        }else {this.deliveryKey='';this.deliveryEntering=false;}
        let intercept:Vec3Data|undefined;
        const next=active?activeDestination(assignment!):undefined;
        if(!carrying&&carrier&&next&&motor.wander%3===0&&distance(self,carrier)>35){
            const approach=destinationPoint(next);
            if(distance(self,approach)+12<distance(carrier,approach)&&!motor.suppressed(`intercept:${next}`,approach,now))intercept=approach;
        }
        const jurisdiction=active?assignment!.jurisdiction:undefined;
        let zone:GoalContext['zone'];
        if(jurisdiction&&carrying){
            const current=activeZone(jurisdiction),upcoming=nextZone(jurisdiction);
            const travelMs=distance(self,JURISDICTION_ZONES[upcoming].posts[0])/12*1000;
            // A small travel estimate makes leaving early a real choice; ownership remains physical.
            const early=!zoneContains(current,self)&&jurisdiction.remainingMs<=JURISDICTION_TUNING.warningMs&&jurisdiction.remainingMs<travelMs+1000&&this.zoneLane===0;
            const id=early?upcoming:current,posts=JURISDICTION_ZONES[id].posts;
            if(!this.zonePostAt){this.zonePost=0;this.zonePostAt=now+3500;}
            else if(now>=this.zonePostAt&&visible.some(p=>distance(self,p)<22)&&distance(self,posts[(this.zonePost+this.zoneLane)%posts.length])<2){this.zonePost=(this.zonePost+1)%posts.length;this.zonePostAt=now+6000;}
            const post=(this.zonePost+this.zoneLane)%posts.length,point=jurisdictionTravelPoint(self,posts[post]);
            const key=`zone:${assignment!.roundId}:${jurisdiction.serial}:${id}:${post}:${point.x},${point.y},${point.z}`;
            if(motor.suppressed(key,point,now)){this.zonePost++;this.zonePostAt=now+6000;}
            else zone={key,point,early};
        }
        if(jurisdiction&&!carrying&&carrier&&this.zoneLane===0&&!zoneContains(activeZone(jurisdiction),carrier)&&jurisdiction.remainingMs<=JURISDICTION_TUNING.warningMs&&distance(self,carrier)>35){
            const post=JURISDICTION_ZONES[nextZone(jurisdiction)].approaches[0];
            if(distance(self,post)<distance(carrier,post))intercept=post;
        }
        if(jurisdiction&&!carrying&&carrier&&!intercept&&this.zoneLane!==0&&zoneContains(activeZone(jurisdiction),carrier)&&distance(self,carrier)>45){
            const approaches=JURISDICTION_ZONES[activeZone(jurisdiction)].approaches,post=approaches[this.zoneLane%approaches.length];
            if(distance(self,post)>5&&distance(self,post)+distance(post,carrier)<distance(self,carrier)+8&&!motor.suppressed(`intercept:${post.x},${post.z}`,post,now))intercept=jurisdictionTravelPoint(self,post);
        }
        let escape:Post|undefined;
        if(carrying&&assignment?.id==='closing-time'&&active){
            if(motor.mode==='evade'&&motor.destination&&distance(self,motor.destination)>3&&now<this.evadeAt)escape={key:motor.key,point:motor.destination};
            else {
                const [place]=this.awayFrom(self,visible,now,'evade',1);
                if(place){escape={key:place.key,point:place.point};this.evadeAt=now+(place.index<0?1000:2200);}
            }
        }
        const goal=available?.value.p??(!carrying?carrier:undefined)??zone?.point??delivery?.point??escape?.point??(carrying&&active?combat:undefined);
        const scoring=!!jurisdiction&&carrying&&zoneContains(activeZone(jurisdiction),self);
        const pickup=this.wantedPickup(state,self,now,input.clear,p=>{
            if(!active||!goal)return true;
            const d=distance(self,p),emergency=p.kind==='quick-fix'&&self.hp===1&&d<=6;
            if(scoring&&!zoneContains(activeZone(jurisdiction!),{x:p.x,y:p.y-.7,z:p.z}))return false;
            if(!emergency){
                if(available&&distance(self,available.value.p)<8)return false;
                if((motor.key===`pickup:${p.id}`?now>=this.pickupUntil:now<this.nextPickupAt))return false;
                // Collect useful supplies along the route without walking
                // back for a refresh or making a 24-unit side excursion.
                if(d>12||d+distance(p,goal)-distance(self,goal)>5)return false;
                const buff=state?.buffs?.[self.id],until=p.kind==='ironclad'?buff?.ironcladUntil:p.kind==='hustle'?buff?.hustleUntil:0;
                if((until??0)>(state?.time??now)+2000)return false;
            }
            return true;
        });
        const ctx:GoalContext={...input,active,visible,carrier,available,combat,sighting:motor.sighted,pickup,armor,pillars,delivery,
            intercept:intercept&&{key:`intercept:${jurisdiction?`${intercept.x},${intercept.z}`:next}`,point:intercept},zone,escape,offered:[],memo:{},
            places:goal=>(ctx.memo.options??={})[goal]??=this.placeOptions(goal,ctx)};
        ctx.offered=GOALS.filter(goal=>this.offers(goal,ctx));
        return ctx;
    }

    private offers(goal:Goal,ctx:GoalContext):boolean {
        switch(goal){
        case 'take-case':return !!ctx.available;
        case 'chase-carrier':return !ctx.carrying&&!!ctx.carrier;
        case 'keep-case':return !!(ctx.zone||ctx.delivery||ctx.escape||ctx.carrying&&ctx.active&&ctx.combat);
        // Only the carrier scores in the zone: holding it is keeping the case.
        case 'hold-zone':return false;
        case 'hunt':return !!ctx.combat;
        case 'flee':return ctx.visible.length>0;
        case 'heal':return ctx.pickup?.kind==='quick-fix';
        case 'arm-up':return !!(ctx.pickup&&ctx.pickup.kind!=='quick-fix'||ctx.armor);
        case 'ambush':return !ctx.carrying&&!!ctx.carrier&&ctx.active&&!!(ctx.state?.assignment?.jurisdiction||activeDestination(ctx.state!.assignment!));
        case 'mischief':return ctx.pillars.length>0;
        case 'roam':return true;
        }
    }

    /** The plan a goal makes now. A place id picks among `placeOptions`; absent, code's own choice. */
    planFor(goal:Goal,ctx:GoalContext,placeId?:string):Plan|undefined {
        const pick=(places:readonly Place[])=>places.find(p=>p.key===placeId)??places[0];
        switch(goal){
        case 'heal':return ctx.pickup?.kind==='quick-fix'?{goal,mode:'pickup',key:`pickup:${ctx.pickup.id}`,destination:ctx.pickup}:undefined;
        case 'arm-up':{
            const supply=ctx.pickup&&ctx.pickup.kind!=='quick-fix'?ctx.pickup:ctx.armor;
            return supply&&{goal,mode:'pickup',key:`pickup:${supply.id}`,destination:supply};
        }
        case 'mischief':{const pillar=pick(ctx.pillars);return pillar&&{goal,mode:'dispatch',key:pillar.key,destination:pillar.point};}
        case 'take-case':return ctx.available&&{goal,mode:'case',key:ctx.available.key,destination:ctx.available.value.p};
        case 'chase-carrier':
            if(ctx.intercept)return {goal,mode:'intercept',key:ctx.intercept.key,destination:ctx.intercept.point};
            return !ctx.carrying&&ctx.carrier?{goal,mode:'carrier',key:`carrier:${ctx.carrier.id}`,destination:ctx.carrier,follow:ctx.carrier.id}:undefined;
        case 'keep-case':
            if(ctx.zone)return {goal,mode:ctx.zone.early?'delivery':'zone-hold',key:ctx.zone.key,destination:ctx.zone.point};
            if(ctx.delivery)return {goal,mode:'delivery',key:ctx.delivery.key,destination:ctx.delivery.point};
            if(ctx.escape)return {goal,mode:'evade',key:ctx.escape.key,destination:ctx.escape.point};
            return ctx.carrying&&ctx.active&&ctx.combat?{goal,mode:'combat',key:`combat:${ctx.combat.id}`,destination:ctx.combat,follow:ctx.combat.id}:undefined;
        case 'hold-zone':return undefined;
        case 'hunt':return ctx.combat&&{goal,mode:'combat',key:`combat:${ctx.combat.id}`,destination:ctx.combat,follow:ctx.combat.id};
        case 'ambush':{const post=pick(this.ambushPosts(ctx));return post&&{goal,mode:'intercept',key:post.key,destination:post.point};}
        case 'flee':{const place=pick(this.fleePlaces(ctx));return place&&{goal,mode:'evade',key:place.key,destination:place.point};}
        case 'roam':{
            const explore=this.exploration(ctx),m=this.motor;
            if(explore.kept)return {goal,mode:'explore',key:`explore:${m.wander}`,destination:m.destination};
            const place=explore.options.find(p=>p.key===placeId)??explore.choice;
            return {goal,mode:'explore',key:place?place.key:'explore:none',destination:place?.point};
        }
        }
    }

    /** Candidate places for the open-ended goals, for a mind to choose from. */
    placeOptions(goal:Goal,ctx:GoalContext):PlaceOption[] {
        const places=goal==='mischief'?ctx.pillars:goal==='ambush'?this.ambushPosts(ctx):goal==='flee'?this.fleePlaces(ctx):goal==='roam'?this.exploration(ctx).options:[];
        return places.map(p=>({id:p.key,point:p.point,what:p.what}));
    }

    /** Timers that start when a plan is taken, not merely considered. */
    adopt(plan:Plan,ctx:GoalContext):void {
        const {now}=ctx,changed=this.motor.key!==plan.key;
        if(plan.mode==='pickup'){
            if(plan.key===`pickup:${ctx.pickup?.id}`){if(changed){this.pickupUntil=now+2200;this.nextPickupAt=now+8000;}}
            else if(changed)this.supplyTripAt=now+25000+this.random()*10000;
        }
        else if(plan.mode==='dispatch'){if(changed)this.dispatchGiveUpAt=now+DISPATCH_DETOUR_MS;}
        else if(plan.goal==='flee'){if(changed)this.fleeAt=now+2200;}
        else if(plan.goal==='roam'){
            const explore=this.exploration(ctx);
            if(!explore.kept){
                const chosen=explore.options.find(p=>p.key===plan.key);
                if(chosen)this.motor.wander=chosen.index;
                this.explorationAt=now;
            }
        }
    }

    /** Keep the current exploration point until reached, failed or 20 s old; otherwise one of the nearest few. */
    private exploration(ctx:GoalContext):Exploration {
        if(ctx.memo.explore)return ctx.memo.explore;
        const {now,self}=ctx,m=this.motor;
        if(m.mode==='explore'&&m.destination&&!m.suppressed(m.key,m.destination,now)&&distance(self,m.destination)>=3&&now<=this.explorationAt+20000){
            const point=m.destination;
            return ctx.memo.explore={kept:true,options:[{key:`explore:${m.wander}`,index:m.wander,point,what:`where I was heading, ${where(self,point)}`}]};
        }
        const nearby:Array<{index:number;point:Vec3Data;score:number}>=[];
        for(let i=0;i<this.places.length;i++){
            const candidate=this.places[i],d=distance(self,candidate);
            if(d<3||m.suppressed(`explore:${i}`,candidate,now))continue;
            nearby.push({index:i,point:candidate,score:d+Math.abs(candidate.y-self.y)*2});
            nearby.sort((a,b)=>a.score-b.score);if(nearby.length>4)nearby.pop();
        }
        const options=nearby.filter(p=>p.score<=nearby[0].score+20).map(({index,point})=>({key:`explore:${index}`,index,point,what:where(self,point)}));
        return ctx.memo.explore={kept:false,options,choice:options.length?options[(m.wander+1)%options.length]:undefined};
    }
    /** Where to run from the rats in sight (flee, and the Closing Time carrier's evade). */
    private fleePlaces(ctx:GoalContext):Place[] {
        if(ctx.memo.flee)return ctx.memo.flee;
        const {now,self,visible}=ctx,m=this.motor;
        if(m.mode==='evade'&&m.key.startsWith('flee:')&&m.destination&&distance(self,m.destination)>3&&now<this.fleeAt)
            return ctx.memo.flee=[{key:m.key,index:-1,point:m.destination,what:`where I was running, ${where(self,m.destination)}`}];
        return ctx.memo.flee=this.awayFrom(self,visible,now,'flee',4);
    }
    /** Open ground away from the rats in sight, same floor, nearest safest first, keyed `<prefix>:<index>`;
     * with none, a step straight away from the nearest rat (`<prefix>:local`, index -1). */
    private awayFrom(self:Vec3Data,visible:readonly PlayerData[],now:number,prefix:'flee'|'evade',limit:number):Place[] {
        const safety=(point:Vec3Data)=>visible.length?Math.min(...visible.map(p=>distance(point,p))):10;
        const places=this.places.map((point,index)=>({point,index,d:distance(self,point)}))
            .filter(({point,index,d})=>d>10&&d<55&&Math.abs(point.y-self.y)<2&&!this.motor.suppressed(`${prefix}:${index}`,point,now))
            .sort((a,b)=>(safety(b.point)-b.d*.35)-(safety(a.point)-a.d*.35)).slice(0,limit)
            .map(({point,index})=>({key:`${prefix}:${index}`,index,point,what:`away from the fight, ${where(self,point)}`}));
        if(!places.length&&visible[0]){
            const threat=visible[0],dx=self.x-threat.x,dz=self.z-threat.z,d=Math.hypot(dx,dz)||1;
            const point=this.navigation.localStep?.(self,{x:self.x+dx/d*8,y:self.y,z:self.z+dz/d*8});
            if(point)places.push({key:`${prefix}:local`,index:-1,point,what:'a step straight away from the nearest rat'});
        }
        return places;
    }
    /** Where the carrier must pass: the Paper Chase drop-off, the next zone's first approach, the current zone's approaches. */
    private ambushPosts(ctx:GoalContext):Place[] {
        if(ctx.memo.ambush)return ctx.memo.ambush;
        const {now,self}=ctx,assignment=ctx.state?.assignment,posts:Place[]=[];
        if(ctx.offered.includes('ambush')&&assignment){
            const next=activeDestination(assignment);
            if(next){const point=destinationPoint(next);posts.push({key:`intercept:${next}`,index:posts.length,point,what:`the ${ASSIGNMENT_DESTINATIONS[next].label.toLowerCase()} drop-off, ${where(self,point)}`});}
            const j=assignment.jurisdiction;
            if(j){
                const upcoming=JURISDICTION_ZONES[nextZone(j)],current=JURISDICTION_ZONES[activeZone(j)];
                for(const [zone,approaches] of [[upcoming,upcoming.approaches.slice(0,1)],[current,current.approaches]] as const)for(const post of approaches){
                    const point=jurisdictionTravelPoint(self,post);
                    posts.push({key:`intercept:${post.x},${post.z}`,index:posts.length,point,what:`an approach to ${zone.label.toLowerCase()}, ${where(self,point)}`});
                }
            }
        }
        return ctx.memo.ambush=posts.filter(p=>!this.motor.suppressed(p.key,p.point,now));
    }
}
