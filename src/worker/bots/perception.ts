import {cityPlaces,type Place} from '../../shared/city/places';
import {distance} from '../../shared/bots/motor';
import {BANK} from '../../shared/bots/motor/bankShot';
import {STEER} from '../../shared/bots/motor/steer';
import type {GoalContext} from '../../shared/bots/goals';
import type {Goal,Personality,PlaceOption} from '../../shared/bots/intent';
import {activeZone,JURISDICTION_TUNING} from '../../shared/jurisdiction';
import {JURISDICTION_ZONES,zoneContains} from '../../shared/jurisdictionZones';
import {activeDestination,destinationPoint,ASSIGNMENT_DESTINATIONS,ASSIGNMENT_TUNING,type AssignmentId} from '../../shared/assignments';
import {DISPATCH_STATIONS,INCIDENT_TUNING,LAUNCH_MACHINES,type Meteor} from '../../shared/chaosState';
import {incidentInfo} from '../../shared/incidentCatalog';
import {FAULTY_COPY,hasHustle,hasIronclad,heldWeapon,faultyOf,stakedOut,trapped,type FaultyKind,type PickupKind,type PickupState,type WeaponKind} from '../../shared/pickups';
import {MAX_HP,type Vec3Data} from '../../shared/networkProtocol';

/** Perception (docs/bot-overhaul.md, B3): what one rat can honestly know, in the words the city map uses.
 * Distances are run times, never units; places are named, never given as coordinates; rats are `r1`…`r9`
 * for this request only, never their chosen names. Rats in view follow the motor's sight (line of sight,
 * the same rays that aim); the Hunch and sounds are listed apart. */

/** The motor's typical running pace, in units a second: distance bands are run times at this speed. */
const RUN_SPEED=(STEER.pace[0]+STEER.pace[1])/2;
/** At full HP a rat senses others this close through walls, as humans do. */
const HUNCH_RANGE=40;
/** On Stakeout the Hunch covers the whole city, at any health (the client's `hunch.superRange`). */
const STAKEOUT_RANGE=400;
const HEARING={shotRange:60,shotAge:1,launchRange:100,launchMs:3000,alarmMs:4000};
const RECENT_HIT_MS=3000;
const COMPASS=['north','north-east','east','south-east','south','south-west','west','north-west'];
const RULES:Record<AssignmentId,string>={
    'chain-of-custody':'Paper Chase: carry the case into the named drop-off building; the first rat to make five deliveries wins. The carrier hits twice as hard and every kill it makes heals it to full.',
    jurisdiction:'Jurisdiction: only the rat carrying the case scores, while it stands inside the active zone: each zone holds twenty points that drain to the carrier, then the zone moves; the first to a hundred points wins. The carrier hits twice as hard and every kill it makes heals it to full.',
    'excessive-force':'Excessive Force: a kill counts only when made while carrying the case; the first to ten such kills wins. The carrier hits twice as hard and every kill it makes heals it to full.',
};
/** How `me` plays (its archetype, docs/bot-overhaul.md "Archetypes"), so Jev's scores fit the style. */
const STYLES:Record<Personality,string>={
    sniper:'A sniper: picks fights from 35 to 70 units away, backs off from rats that get close, and likes long sightlines and ambush spots.',
    hose:'A hose: aggressive; closes in, sprays long bursts and keeps hunting.',
    camper:'A camper: takes the case to a defensible spot and holds it there, shooting whoever comes; still delivers and scores.',
    joyrider:'A joyrider: loves the launch machines; rides them on the way and fights from the air.',
    gremlin:'A gremlin: causes chaos; rings alarm pillars and shoots launch triggers under other rats.',
};
const PICKUPS:Record<PickupKind,string>={
    'quick-fix':'a Quick Fix medkit (restores full HP)',
    ironclad:'an Ironclad Alibi (cheese balls bounce off for a while)',
    hustle:'a Hot Pursuit (run much faster for a while)',
    stakeout:'a Stakeout magnifying glass (see every rat in the city through walls for a while)',
    'tommy-gun':'a Tommy Gun (hold the trigger to spray cheese for a while)',
    laser:'a Laser (an instant beam that bounces off walls, fired as fast as I click, for a while)',
    mousetrap:'a Mousetrap (set it down; any other rat that steps on it is held in place for a few seconds)',
};
const WEAPONS:Record<WeaponKind,string>={
    'tommy-gun':'I hold a Tommy Gun: holding the trigger sprays cheese, for a while.',
    laser:'I hold a laser: an instant beam that bounces off walls, fired as fast as I click, for a while.',
    mousetrap:'I carry a mousetrap to set down: my next shot puts it on the floor just ahead, and any other rat that steps on it is held in place for a few seconds (it can still turn and shoot). It cannot catch me.',
};
/** My own Code Violation dud (`FAULTY_KINDS`), in my words. */
const MY_DUD:Record<FaultyKind,string>={
    hustle:'Cold Feet, a Code Violation dud: I run slowly for a few seconds',
    ironclad:'Rust Bucket, a Code Violation dud: my coat rusted stiff and I cannot jump for a few seconds',
    stakeout:'Staked Out, a Code Violation dud: every rat in the city sees me through walls for a few seconds',
    'tommy-gun':'Backfire, a Code Violation dud: the gun blew up in my paws and threw me backwards; I got no gun',
    laser:'Short Circuit, a Code Violation dud: my gun is shorted out and cannot fire for a few seconds',
    mousetrap:'Snapped Paw, a Code Violation dud: the trap snapped on my own paw and I cannot move for a moment',
};
/** At most this many Mousetraps in sight, within a long run, are listed, nearest first. */
const TRAPS_LISTED=4;

/** What the rat remembers between requests (the room tells the mind). */
export interface RatMemory {
    /** Hits taken, oldest first: when (room clock) and from whom (absent: the city). */
    hits:readonly {at:number;by?:string}[];
}
export interface RatSeen {id:string;where:string;hp:string;armour?:string;speed?:string;faulty?:string;held?:string;carrying?:string;shooting_at_me?:string}
/** The situation sent to Jev as `state`. */
export interface Situation {
    assignment:string;
    standing:string;
    me:{where:string;level:string;hp:string;buffs?:string;weapon?:string;carrying:string;hit?:string;style?:string};
    case:string;
    zone?:string;
    delivery?:string;
    pickups?:string[];
    /** Mousetraps in sight: whose (mine is harmless to me; another rat's kills me if I step on it) and where. */
    traps?:string[];
    rats_in_view:RatSeen[];
    /** A rat shot at moments ago that is now behind cover (bank shots). */
    last_target?:string;
    /** Sounds from things out of sight. */
    heard?:string[];
    /** The Hunch: rats close by, through walls, at full HP; every rat in the city on Stakeout. */
    sensed_through_walls?:string[];
    dispatch?:string;
}
export interface RatView {
    state:Situation;
    /** One plain description per offered goal. */
    goals:Partial<Record<Goal,string>>;
    /** Open-ended goals with two or more candidate places, as code listed them (`what` in plain words). */
    places:Partial<Record<Goal,readonly PlaceOption[]>>;
    /** Alias → rat id, for the rats in view (the target Choice). */
    inView:ReadonlyMap<string,string>;
    /** The alias of `last_target`, when there is one. */
    hidden?:string;
}

/** Numbers never reach Jev: some place and label names carry coordinates or numbers. */
const words=(text:string)=>text.replace(/\s*\d+/g,'').replace(/\s{2,}/g,' ').trim();
/** How far a run, at sprint speed, in words. */
function band(d:number):string {
    const seconds=d/RUN_SPEED;
    return seconds<.5?'right here':seconds<1.5?'a few steps':seconds<4?'a short run':seconds<9?'a long run':'across the city';
}
/** Where a point lies from the rat: how far a run, which way (north is −z), and above or below. */
function relative(self:Vec3Data,p:Vec3Data):string {
    const b=band(distance(self,p)),dy=p.y-self.y;
    const way=b==='right here'?'':` to the ${COMPASS[Math.round(Math.atan2(p.x-self.x,-(p.z-self.z))/(Math.PI/4))&7]}`;
    return `${b}${way}, ${dy>2.5?'above me':dy<-2.5?'below me':'on my level'}`;
}
/** A place as a person would name it. Street, pier and quay names carry coordinates; they become kind and district. */
function spoken(p:Place):string {
    const d=`the ${p.district}`;
    switch(p.kind){
    case 'street':return p.name.startsWith('North–south')?`a north–south street in ${d}`:p.name.startsWith('East–west')?`an east–west street in ${d}`:words(p.name.replace(/, stretch \d+$/,''));
    case 'junction':return `a street crossing in ${d}`;
    case 'lot':return `open ground in ${d}`;
    case 'roof':return p.id.startsWith(`roof:${p.district}:`)?`rooftops in ${d}`:words(p.name);
    case 'landmark-floor':return words(p.name.replace(/, floor \d+$/,', upstairs'));
    case 'quay':return 'the quay edge';
    case 'pier':return p.id==='pier:breakwater'?'the breakwater':'a pier over the harbour';
    case 'chute':return 'a Needleworks chute';
    default:return words(p.name);
    }
}
const placeOf=(p:Vec3Data)=>cityPlaces().at(p.x,p.y,p.z);
const where=(self:Vec3Data,p:Vec3Data)=>`${relative(self,p)} (${spoken(placeOf(p))})`;
const label=(text:string)=>words(text.toLowerCase());
function progress(fraction:number):string {
    return fraction<=0?'nowhere near winning':fraction<.34?'a little of the way to winning':fraction<.67?'about halfway to winning':'close to winning';
}

/** The rat's situation, its offered goals in words, and the aliases the answers map back through. */
export function perceive(ctx:GoalContext,memory:RatMemory):RatView {
    const {self,state,now}=ctx,time=state?.time??now,buffs=state?.buffs,assignment=state?.assignment;
    const active=assignment?.phase==='active'?assignment:undefined;
    const aliases=new Map<string,string>();
    const alias=(id:string)=>{let a=aliases.get(id);if(!a){a=`r${aliases.size+1}`;aliases.set(id,a);}return a;};
    const visible=new Set(ctx.visible.map(p=>p.id));
    const recentHit=(by:string)=>memory.hits.some(hit=>hit.by===by&&now-hit.at<RECENT_HIT_MS);

    const inView=new Map<string,string>();
    const rats_in_view=ctx.visible.map((p):RatSeen=>{
        const id=alias(p.id),dud=faultyOf(buffs,p.id,time);inView.set(id,p.id);
        return {id,where:where(self,p),hp:`${p.hp} of ${MAX_HP}`,
            ...(hasIronclad(buffs,p.id,time)?{armour:'Ironclad Alibi: reflects every cheese ball back at the shooter'}:{}),
            ...(hasHustle(buffs,p.id,time)&&dud!=='hustle'?{speed:'Hot Pursuit: running much faster'}:{}),
            ...(dud?{faulty:`a Code Violation dud, ${FAULTY_COPY[dud].title.toLowerCase()}: ${FAULTY_COPY[dud].effect}`}:{}),
            ...(trapped(buffs,p.id,time)?{held:'caught in a mousetrap: cannot move for a few seconds, can still turn and shoot'}:{}),
            ...(ctx.cases.some(c=>c.value.owner===p.id)?{carrying:'the case'}:{}),
            ...(recentHit(p.id)||aimedAtMe(p.id,self,state?.shots)?{shooting_at_me:'yes'}:{})};
    });

    // A carrier out of sight is known only where it was last seen or pinged (clarity batch "Case ping"); pings come
    // every 4 s, so the age is in words, like every other number but HP.
    const c=state?.case,carrier=c?.owner?ctx.carriers.find(k=>k.id===c.owner):undefined;
    const carried=!carrier?'; I do not know where':carrier.seen?`, ${where(self,carrier.rat)}`
        :`, last ${carrier.pinged?'pinged':'seen'} ${where(self,carrier.p)} ${time-carrier.at<1000?'just now':time-carrier.at<6000?'a few seconds ago':'a while ago'}`;
    const caseText=!c?'There is no case in play.':c.owner===self.id?'I am carrying the case.'
        :c.returningUntil>time?'The case is being returned and cannot be taken yet.'
        :c.owner?`${alias(c.owner)} carries the case${carried}.`
        :`Nobody holds the case; it lies ${where(self,c.p)}.`;

    let standing='No assignment is running.';
    if(assignment)standing=assignment.phase==='briefing'?'The assignment is about to start.':assignment.phase==='suspended'?'The assignment is paused.'
        :assignment.phase==='closed'?'The assignment is over.':'';
    if(active){
        const score=active.id==='chain-of-custody'?active.deliveries:active.id==='jurisdiction'?active.jurisdiction?.heldMs??{}:active.caseKills;
        const target=active.id==='chain-of-custody'?ASSIGNMENT_TUNING.deliveryTarget:active.id==='jurisdiction'?JURISDICTION_TUNING.targetMs:ASSIGNMENT_TUNING.caseKillTarget;
        const mine=score[self.id]??0,best=Math.max(0,...Object.entries(score).filter(([id])=>id!==self.id).map(([,value])=>value));
        standing=`${mine>best?'I am leading':mine===best?mine?'I am tied for the lead':'Nobody has scored yet':'I am behind the leader'}; I am ${progress(mine/target)}`+
            `${best>mine?`, and the leader is ${progress(best/target)}`:''}.`;
    }

    let zone:string|undefined;
    const j=active?.jurisdiction;
    if(j){
        const id=activeZone(j);
        const left=j.remainingMs/JURISDICTION_TUNING.zoneMs,points=left>.66?'most of its points':left>.33?'about half its points':'only a few points';
        zone=`The active zone is the ${label(JURISDICTION_ZONES[id].label)}, with ${points} left in it; ${zoneContains(id,self)?'I am inside it':`it is ${relative(self,JURISDICTION_ZONES[id].posts[0])}`}.`;
    }
    const destination=active&&activeDestination(active);
    const delivery=destination&&`The drop-off is the ${label(ASSIGNMENT_DESTINATIONS[destination].label)}, ${relative(self,destinationPoint(destination))}.`;

    // Stocked supplies within a long run that the rat can see: the nearest of each kind.
    const nearest=new Map<PickupKind,PickupState>();
    for(const p of state?.pickups??[]){
        const kept=nearest.get(p.kind);
        if((p.availableAt??0)<=time&&distance(self,p)<9*RUN_SPEED&&(!kept||distance(self,p)<distance(self,kept)))nearest.set(p.kind,p);
    }
    const pickups=[...nearest.values()].filter(p=>ctx.clear(p)).map(p=>`${PICKUPS[p.kind]}, ${where(self,p)}`);
    const traps=(state?.traps??[]).filter(t=>t.brokenAt===undefined&&distance(self,t)<9*RUN_SPEED&&ctx.clear(t))
        .sort((a,b)=>distance(self,a)-distance(self,b)).slice(0,TRAPS_LISTED)
        .map(t=>`${t.owner===self.id?'my mousetrap (harmless to me)':'another rat\'s mousetrap (stepping on it holds me in place for a few seconds; shooting breaks it)'}, ${where(self,t)}`);
    const weapon=heldWeapon(buffs,self.id,time);

    const s=ctx.sighting,quarry=s&&!visible.has(s.id)&&now-s.at<=BANK.memoryMs&&distance(self,s.p)<=BANK.range&&ctx.living.some(p=>p.id===s.id)?s:undefined;
    const hidden=quarry&&alias(quarry.id);
    const last_target=quarry&&`${hidden}, seen ${relative(self,quarry.p)} a moment ago, now behind cover`;

    const heard:string[]=[],shooters=new Set<string>();
    for(const shot of state?.shots??[]){
        const owner=shot.owner;
        if(!owner||owner===self.id||shot.age>=HEARING.shotAge||visible.has(owner)||shooters.has(owner))continue;
        const shooter=ctx.living.find(p=>p.id===owner);
        if(!shooter||distance(self,shooter)>HEARING.shotRange)continue;
        shooters.add(owner);heard.push(`gunfire, ${relative(self,shooter)}`);
    }
    const dispatch=state?.dispatch;
    if(dispatch?.phase==='rolling'&&time-dispatch.started<HEARING.alarmMs){
        const caller=dispatch.caller&&ctx.living.find(p=>p.id===dispatch.caller);
        const pillar=caller&&DISPATCH_STATIONS.reduce((a,b)=>distance(caller,a)<=distance(caller,b)?a:b);
        heard.push(pillar?`a Dispatch alarm pillar rang, ${relative(self,pillar)}`:'a Dispatch alarm pillar rang');
    }
    const machines=new Set<string>();
    for(const launch of state?.pressure?.launches??[]){
        const machine=launch.machineId&&LAUNCH_MACHINES.find(m=>m.id===launch.machineId);
        if(!machine||launch.playerId===self.id||time-launch.at>HEARING.launchMs||machines.has(machine.id)||distance(self,machine.pad)>HEARING.launchRange)continue;
        machines.add(machine.id);heard.push(`a launcher threw a rat into the air, ${relative(self,machine.pad)}`);
    }

    // A rat Staked Out (Code Violation's faulty Stakeout) is sensed through walls by every rat, city-wide.
    const staking=(state?.buffs?.[self.id]?.stakeoutUntil??0)>time,reach=staking?STAKEOUT_RANGE:HUNCH_RANGE,sharp=self.hp>=MAX_HP||staking;
    const sensed=ctx.living.filter(p=>p.id!==self.id&&!visible.has(p.id)&&(sharp&&distance(self,p)<=reach||stakedOut(buffs,p.id,time)))
        .sort((a,b)=>distance(self,a)-distance(self,b)).map(p=>`${alias(p.id)}, ${where(self,p)}`);

    let incident:string|undefined;
    if(dispatch?.phase==='active'&&dispatch.incident){
        const info=incidentInfo(dispatch.incident);
        incident=`${info.title}: ${info.description}`+(info.id==='most-wanted'&&dispatch.wanted
            ?dispatch.wanted===self.id?' I am the wanted rat.':` The wanted rat is ${alias(dispatch.wanted)}.`
            :info.id==='blackout'?' I see rats only as far as my flashlight reaches.'
            :info.id==='bad-ammunition'?' Every ball I fire has a quirk: it corkscrews, snakes, bounces without slowing, floats or hiccups.'
            :info.id==='code-violation'?' Supplies hop away from rats, and the Quick Fix hops furthest and fastest; every other supply I claim now comes out as a short, harmless dud (slower legs, no jumping, seen through walls, a gun that blows up in my paws, a gun that cannot fire, or a paw stuck in a trap); a Quick Fix still heals fully. Launch machines fire on their own and alarm pillars clang; both shove rats beside them, but never into the water. Nothing in this incident can kill me.'
            :info.id==='cheddar-shower'?` Cheese meteors fall near rats; a dark shadow marks each landing a moment ahead. Standing in a shadow flattens me, the blast throws rats nearby, and a roof overhead shelters me.${shadows(self,time,state?.meteors,ctx.clear)}`:'');
    }

    // Only aliases already given: an unseen attacker stays unnamed.
    const hit=memory.hits[memory.hits.length-1];
    const hitText=hit&&now-hit.at<RECENT_HIT_MS?!hit.by?'hurt by the city a moment ago':aliases.has(hit.by)?`hit by ${aliases.get(hit.by)} a moment ago`:'hit by a rat I cannot see, a moment ago':undefined;
    const place=placeOf(self);
    const myDud=faultyOf(buffs,self.id,time);
    const myBuffs=[hasIronclad(buffs,self.id,time)&&'Ironclad Alibi (cheese balls bounce off me)',hasHustle(buffs,self.id,time)&&myDud!=='hustle'&&'Hot Pursuit (running much faster)',
        myDud&&MY_DUD[myDud],trapped(buffs,self.id,time)&&'caught in another rat\'s mousetrap (I cannot move for a few seconds; I can still turn and shoot)'].filter(Boolean).join(' and ');

    const goals:Partial<Record<Goal,string>>={},places:Partial<Record<Goal,readonly PlaceOption[]>>={};
    for(const goal of ctx.offered){
        goals[goal]=describe(goal,ctx,alias);
        if(goal==='flee'||goal==='ambush'||goal==='roam'||goal==='mischief'){
            const options=ctx.places(goal);
            if(options.length>1)places[goal]=options.map(option=>({...option,what:words(option.what)}));
        }
    }

    return {goals,places,inView,...(hidden?{hidden}:{}),state:{
        assignment:assignment?RULES[assignment.id]:'No assignment is running: kills are all that count.',
        standing,
        me:{where:spoken(place),level:place.kind==='roof'||place.kind==='lookout'?'on a roof':place.floor==='upper'?'upstairs':place.floor==='sewer'?'in the sewer':place.floor==='air'?'in the air':'at street level',
            hp:`${self.hp} of ${MAX_HP}`,...(myBuffs?{buffs:myBuffs}:{}),...(weapon?{weapon:WEAPONS[weapon]}:{}),carrying:ctx.carrying?'the case':'nothing',...(hitText?{hit:hitText}:{}),
            ...(ctx.personality?{style:STYLES[ctx.personality]}:{})},
        case:caseText,
        ...(zone?{zone}:{}),...(delivery?{delivery}:{}),...(pickups.length?{pickups}:{}),...(traps.length?{traps}:{}),
        rats_in_view,
        ...(last_target?{last_target}:{}),...(heard.length?{heard}:{}),...(sensed.length?{sensed_through_walls:sensed}:{}),...(incident?{dispatch:incident}:{}),
    }};
}

/** Cheddar Shower: the falling meteors' shadows in sight within a long run, nearest first, in words. */
function shadows(self:Vec3Data,time:number,meteors:readonly Meteor[]|undefined,clear:(p:Vec3Data)=>boolean):string {
    const seen=(meteors??[]).filter(m=>m.at>time&&distance(self,m)<9*RUN_SPEED&&clear({x:m.x,y:m.y+.5,z:m.z}))
        .sort((a,b)=>distance(self,a)-distance(self,b)).slice(0,TRAPS_LISTED);
    const under=seen.some(m=>Math.abs(m.y-self.y)<=3&&Math.hypot(m.x-self.x,m.z-self.z)<INCIDENT_TUNING.meteorRadius+1.5);
    return (under?' A meteor shadow is under me: step out of it now.':'')+(seen.length?` Meteor shadows I see: ${seen.map(m=>relative(self,m)).join('; ')}.`:'');
}

/** A ball of this rat's still flying, less than a second old, whose line passes within a body of me. */
function aimedAtMe(owner:string,self:Vec3Data,shots:readonly {owner:string|null;p:Vec3Data;v:Vec3Data;age:number}[]|undefined):boolean {
    return !!shots?.some(({owner:by,p,v,age})=>{
        if(by!==owner||age>=1)return false;
        const rx=self.x-p.x,ry=self.y+1-p.y,rz=self.z-p.z,speed=v.x*v.x+v.y*v.y+v.z*v.z;
        const t=speed?(rx*v.x+ry*v.y+rz*v.z)/speed:0;
        return t>0&&Math.hypot(rx-v.x*t,ry-v.y*t,rz-v.z*t)<3;
    });
}

/** One offered goal in plain words, for this moment. */
function describe(goal:Goal,ctx:GoalContext,alias:(id:string)=>string):string {
    const self=ctx.self;
    switch(goal){
    case 'take-case':return ctx.available?`Go and pick up the loose case, ${relative(self,ctx.available.value.p)}.`:'Go and pick up the loose case.';
    case 'chase-carrier':
        if(ctx.intercept)return `Get ahead of the rat carrying the case, at a place it must pass, ${relative(self,ctx.intercept.point)}.`;
        return ctx.carrier?`Go after ${alias(ctx.carrier.id)}, who carries the case, to take it.`:'Go after the rat carrying the case, to take it.';
    case 'keep-case':
        if(ctx.zone)return ctx.zone.camp?`Carry the case to the ${label(JURISDICTION_ZONES[ctx.zone.id].label)}, a defensible spot ${relative(self,ctx.zone.point)}, and hold it there, shooting whoever comes.`:
            'Carry the case into the active zone and hold it there.';
        if(ctx.delivery)return 'Carry the case to the drop-off.';
        return ctx.combat?`Keep the case and fight ${alias(ctx.combat.id)}.`:'Keep the case.';
    case 'hold-zone':return 'Get into the active zone and stay in it.';
    case 'hunt':return ctx.combat?`Close in on ${alias(ctx.combat.id)} and shoot it.`:'Close in on a rat and shoot it.';
    case 'flee':return 'Break line of sight and get away from the rats in view.';
    case 'heal':return ctx.pickup?`Pick up the Quick Fix medkit ${relative(self,ctx.pickup)}; it restores full HP.`:'Pick up a Quick Fix medkit to restore full HP.';
    case 'arm-up':{
        const supply=ctx.pickup&&ctx.pickup.kind!=='quick-fix'?ctx.pickup:ctx.armor;
        return supply?`Pick up ${PICKUPS[supply.kind]}, ${relative(self,supply)}.`:'Pick up armour or speed.';
    }
    case 'ambush':return 'Wait where the rat carrying the case must pass, and shoot it as it arrives.';
    case 'mischief':return 'Ring a Dispatch alarm pillar to start a random city incident.';
    case 'roam':return 'Move on through the city, looking for a fight or an opening.';
    }
}
