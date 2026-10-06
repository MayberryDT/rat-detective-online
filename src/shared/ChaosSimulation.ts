import * as C from 'cannon-es';
import {trapLaunch,trapAdvance,trapVelocity,TRAP_THROW} from './trapThrow';
import {resolveShotPattern,tommyHeat} from './shotPattern';
import {laserPath,type LaserCast} from './laser';
import type {WorldFoleyCue} from './foleyEvents';
import { SpatialRayQuery } from './SpatialRayQuery';
import { sweepSphereBody } from './sweepSphere';
import { closestPointOnSegment, INTERACTION_SWEEP_DISTANCE, INTERACTION_SWEEP_MS, NETPLAY_COMPENSATION_MS, NETPLAY_HISTORY_MS, type MovementPoint } from './netplay';
import { SLICK_MATERIAL, StaticCityBroadphase, addCityBody, cityBoxBody } from './StaticCityBroadphase';
import { boundedIncidentVelocity, launcherVelocity, LANDING_SHOCKWAVE, SURGE, type ThrowSource } from './launcherVelocity';
import { incidentInfo, incidentRoster, type EvidenceMode, type IncidentId } from './incidentCatalog';
import { CITY_BOUNDS, grayboxBoxes } from './grayboxLayout';
import { isReachableLandmarkPosition } from './landmarkLayout';
import { isReachableVehiclePosition } from './vehicleLayout';
import { BALL_SPEED, BALL_GRAVITY, BALL_RESTITUTION, BALL_RADIUS } from './ballTuning';
import { bounceShot, crossfireBounce, quirkBirth, quirkBounce, shotLife, steerQuirk } from './shotBallistics';
import { CASE_HOME, CASE_HAND, CASE_CARRY_ROTATION, CASE_SIZE, CASE_LOOSE_SCALE, CASE_SPAWNS, EXTRA_CASE_IDS, CHAOS_TUNING as T, CROSSFIRE, INCIDENT_TUNING as I, DISPATCH_STATIONS, PRESSURE_LAUNCH, PRESSURE_TUNING, LAUNCH_MACHINES, MAX_LAUNCH_EVENTS,
    type CaseState, type ChaosState, type ChaosShot, type CorpseState, type PhysicalPose, type LaunchMachine, type PressureState, type TrapState, type LaserBeam, MAX_TRAPS, MAX_BEAMS } from './chaosState';
import { hasIronclad, mergePickup, mergeFaulty, activeBuffs, buffExpired, heldWeapon, pickupEffectUntil, shortedOut, FAULTY_COPY, FAULTY_TUNING, PICKUP_KINDS, PICKUP_TUNING, WEAPON_TUNING as W, TRAP_SCALE, TRAP_TALL, resolvePickupPoints, randomSiteKind,
    type BuffMap, type FaultyKind, type PickupKind, type PickupPoint, type WeaponKind } from './pickups';
import { overWater } from './city/kit/city';
import type { WorldSpec } from './worldSpec';
import { worldSpawnPoints } from './playerSpawns';
import { addRatShapes } from './rat/ratBody';
import { MAX_HP, type EnvironmentCause, type HealCause, type PickupRejectReason, type PickupTarget, type PlayerData, type ShotDescriptor, type ShotResultOutcome, type Vec3Data } from './networkProtocol';
import { AssignmentRules } from './AssignmentRules';
import { allUnitsPoint } from './allUnits';
import { ASSIGNMENT_TUNING, activeDestination, ASSIGNMENT_DESTINATIONS, destinationPoint, restoreAssignment, type AssignmentState, type DestinationId } from './assignments';

const caseCarryRotation=new C.Quaternion(CASE_CARRY_ROTATION.x,CASE_CARRY_ROTATION.y,CASE_CARRY_ROTATION.z,CASE_CARRY_ROTATION.w);
/** A site's next pickup: Quick Fix sites keep the heal; every other site rolls a random one (`RANDOM_SITE_KINDS`). */
const siteKind=(kind:PickupKind):PickupKind=>kind==='quick-fix'?kind:randomSiteKind();

/** A launched case lands rather than ping-ponging: balls keep their 0.9 bounce,
 * but a heavy briefcase sheds most of its speed on each ground contact. */
const LAUNCHED_CASE_RESTITUTION = .35;
/** Cases carry their own material so chutes (slick) can drop friction and most of the bounce. */
const CASE_MATERIAL = new C.Material('case');

const outsideCity=(x:number,z:number)=>x<CITY_BOUNDS.min||x>CITY_BOUNDS.max||z<CITY_BOUNDS.min||z>CITY_BOUNDS.max;
/** Code Violation's throws (`safeShove`): extra units past the worst-case landing that must stay dry and in the city,
 * and the turns (radians) tried from the intended line, nearest first. */
const SAFE_SHOVE_MARGIN=4;
const SAFE_SHOVE_TURNS=[0,.5,-.5,1,-1,1.6,-1.6,2.3,-2.3,Math.PI];

const vec=(v:Vec3Data)=>new C.Vec3(v.x,v.y,v.z);
const data=(v:Vec3Data)=>({x:v.x,y:v.y,z:v.z});
const pose=(b:C.Body):PhysicalPose=>({p:data(b.position),q:{x:b.quaternion.x,y:b.quaternion.y,z:b.quaternion.z,w:b.quaternion.w},v:data(b.velocity),spin:data(b.angularVelocity)});
type Target = { kind:'world'|'case'|'dispatch'|'pressure'|'corpse'|'rat'|'trap'; player?:PlayerData; head?:C.Sphere; corpseId?:string; machineId?:string; caseId?:string; trapId?:string };
/** A rat a swept ball or beam reached, rewound to the shooter's view when `compensated`. */
interface RatContact {hit:C.RaycastResult;target:Target;compensated:boolean;ironclad:boolean;rewindMs:number;targetDelta:number}
interface CaseRuntime {
    id:string;body:C.Body;owner:string|null;previousOwner:string|null;missileOwner?:string;
    hitAfter:Map<string,number>;pickupAfter:number;returningUntil:number;looseSince:number;
    /** Grip: enemy balls taken by the carrier's case, the last at `gripAt` (`gripBall`, so one ball counts once). */
    grip:number;gripAt:number;gripBall?:string;
    /** The latest heartbeat ping while carried (`CaseState.ping`); cleared when the case comes loose. */
    ping?:NonNullable<CaseState['ping']>;
    scale:number;lastSpawn:Vec3Data;armed:boolean;
    /** Ridden a municipal launcher pad. Swept flight with its own lift cap, and
     * exempt from the loose-case recovery watchdog until it settles. */
    launched:boolean;launchLift:number;
}
/** null ownership is an environmental hit, including neutral chains; `cause` names it when it is not Tampering. `weapon`: a special weapon made the hit.
 * `bounces`/`path`: a Crossfire bank shot's world bounces and the ball's path (`CROSSFIRE`). For highlight detection only:
 * `squashAirMs` a launched rat landing on the victim after that long in the air, `corpse` a flying corpse, `reflections` the
 * walls a laser beam came off. */
export interface ChaosHit { owner:string|null; victim:string; damage:number; incoming:Vec3Data; shotId?:string; ballId?:string; point?:Vec3Data; normal?:Vec3Data; compensated?:boolean; explosive?:true; headshot?:true; weapon?:WeaponKind; cause?:EnvironmentCause; bounces?:number; path?:Vec3Data[];
    squashAirMs?:number; corpse?:true; reflections?:number }
/** Code Violation malfunctions, for the city map (`drainIncidentEvents`). `faulty`: a supply came out as the `pickup`
 * dud on `playerId`. */
export type IncidentEvent =
    | { kind:'malfunction'; what:'faulty'|'machine'|'pillar'; site:string; p:Vec3Data; playerId?:string; pickup?:FaultyKind; shoved:number };
/** `end` is where a ball's life ran out (city map facts only; never sent to clients). */
export interface ShotResultEvent {owner:string|null;shotId:string;ballId:string;outcome:ShotResultOutcome;at:number;tick:number;epoch:string;victimId?:string;damage?:number;point?:Vec3Data;normal?:Vec3Data;compensated?:boolean;fallback?:string;rewindMs?:number;targetDelta?:number;end?:Vec3Data}
/** `faulty`: Code Violation made the claim a dud (`FAULTY_KINDS`); `effectUntil` is then when the dud ends. */
export interface PickupClaimResult {accepted:boolean;target:PickupTarget;targetId:string;playerId:string;pickup?:PickupKind;effectUntil?:number;faulty?:true;reason?:PickupRejectReason}
/** A pickup claim the room must announce. Healing is drained so the room can
 * persist and broadcast the restored health without the sim owning networking. */
export type PickupEvent =
    | { kind:'collected'; pickupId:string; pickup:PickupKind; playerId:string; faulty?:true }
    | { kind:'healed'; playerId:string; hp:number; cause:HealCause }
    /** A supply handed over on the spot (`rewardSupply`), not from a site. */
    | { kind:'rewarded'; playerId:string; pickup:PickupKind; why:RewardReason }
    /** A Mousetrap was set down, snapped on a rat and holds it (`victim`), or destroyed (`by` the rat whose hit broke it). */
    | { kind:'trap'; what:'launch'|'set'|'snap'|'break'; trapId:string; playerId:string; p:Vec3Data; victim?:string; by?:string|null; hits?:number };
export type RewardReason='streak'|'dispatch'|'bounty';
/** One authoritative simulation, also usable by the solo preview. No rendering or DOM. */
export class ChaosSimulation {
    readonly world = new C.World({gravity:new C.Vec3(0,-25,0)});
    private primaryCase!:CaseRuntime;
    private readonly cases=new Map<string,CaseRuntime>();
    get caseBody():C.Body{return this.primaryCase.body;}
    private readonly rayQuery=new SpatialRayQuery(this.world);
    private substepCount=0;
    readonly targets=new Map<C.Body,Target>();
    private rats=new Map<string,C.Body>();
    private readonly pickupApproaches=new Map<string,MovementPoint>();
    private readonly ratHistory=new Map<string,Array<{at:number;p:Vec3Data;alive:boolean;life:number;ironclad:boolean}>>();
    private readonly caseHistory:Array<{at:number;p:Vec3Data;q:{x:number;y:number;z:number;w:number};owner:string|null;scale:number}>=[];
    private readonly ratLives=new Map<string,{alive:boolean;life:number}>();
    private readonly shotViews=new Map<string,{trigger:string;viewAt:number;untilAge:number}>();
    private readonly shotTriggers=new Map<string,string>();
    private readonly shotEvents:ShotResultEvent[]=[];
    private readonly shotStepped=new WeakSet<ChaosShot>();
    /** Machines each ball has already pumped: one ball is one hit, however it ricochets. */
    private readonly pumpedBy=new WeakMap<ChaosShot,string[]>();
    /** Crossfire: each ball's muzzle (when fired during Crossfire), its first `CROSSFIRE.pathPoints` world bounces and its bounce count. */
    private readonly bankPaths=new WeakMap<ChaosShot,{origin?:Vec3Data;points:Vec3Data[];bounces:number}>();
    private corpses=new Map<string,{body:C.Body;state:CorpseState;hitAfter:Map<string,number>}>();
    private shots:ChaosShot[]=[];
    private readonly burstShots=new WeakSet<ChaosShot>();
    private impacts:ChaosState['impacts']=[];
    private audioImpacts:ChaosState['impacts']=[];
    private readonly contactSoundAt=new WeakMap<C.Body,number>();
    /** Pickup sites by id. A claim hides the site until its respawn deadline. */
    private readonly pickups=new Map<string,{kind:PickupKind;p:Vec3Data;availableAt:number}>();
    private buffs:BuffMap={};
    private readonly pickupEvents:PickupEvent[]=[];
    private readonly recentPickupClaims=new Map<string,{playerId:string;generation:number;at:number;pickup:PickupKind;effectUntil?:number;faulty?:true}>();
    private pickupPoints?:PickupPoint[];
    /** Set Mousetraps by id, each with its shootable static body and the rat it holds (or just let go, until that rat
     * steps clear); at most one per rat. */
    private readonly traps=new Map<string,{state:TrapState;body:C.Body;held?:string}>();
    private trapSerial=0;
    /** Recent laser beams for the snapshot, newest last. */
    private beams:LaserBeam[]=[];
    /** Each rat's Tommy Gun heat: held-shot count and its latest trigger. */
    private readonly tommyHeat=new Map<string,{heat:number;at:number}>();
    /** Balls a Tommy Gun fired (their hits are noted as the Tommy's). */
    private readonly tommyBalls=new WeakSet<ChaosShot>();
    private possession:Record<string,number>={};
    private dispatch:ChaosState['dispatch']={phase:'ready',started:0,until:0,serial:0};
    /** Most Wanted: when the leader is next looked at again. */
    private wantedAt=0;
    /** Scattershot balls: a hit shoves the rat it lands on. */
    private readonly scatterShots=new WeakSet<ChaosShot>();
    /** Code Violation: each supply site's authored home and next allowed hop, when each machine next misfires on its own,
     * and when an alarm pillar next clangs. */
    private readonly siteHomes=new Map<string,Vec3Data>();
    private readonly siteHopAt=new Map<string,number>();
    private readonly misfireAt=new Map<string,number>();
    private clangAt=0;
    private readonly incidentEvents:IncidentEvent[]=[];
    private casesWeaponized=false;
    /** Room-selected Dispatch roster: `classic` adds the retired Evidence Tampering (private practice only). */
    evidenceMode:EvidenceMode='standard';
    /** Practice-only override: force every roll to one incident id. */
    forcedIncident:IncidentId|null=null;
    /** A deploy's allow-list (`INCIDENTS`, staging playtests): rolls draw only these. Empty = every incident. */
    onlyIncidents:readonly IncidentId[]=[];
    private pressure:PressureState={serial:0,levels:{},launches:[]};
    /** Launched rats in the air, by id: the machine, launch time and highest point so far. */
    private readonly flights=new Map<string,{machineId:string;at:number;peak:number}>();
    /** Clear street points (spawn grid) where Pressure Surge may open a street launcher. */
    private streetPoints:readonly Vec3Data[]=[];
    /** Street launchers still in their steam warning. */
    private readonly pendingVents=new Set<string>();
    /** Pressure Surge bookkeeping for the current incident (by Dispatch serial). */
    private surge={serial:-1,finale:-1,nextWave:0,nextSuction:0,vents:0};
    /** Rat id → time until which a launcher throw or landing shove may carry it faster than walking. */
    private readonly thrownUntil=new Map<string,number>();
    /** True while `playerId` may still be riding a throw or shove (movement validation widens for it). */
    thrown(playerId:string,at:number):boolean {return (this.thrownUntil.get(playerId)??-Infinity)>=at;}
    private notice={serial:0,text:'Find the Hot Case. Ring the alarm bell.'};
    private now=Date.now();
    private epoch:string=crypto.randomUUID();
    private tick=0;
    get time():number{return this.now;}
    private assignment?:AssignmentRules;
    private primaryAcquiredAt=0;
    get assignmentState():AssignmentState|undefined{return this.assignment?.state;}
    /** All Units: where the fallen respawn beside the action, the active zone or the real case. */
    get allUnitsTarget():Vec3Data|undefined{
        if(!this.incidentActive('all-units'))return undefined;
        const owner=this.primaryCase.owner?this.players.get(this.primaryCase.owner):undefined;
        return allUnitsPoint(this.assignment?.state,owner??this.primaryCase.body.position);
    }
    setAssignment(state:AssignmentState):void{this.assignment=new AssignmentRules(structuredClone(state),this.players);}
    private hit(hit:ChaosHit):void{if(!this.assignment?.closed)this.onHit(hit);}
    get caseHolderId():string|null{return this.primaryCase.owner;}
    /** Called synchronously by authoritative damage resolution, never at launch. */
    creditCaseKill(killerId:string|null):boolean {
        if(killerId===null)return false;
        // Every assignment: a kill made while carrying the case heals the carrier to full (quick patch, protocol 28).
        const carrier=this.carrierPower(killerId)>1?this.players.get(killerId):undefined;
        if(carrier&&carrier.hp>0&&carrier.hp<MAX_HP){carrier.hp=MAX_HP;this.pickupEvents.push({kind:'healed',playerId:carrier.id,hp:MAX_HP,cause:'case-kill'});}
        if(this.casesWeaponized||this.primaryCase.returningUntil)return false;
        return this.assignment?.kill(killerId,this.primaryCase.owner,this.now)??false;
    }
    /** Damage multiplier for a shooter's hits: the case carrier hits twice as hard in every assignment (quick patch, protocol 28). */
    carrierPower(owner:string|null):number {
        return owner!==null&&owner===this.primaryCase.owner&&this.assignment?.active?T.carrierDamage:1;
    }
    isCaseHolder(id:string):boolean{for(const c of this.cases.values())if(c.owner===id)return true;return false;}
    /** Riding a launcher throw, not yet landed. */
    airborne(id:string):boolean{return this.flights.has(id);}
    /** Held by a Mousetrap now. */
    trapped(id:string):boolean{return (this.buffs[id]?.trappedUntil??0)>this.now;}
    /** Where the newest corpse of `victimId` is, while it lasts. */
    corpseAt(victimId:string):Vec3Data|undefined{
        let found:C.Body|undefined;
        for(const c of this.corpses.values())if(c.state.victimId===victimId)found=c.body;
        return found?data(found.position):undefined;
    }
    constructor(private players:Map<string,PlayerData>,private onHit:(hit:ChaosHit)=>void, saved?:ChaosState, spec?:WorldSpec, private readonly fixtureSupplies?:readonly PickupPoint[]) {
        // The city is mostly static boxes; sweep-and-prune avoids testing every
        // static pair whenever a case or corpse moves.
        this.world.broadphase=new StaticCityBroadphase(this.world);
        this.world.broadphase.useBoundingBoxes=true;
        // Contact history is sparse; fixed city bodies are outside world.bodies
        // (index -1), which only the id-keyed matrix handles.
        this.world.collisionMatrix=new C.ObjectCollisionMatrix() as unknown as C.ArrayCollisionMatrix;
        this.world.collisionMatrixPrevious=new C.ObjectCollisionMatrix() as unknown as C.ArrayCollisionMatrix;
        this.world.defaultContactMaterial.friction=.15;
        this.world.defaultContactMaterial.restitution=.72;
        // A loose case that falls into a chute rides it to the street; it never snags upstairs.
        this.world.addContactMaterial(new C.ContactMaterial(SLICK_MATERIAL,CASE_MATERIAL,{friction:0,restitution:.1}));
        for(const b of grayboxBoxes(spec)){
            const body=cityBoxBody(b);
            addCityBody(this.world,body);this.targets.set(body,{kind:'world'});
        }
        for(const station of DISPATCH_STATIONS){
            this.addControl(station.box,'world');this.addControl(station.target,'dispatch');
        }
        for(const machine of LAUNCH_MACHINES){
            this.addControl(machine.box,'world');this.addControl(machine.target,'pressure',machine.id);
        }
        this.seedPickups(spec);
        this.primaryCase=this.createCase('primary');
        if(saved){this.epoch=saved.epoch??this.epoch;this.tick=saved.tick??0;this.restore(saved);}else this.placeCaseAtSpawn();
    }
    /** Keep rewards on their authored supported floor; street medkits use the
     * world's clear spawn pavement. No unsupported reward is forced into geometry. */
    private seedPickups(spec?:WorldSpec):void{
        let clear:readonly Vec3Data[];
        try{clear=spec?worldSpawnPoints(spec):CASE_SPAWNS;}catch{clear=CASE_SPAWNS;}
        this.streetPoints=clear;
        this.pickupPoints=this.fixtureSupplies?[...this.fixtureSupplies]:resolvePickupPoints(clear,14,p=>this.supportedSpot(p));
        for(const point of this.pickupPoints){this.pickups.set(point.id,{kind:this.fixtureSupplies?point.kind:siteKind(point.kind),p:{...point.p},availableAt:0});this.siteHomes.set(point.id,{...point.p});}
    }
    /** A supply-sized volume at `p` (prop height .7 above the foot) is clear of
     * static boxes, stands on flat floor with headroom, and has no wall hugging it. */
    private supportedSpot(p:Vec3Data):boolean{
        const ray=(from:C.Vec3,to:C.Vec3)=>{const hit=new C.RaycastResult();this.world.raycastClosest(from,to,{collisionFilterMask:1},hit);return hit;};
        const foot=p.y-.7;
        // Rays starting inside a shelf can miss every face. Check the whole
        // rat/prop volume against static boxes before testing floor support.
        const local=new C.Vec3(),point=new C.Vec3();
        const broadphase=this.world.broadphase,city=broadphase instanceof StaticCityBroadphase?broadphase.fixed:[];
        for(const body of [...this.world.bodies,...city]){
            if(body.mass!==0)continue;
            for(const shape of body.shapes){
                if(!(shape instanceof C.Box))continue;
                for(const [height,radius] of [[.6,.6],[1.3,.85],[1.9,.35]]){
                    point.set(p.x,foot+height+.04,p.z);body.pointToLocalFrame(point,local);
                    const h=shape.halfExtents;
                    const dx=Math.max(0,Math.abs(local.x)-h.x),dy=Math.max(0,Math.abs(local.y)-h.y),dz=Math.max(0,Math.abs(local.z)-h.z);
                    if(dx*dx+dy*dy+dz*dz<radius*radius)return false;
                }
            }
        }
        for(const [dx,dz] of [[0,0],[.7,0],[-.7,0],[0,.7],[0,-.7]]){
            const hit=ray(new C.Vec3(p.x+dx,foot+.15,p.z+dz),new C.Vec3(p.x+dx,foot-.2,p.z+dz));
            if(!hit.hasHit||hit.hitNormalWorld.y<.9)return false;
            if(ray(new C.Vec3(p.x+dx,foot+.2,p.z+dz),new C.Vec3(p.x+dx,foot+2.8,p.z+dz)).hasHit)return false;
        }
        for(let i=0;i<8;i++)if(ray(new C.Vec3(p.x,foot+1.3,p.z),new C.Vec3(p.x+Math.cos(i*Math.PI/4),foot+1.3,p.z+Math.sin(i*Math.PI/4))).hasHit)return false;
        return true;
    }
    private createCase(id:string):CaseRuntime{
        const body=new C.Body({mass:1.5,shape:new C.Box(new C.Vec3(CASE_SIZE.x/2,CASE_SIZE.y/2,CASE_SIZE.z/2)),material:CASE_MATERIAL,
            position:vec(CASE_HOME),collisionFilterGroup:4,collisionFilterMask:1|8|16,linearDamping:.2,angularDamping:.25});
        body.addShape(new C.Box(new C.Vec3(.15,.035,.04)),new C.Vec3(0,.43,0));
        for(const x of [-.12,.12])body.addShape(new C.Box(new C.Vec3(.0275,.065,.04)),new C.Vec3(x,.36,0));
        const c:CaseRuntime={id,body,owner:null,previousOwner:null,hitAfter:new Map(),pickupAfter:0,grip:0,gripAt:0,
            returningUntil:0,looseSince:this.now,scale:1,lastSpawn:CASE_HOME,armed:false,
            launched:false,launchLift:0};
        this.world.addBody(body);this.targets.set(body,{kind:'case',caseId:id});this.cases.set(id,c);
        this.listenForContacts(body,'case-bounce');
        this.scaleCase(CASE_LOOSE_SCALE,c);return c;
    }
    private syncExtraCases(){
        if(this.incidentActive('evidence-tampering')){
            for(const id of EXTRA_CASE_IDS)if(!this.cases.has(id))this.placeCaseAtSpawn(this.createCase(id));
        }else this.dropExtras();
    }
    private removeCaseBody(id:string,c:CaseRuntime):void{
        this.world.removeBody(c.body);this.targets.delete(c.body);this.cases.delete(id);
    }
    /** Quietly retire every extra case without an unannounced detonation. */
    private dropExtras():void{for(const [id,c] of [...this.cases])if(id!=='primary')this.removeCaseBody(id,c);}
    /** Preserve the last accepted network segment instead of letting unchanged
     * simulation ticks erase the path a human actually traversed. */
    recordMovement(playerId:string,from:Vec3Data,to:Vec3Data,at:number,seq:number):void {
        const previous=this.pickupApproaches.get(playerId);
        if(previous&&seq<=previous.seq)return;
        this.pickupApproaches.set(playerId,{seq,at,p:{x:from.x,y:from.y+.8,z:from.z}});
        const player=this.players.get(playerId);if(player){player.x=to.x;player.y=to.y;player.z=to.z;}
    }
    private interactionPoint(player:PlayerData,target:Vec3Data,now:number):C.Vec3 {
        const reach={x:player.x,y:player.y+.8,z:player.z},previous=this.pickupApproaches.get(player.id);
        if(!previous||now-previous.at>INTERACTION_SWEEP_MS)return vec(reach);
        const length=Math.hypot(reach.x-previous.p.x,reach.y-previous.p.y,reach.z-previous.p.z);
        if(length>INTERACTION_SWEEP_DISTANCE)return vec(reach);
        return vec(closestPointOnSegment(previous.p,reach,target));
    }
    private collectPickup(id:string,site:{kind:PickupKind;p:Vec3Data;availableAt:number},player:PlayerData,now:number):PickupClaimResult {
        if(now<site.availableAt)return{accepted:false,target:'pickup',targetId:id,playerId:player.id,reason:'unavailable'};
        if(player.hp<=0||site.kind==='quick-fix'&&player.hp>=MAX_HP)return{accepted:false,target:'pickup',targetId:id,playerId:player.id,reason:'ineligible'};
        const closest=this.interactionPoint(player,site.p,now),reach=new C.Vec3(player.x,player.y+.8,player.z);
        if(closest.distanceTo(vec(site.p))>PICKUP_TUNING.claimRadius)return{accepted:false,target:'pickup',targetId:id,playerId:player.id,reason:'too-far'};
        if(this.ray(closest,vec(site.p),1).hasHit||this.ray(reach,vec(site.p),1).hasHit)return{accepted:false,target:'pickup',targetId:id,playerId:player.id,reason:'blocked'};
        const generation=site.availableAt;
        // Code Violation: every supply but Quick Fix comes out faulty (`faultyClaim`); Quick Fix heals as ever.
        const faulty=site.kind!=='quick-fix'&&this.incidentActive('code-violation')?site.kind:undefined;
        if(faulty)this.faultyClaim(player,faulty,id,site.p,now);
        else if(site.kind==='quick-fix'){
            player.hp=MAX_HP;this.pickupEvents.push({kind:'healed',playerId:player.id,hp:player.hp,cause:'pickup'});
        }else this.buffs[player.id]=mergePickup(this.buffs[player.id],site.kind,now);
        site.availableAt=now+PICKUP_TUNING.respawnMs;
        const dud=faulty?{faulty:true as const}:{};
        this.pickupEvents.push({kind:'collected',pickupId:id,pickup:site.kind,playerId:player.id,...dud});
        this.impacts.push({p:{...site.p},n:{x:0,y:1,z:0},surface:false,scale:1.4,audioOnly:true});
        const effectUntil=faulty?this.buffs[player.id]?.faultyUntil:pickupEffectUntil(this.buffs[player.id],site.kind);
        const accepted={accepted:true as const,target:'pickup' as const,targetId:id,playerId:player.id,pickup:site.kind,
            ...(effectUntil===undefined?{}:{effectUntil}),...dud};
        this.recentPickupClaims.set(id,{playerId:player.id,generation,at:now,pickup:site.kind,...(effectUntil===undefined?{}:{effectUntil}),...dud});
        site.kind=this.fixtureSupplies?.find(p=>p.id===id)?.kind??siteKind(site.kind);
        return accepted;
    }
    /** Code Violation (Tyler, 1 October): a claimed supply comes out as its dud (`FAULTY_KINDS`) instead, told to the
     * whole city. Nothing about it can hurt: Backfire's throw only goes where its landing is safe (`safeShove`). */
    private faultyClaim(player:PlayerData,kind:FaultyKind,site:string,at:Vec3Data,now:number):void{
        this.buffs[player.id]=mergeFaulty(this.buffs[player.id],kind,now);
        let shoved=0;
        if(kind==='tommy-gun'){
            // The gun blows up in the paws: a bang and soot, and the rat thrown backwards off its feet.
            const {meshQx:x,meshQy:y,meshQz:z,meshQw:w}=player,backX=2*(x*z+w*y),backZ=1-2*(x*x+y*y);
            const back=Math.hypot(backX,backZ)>.1?Math.atan2(backX,backZ):Math.random()*Math.PI*2;
            if(this.safeShove(player,back,FAULTY_TUNING.backfireShove,FAULTY_TUNING.backfireLift,'backfire'))shoved=1;
            this.impacts.push({p:{x:player.x,y:player.y+1.2,z:player.z},n:{x:0,y:1,z:0},surface:false,scale:2.2,cue:'case-hit'});
        }else this.impacts.push({p:{...at},n:{x:0,y:1,z:0},surface:false,scale:1.8,cue:'armor-clang'});
        this.incidentEvents.push({kind:'malfunction',what:'faulty',site,p:{...at},playerId:player.id,pickup:kind,shoved});
        const {title,effect}=FAULTY_COPY[kind];
        this.tell(`CODE VIOLATION · ${player.name.toUpperCase()}: ${title}, ${effect.toUpperCase()}`);
    }
    private collectCase(player:PlayerData,now:number):PickupClaimResult {
        const c=this.primaryCase,p=c.body.position;
        if(c.owner||c.returningUntil||this.assignment?.closed||this.casesWeaponized||this.caseDangerous(c)||c.body.velocity.length()>T.casePickupMaxSpeed)
            return{accepted:false,target:'case',targetId:'primary',playerId:player.id,reason:'unavailable'};
        if(player.hp<=0||this.isCaseHolder(player.id)||(player.id===c.previousOwner&&now<c.pickupAfter))
            return{accepted:false,target:'case',targetId:'primary',playerId:player.id,reason:'ineligible'};
        const closest=this.interactionPoint(player,data(p),now),reach=new C.Vec3(player.x,player.y+.8,player.z);
        if(closest.distanceTo(p)>T.pickupRadius)return{accepted:false,target:'case',targetId:'primary',playerId:player.id,reason:'too-far'};
        if(this.ray(closest,p,1).hasHit||this.ray(reach,p,1).hasHit)return{accepted:false,target:'case',targetId:'primary',playerId:player.id,reason:'blocked'};
        c.owner=player.id;c.grip=0;this.primaryAcquiredAt=now;this.carry(player,c);this.checkAssignmentLocation(c);
        if(c.owner===player.id){this.tell('This rat is on the case · '+player.name);return{accepted:true,target:'case',targetId:'primary',playerId:player.id};}
        return{accepted:false,target:'case',targetId:'primary',playerId:player.id,reason:'ineligible'};
    }
    claimInteraction(playerId:string,target:PickupTarget,targetId:string,generation:number,now:number):PickupClaimResult {
        const player=this.players.get(playerId);
        if(!player)return{accepted:false,target,targetId,playerId,reason:'ineligible'};
        if(target==='case'){
            if(targetId!=='primary')return{accepted:false,target,targetId,playerId,reason:'invalid-target'};
            if(generation!==this.primaryCase.pickupAfter)return{accepted:false,target,targetId,playerId,reason:'stale'};
            if(this.primaryCase.owner===playerId)return{accepted:true,target,targetId,playerId};
            return this.collectCase(player,now);
        }
        const site=this.pickups.get(targetId);
        if(!site)return{accepted:false,target,targetId,playerId,reason:'invalid-target'};
        if(generation!==site.availableAt){
            const recent=this.recentPickupClaims.get(targetId);
            if(recent&&recent.playerId===playerId&&recent.generation===generation&&now-recent.at<=500)
                return{accepted:true,target,targetId,playerId,pickup:recent.pickup,...(recent.effectUntil===undefined?{}:{effectUntil:recent.effectUntil}),...(recent.faulty?{faulty:true}:{})};
            return{accepted:false,target,targetId,playerId,reason:'stale'};
        }
        return this.collectPickup(targetId,site,player,now);
    }
    /** Claim one available pickup at a time. The claim is atomic inside the single
     * authoritative loop, so two rats reaching together can never both receive it. */
    private stepPickups(now:number,playing:boolean):void{
        for(const [id,entry] of Object.entries(this.buffs)){
            const player=this.players.get(id);
            if(!player||player.hp<=0||buffExpired(entry,now))delete this.buffs[id];
        }
        if(!playing)return;
        // Most rats are nowhere near a site. The claim point lies on the recent
        // approach segment ending at the rat, so anything farther than the claim
        // radius plus the longest segment is rejected as too far without building
        // the claim; acceptance and Code Violation's duds are unchanged.
        const farSquared=(PICKUP_TUNING.claimRadius+INTERACTION_SWEEP_DISTANCE+1)**2;
        for(const [id,site] of this.pickups){
            if(now<site.availableAt)continue;
            for(const player of this.players.values()){
                const dx=player.x-site.p.x,dy=player.y+.8-site.p.y,dz=player.z-site.p.z;
                if(dx*dx+dy*dy+dz*dz>farSquared)continue;
                if(this.collectPickup(id,site,player,now).accepted)break;
            }
        }
    }
    /** Drained once per authoritative step so the room can persist and broadcast. */
    drainPickupEvents():PickupEvent[]{
        if(!this.pickupEvents.length)return [];
        return this.pickupEvents.splice(0,this.pickupEvents.length);
    }
    /** Drop a restored incident this room's roster no longer runs, without
     * disturbing an in-flight incident that the current mode still owns. */
    enforceIncidentRoster():void{
        const roster=incidentRoster(this.evidenceMode,this.onlyIncidents);
        if(this.dispatch.incident&&!roster.some(incident=>incident.id===this.dispatch.incident))
            this.dispatch={phase:'ready',started:this.now,until:0,serial:this.dispatch.serial+1};
    }
    private scaleCase(scale:number,c=this.primaryCase){
        if(scale===c.scale)return;
        const ratio=scale/c.scale;
        for(let i=0;i<c.body.shapes.length;i++){
            const shape=c.body.shapes[i] as C.Box;
            shape.halfExtents.scale(ratio,shape.halfExtents);
            shape.updateConvexPolyhedronRepresentation();shape.updateBoundingSphereRadius();
            c.body.shapeOffsets[i].scale(ratio,c.body.shapeOffsets[i]);
        }
        c.scale=scale;c.body.updateBoundingRadius();
        c.body.updateMassProperties();c.body.updateAABB();
    }
    private placeCaseAtSpawn(c=this.primaryCase,awayFrom?:Vec3Data){
        this.rayQuery.refresh();
        const walls=[...this.targets].filter(([,target])=>target.kind==='world');
        for(const [body] of walls)body.updateAABB();
        const clear=CASE_SPAWNS.filter(p=>{
            if(awayFrom){
                if(Math.hypot(p.x-awayFrom.x,p.z-awayFrom.z)<30)return false;
                // A fresh scramble starts outside every landmark, including the
                // new target, with room for the case's full loose shape.
                if(Object.values(ASSIGNMENT_DESTINATIONS).some(({bounds:b})=>p.y>=b.ymin-2&&p.y<b.ymax+2&&p.x>b.xmin-4&&p.x<b.xmax+4&&p.z>b.zmin-4&&p.z<b.zmax+4))return false;
            }
            // Probe from the authored rest height so sewer sites are not rejected
            // by street-level empty air.
            const y=p.y??1.3;
            for(const x of [-.95,0,.95])for(const z of [-.5,0,.5]){
                const floor=this.ray(new C.Vec3(p.x+x,y+.2,p.z+z),new C.Vec3(p.x+x,y-1.8,p.z+z),1);
                if(!floor.hasHit)return false;
            }
            return !walls.some(([body])=>{
                const {lowerBound:a,upperBound:b}=body.aabb;
                return b.y>y-.35&&a.y<y+.65&&b.x>p.x-.95&&a.x<p.x+.95&&b.z>p.z-.5&&a.z<p.z+.5;
            });
        });
        const separated=clear.filter(p=>![...this.cases.values()].some(other=>other!==c&&Math.hypot(other.body.position.x-p.x,other.body.position.z-p.z)<10));
        let available=separated.length?separated:clear;
        if(awayFrom){
            const unoccupied=available.filter(p=>![...this.players.values()].some(r=>r.hp>0&&Math.hypot(r.x-p.x,r.y-p.y,r.z-p.z)<10));
            if(unoccupied.length)available=unoccupied;
        }
        const candidates=available.filter(p=>p.x!==c.lastSpawn.x||p.z!==c.lastSpawn.z);
        const pool=candidates.length?candidates:available;
        const spawn=pool.length?pool[Math.floor(Math.random()*pool.length)]:CASE_HOME;
        c.lastSpawn=spawn;c.body.position.copy(vec(spawn));c.body.updateAABB();
    }
    private addControl(d:{x:number;y:number;z:number;w:number;h:number;d:number},kind:Target['kind'],machineId?:string){
        const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(d.w/2,d.h/2,d.d/2)),position:new C.Vec3(d.x,d.y,d.z)});
        addCityBody(this.world,body);this.targets.set(body,{kind,machineId});
    }
    /** True for the second after a machine fires, while it cannot fill again. */
    private pressureCooling(machineId:string):boolean {
        return this.now<(this.pressure.fired?.[machineId]??-Infinity)+PRESSURE_TUNING.cooldownMs;
    }
    /** Add pressure (seconds of standing) to a machine. Full, it hangs for
     * `blowMs` before firing; a trigger hit during that hang makes it an overpressure. */
    private addPressure(machineId:string,amount:number,hit=false){
        const blowing=this.pressure.blowing?.[machineId];
        if(blowing!==undefined){if(hit)(this.pressure.boosts??={})[machineId]=blowing;return;}
        if(this.pressureCooling(machineId)||!(amount>0))return;
        const level=Math.min(PRESSURE_TUNING.full,(this.pressure.levels[machineId]??0)+amount);
        this.pressure.levels[machineId]=level;
        if(level>=PRESSURE_TUNING.full)(this.pressure.blowing??={})[machineId]=this.now+PRESSURE_TUNING.blowMs;
    }
    /** Each step: full machines blow when their hang ends, and every living rat on a pad adds pressure. */
    private stepPressure(dt:number,now:number,playing:boolean){
        for(const machine of LAUNCH_MACHINES){
            const at=this.pressure.blowing?.[machine.id];
            if(at!==undefined){
                if(now>=at){delete this.pressure.blowing![machine.id];this.firePressure(machine,at);}
                continue;
            }
            if(!playing)continue;
            const pad=machine.pad;
            let riders=0;
            for(const player of this.players.values())if(player.hp>0&&Math.abs(player.y-pad.y)<2&&Math.hypot(player.x-pad.x,player.z-pad.z)<=pad.radius)riders++;
            let fill=riders;
            // Pressure Surge: every machine fills itself, faster as the incident goes on.
            if(this.incidentActive('pressure-surge'))fill+=2*(1+Math.min(1,Math.max(0,now-this.dispatch.started)/T.activeMs));
            if(fill)this.addPressure(machine.id,fill*dt);
        }
        if(this.pressure.blowing&&!Object.keys(this.pressure.blowing).length)delete this.pressure.blowing;
    }
    /** Pressure Surge: street launchers open beside rats and erupt, pads suck rats in,
     * and in the last moments every machine and a launcher under every rat blow at once. */
    private stepSurge(now:number,playing:boolean){
        if(this.pressure.vents){
            for(const vent of this.pressure.vents){
                if(!this.pendingVents.has(vent.id)||now<vent.at)continue;
                this.pendingVents.delete(vent.id);
                this.throwFrom({kind:'geyser',pad:{x:vent.x,y:vent.y,z:vent.z,radius:SURGE.radius}},!!vent.boost,undefined,vent.id);
            }
            this.pressure.vents=this.pressure.vents.filter(vent=>now<vent.at+SURGE.keepMs);
            if(!this.pressure.vents.length)delete this.pressure.vents;
        }
        if(!playing||!this.incidentActive('pressure-surge'))return;
        const d=this.dispatch,s=this.surge;
        if(s.serial!==d.serial){s.serial=d.serial;s.nextWave=now+600;s.nextSuction=now;}
        const streetRats=[...this.players.values()].filter(p=>p.hp>0&&Math.abs(p.y)<1.2);
        if(now>=d.until-SURGE.finaleMs&&s.finale!==d.serial){
            s.finale=d.serial;
            for(const machine of LAUNCH_MACHINES){
                // A machine already hanging keeps its firing time, now as an overpressure.
                const hanging=this.pressure.blowing?.[machine.id];
                if(hanging!==undefined){(this.pressure.boosts??={})[machine.id]=hanging;continue;}
                const at=now+PRESSURE_TUNING.blowMs;
                this.pressure.levels[machine.id]=PRESSURE_TUNING.full;
                (this.pressure.blowing??={})[machine.id]=at;(this.pressure.boosts??={})[machine.id]=at;
            }
            for(const rat of streetRats)this.openVent(rat.x,rat.z,now+600,true);
            return;
        }
        if(now>=s.nextWave){
            s.nextWave=now+SURGE.every;
            const targets=[...streetRats].sort(()=>Math.random()-.5).slice(0,SURGE.count-1);
            for(const rat of targets){const a=Math.random()*Math.PI*2,r=1.5+Math.random()*5.5;this.openVent(rat.x+Math.sin(a)*r,rat.z+Math.cos(a)*r,now+SURGE.warnMs,false);}
            const spot=this.streetPoints[Math.floor(Math.random()*this.streetPoints.length)];
            if(spot)this.openVent(spot.x,spot.z,now+SURGE.warnMs,false);
        }
        if(now>=s.nextSuction){
            s.nextSuction=now+SURGE.suctionEvery;
            const pull=(p:Vec3Data,pad:LaunchMachine['pad'])=>{
                const dx=pad.x-p.x,dz=pad.z-p.z,d=Math.hypot(dx,dz);
                return d>pad.radius-.5&&d<SURGE.suctionRange&&Math.abs(p.y-pad.y)<2?{x:dx/d,z:dz/d}:null;
            };
            for(const machine of LAUNCH_MACHINES){
                for(const player of this.players.values()){
                    if(player.hp<=0||this.flights.has(player.id))continue;
                    const toward=pull(player,machine.pad);if(!toward)continue;
                    this.shove(player.id,{x:toward.x*SURGE.suction,y:SURGE.suctionLift,z:toward.z*SURGE.suction},'pull');
                }
                for(const body of [...[...this.cases.values()].filter(c=>!c.owner&&!c.armed&&c.body.type===C.Body.DYNAMIC).map(c=>c.body),...[...this.corpses.values()].map(c=>c.body)]){
                    const toward=pull(body.position,machine.pad);if(!toward)continue;
                    body.velocity.x+=toward.x*6;body.velocity.z+=toward.z*6;body.velocity.y+=2;body.wakeUp();
                }
            }
        }
    }
    /** Open a street launcher at (x,z) if it is open street under the sky, erupting at `at`. */
    private openVent(x:number,z:number,at:number,boost:boolean){
        if((this.pressure.vents?.length??0)>=SURGE.maxVents)return;
        if(!Number.isFinite(x+z)||x<CITY_BOUNDS.min+4||x>CITY_BOUNDS.max-4||z<CITY_BOUNDS.min+4||z>CITY_BOUNDS.max-4)return;
        if(LAUNCH_MACHINES.some(m=>Math.hypot(x-m.pad.x,z-m.pad.z)<m.pad.radius+2||Math.hypot(x-m.box.x,z-m.box.z)<3))return;
        // Open sky above and street below: the first thing straight down is the pavement.
        const down=this.ray(new C.Vec3(x,60,z),new C.Vec3(x,-3,z),1);
        if(!down.hasHit||Math.abs(down.hitPointWorld.y)>.6)return;
        const id=`vent-${this.surge.serial}-${this.surge.vents++}`;
        (this.pressure.vents??=[]).push({id,x,y:down.hitPointWorld.y,z,at,...(boost?{boost:true as const}:{})});
        this.pendingVents.add(id);
    }
    /** `at` is the scheduled firing time (clients key the firing and misfire look to it), not the step time. */
    private firePressure(machine:LaunchMachine,at:number){
        // Fire even when empty: occupants alone receive impulses. Pressure resets,
        // and the cooldown runs from the firing.
        this.pressure.serial++;
        delete this.pressure.levels[machine.id];
        (this.pressure.fired??={})[machine.id]=at;
        // An overpressure was earned by a hit during the hang; every rider of it goes high.
        const boost=this.pressure.boosts?.[machine.id]===at;
        if(!boost&&this.pressure.boosts){delete this.pressure.boosts[machine.id];if(!Object.keys(this.pressure.boosts).length)delete this.pressure.boosts;}
        this.throwFrom(machine,boost,machine.id);
        // Code Violation: the faulty blast also throws everyone standing around the pad.
        if(this.incidentActive('code-violation'))
            this.incidentEvents.push({kind:'malfunction',what:'machine',site:machine.id,p:{...machine.pad},shoved:this.blast(machine.pad,I.violationFling,machine.pad.radius,'misfire')});
    }
    /** Throw everything loose on a pad (or over a street launcher): rats, evidence,
     * bodies and cheese. A carried
     * case needs no handling, because carry() pins it to its rat every tick.
     * `machineId` names the machine in launch events; street launchers have none. */
    private throwFrom(source:ThrowSource,boost:boolean,machineId?:string,ventId?:string){
        const pad=source.pad,flightId=machineId??ventId??`vent-${this.pressure.serial}`;
        const onPad=(p:Vec3Data)=>Math.abs(p.y-pad.y)<2&&Math.hypot(p.x-pad.x,p.z-pad.z)<=pad.radius;
        const nearby=[...this.players.values()].filter(p=>p.hp>0&&onPad(p));
        const caseRiders=[...this.cases.values()].filter(c=>!c.owner&&!c.returningUntil&&!c.armed&&onPad(c.body.position));
        for(const c of caseRiders)this.launchCase(c,source,boost);
        for(const corpse of this.corpses.values()){
            const body=corpse.body;
            if(!onPad(body.position))continue;
            // Bodies barely damp, so they get a shorter lift for a similar arc, and a wild tumble.
            const v=launcherVelocity(source,boost);
            body.velocity.set(v.x,v.y*.8,v.z);
            body.angularVelocity.set((Math.random()*2-1)*14,(Math.random()*2-1)*9,(Math.random()*2-1)*14);
            body.wakeUp();
        }
        for(const shot of this.shots){
            if(!onPad(shot.p))continue;
            const v=launcherVelocity(source,boost);
            shot.v={x:v.x*.8,y:v.y*.6,z:v.z*.8};
        }
        // Keep other stations' outstanding events. A rat can only occupy one pad,
        // and its newest impulse replaces an older event if launched again.
        const selected=new Set(nearby.map(p=>p.id));
        for(const player of nearby){
            this.flights.set(player.id,{machineId:flightId,at:this.now,peak:player.y});
            this.thrownUntil.set(player.id,this.now+20000);
        }
        this.pressure.launches=[...this.pressure.launches.filter(e=>!selected.has(e.playerId)),
            ...nearby.map(player=>({id:`launch-${flightId}-${this.pressure.serial}-${player.id}`,...(machineId?{machineId}:{}),
                playerId:player.id,at:this.now,velocity:launcherVelocity(source,boost),...(boost?{boost:true as const}:{})}))].slice(-MAX_LAUNCH_EVENTS);
    }
    /** A launched rat lands once it has come down from its peak onto something solid. */
    private stepFlights(now:number,playing:boolean){
        for(const [id,until] of this.thrownUntil)if(until<now)this.thrownUntil.delete(id);
        for(const [id,flight] of this.flights){
            const player=this.players.get(id);
            if(!player||player.hp<=0||now-flight.at>20000){this.flights.delete(id);this.thrownUntil.delete(id);continue;}
            flight.peak=Math.max(flight.peak,player.y);
            const drop=flight.peak-player.y;
            if(now-flight.at<600||drop<LANDING_SHOCKWAVE.minDrop)continue;
            const feet=new C.Vec3(player.x,player.y+.5,player.z);
            if(!this.ray(feet,new C.Vec3(player.x,player.y-.7,player.z),1).hasHit)continue;
            this.flights.delete(id);this.thrownUntil.set(id,now+1500);
            this.landingShockwave(player,flight.machineId,drop,playing,now-flight.at);
        }
    }
    /** Shove everything nearby away from the landing, squash anyone underneath, and
     * fire another machine whose pad the rat came down on. */
    private landingShockwave(lander:PlayerData,machineId:string,drop:number,playing:boolean,airMs:number){
        const W=LANDING_SHOCKWAVE,p={x:lander.x,y:lander.y,z:lander.z};
        const speed=Math.sqrt(2*25*drop);
        this.impacts.push({p:{...p},n:{x:0,y:1,z:0},surface:false,audioOnly:true,foley:'launch-landing',energy:Math.min(300,speed)});
        const away=(q:Vec3Data)=>{
            const dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);
            if(d>W.radius||Math.abs(q.y-p.y)>3)return null;
            const angle=d>.05?Math.atan2(dx,dz):Math.random()*Math.PI*2,strength=W.shove[0]+(W.shove[1]-W.shove[0])*(1-d/W.radius);
            return {d,x:Math.sin(angle)*strength,y:W.lift,z:Math.cos(angle)*strength};
        };
        for(const player of this.players.values()){
            if(player.id===lander.id||player.hp<=0)continue;
            const push=away(player);if(!push)continue;
            if(playing&&push.d<W.squash)this.hit({owner:lander.id,victim:player.id,damage:1,incoming:{x:0,y:-speed,z:0},squashAirMs:Math.round(airMs)});
            this.shove(player.id,{x:push.x,y:push.y,z:push.z});
        }
        for(const c of this.cases.values()){
            if(c.owner||c.armed||c.body.type!==C.Body.DYNAMIC)continue;
            const push=away(c.body.position);if(!push)continue;
            c.body.velocity.vadd(new C.Vec3(push.x,push.y,push.z),c.body.velocity);c.body.wakeUp();
        }
        for(const corpse of this.corpses.values()){
            const push=away(corpse.body.position);if(!push)continue;
            corpse.body.velocity.vadd(new C.Vec3(push.x,push.y,push.z),corpse.body.velocity);corpse.body.wakeUp();
        }
        for(const shot of this.shots){
            const push=away(shot.p);if(!push)continue;
            shot.v={x:shot.v.x+push.x,y:shot.v.y+push.y,z:shot.v.z+push.z};
        }
        const pad=LAUNCH_MACHINES.find(m=>m.id!==machineId&&Math.hypot(p.x-m.pad.x,p.z-m.pad.z)<=m.pad.radius&&Math.abs(p.y-m.pad.y)<2);
        // Coming down on another machine's pad fills it to bursting.
        if(pad&&playing)this.addPressure(pad.id,PRESSURE_TUNING.full);
    }
    /** Knock a living rat away (`velocity` u/s, added once to its body like a landing shockwave's knockback).
     * Every rat's own body applies the shove event, a human's in RatController and a bot's in its controller,
     * so it is the same for both; the server widens movement checks for 3 s. Shoves on one rat within a step
     * add up into one event (horizontal sum up to `shoveMax`, the highest lift), kept inside the city like an incident throw. */
    shove(playerId:string,velocity:Vec3Data,kind='shove'):boolean{
        const player=this.players.get(playerId);
        if(!player||player.hp<=0)return false;
        const shoves=this.pressure.shoves??=[],id=`${kind}-${this.tick}-${playerId}`;
        const same=shoves.find(e=>e.id===id),sum=same?{x:same.velocity.x+velocity.x,y:Math.max(same.velocity.y,velocity.y),z:same.velocity.z+velocity.z}:velocity;
        const flat=Math.hypot(sum.x,sum.z),scale=flat>I.shoveMax?I.shoveMax/flat:1;
        const v=boundedIncidentVelocity(player,{x:sum.x*scale,y:sum.y,z:sum.z*scale});
        if(same)same.velocity=v;
        else{shoves.push({id,playerId,at:this.now,velocity:v});if(shoves.length>MAX_LAUNCH_EVENTS)shoves.splice(0,shoves.length-MAX_LAUNCH_EVENTS);}
        this.thrownUntil.set(playerId,Math.max(this.thrownUntil.get(playerId)??0,this.now+3000));
        return true;
    }
    private tell(text:string){this.notice={serial:this.notice.serial+1,text};}
    /** Most Wanted and Code Violation act on rats, supplies and machines each step. */
    private stepIncidentEffects(now:number,playing:boolean):void{
        const d=this.dispatch;
        if(this.incidentActive('most-wanted')){
            // The searchlight follows whoever is winning, looked at again every `wantedEveryMs`, and at once
            // when the wanted rat falls (the light swings to the next living leader).
            const wanted=d.wanted?this.players.get(d.wanted):undefined;
            if(!wanted||wanted.hp<=0||now>=this.wantedAt){
                this.wantedAt=now+I.wantedEveryMs;
                const next=this.leader(d.wanted);
                if(next!==d.wanted){
                    this.dispatch={...d,...(next?{wanted:next}:{})};if(!next)delete this.dispatch.wanted;
                    const target=next?this.players.get(next):undefined;
                    if(target)this.tell(`MOST WANTED: ${target.name.toUpperCase()} · BOUNTY: ONE SUPPLY`);
                }
            }
        }else if(d.wanted!==undefined||d.bounty!==undefined){this.dispatch={...d};delete this.dispatch.wanted;delete this.dispatch.bounty;this.wantedAt=0;}
        this.stepCodeViolation(now,playing);
    }
    /** Whoever is winning among living rats (assignment progress, then kills); Most Wanted's target.
     * `current` keeps the light on a tie, so it only moves when the lead really changes. `living: false` counts the dead too. */
    private leader(current?:string,living=true):string|undefined{
        const a=this.assignment?.state;
        const progress=(id:string)=>{
            if(!a)return 0;
            switch(a.id){
                case 'chain-of-custody':return a.deliveries[id]??0;
                case 'jurisdiction':return a.jurisdiction?.heldMs[id]??0;
                case 'excessive-force':return a.caseKills[id]??0;
            }
        };
        let best:PlayerData|undefined,bestScore=-1;
        for(const player of this.players.values()){
            if(living&&player.hp<=0)continue;
            const score=progress(player.id)*1000+player.kills;
            if(score>bestScore||(score===bestScore&&best&&best.id!==current&&(player.id===current||player.id<best.id))){best=player;bestScore=score;}
        }
        return best?.id;
    }
    /** The rat that would win if the round ended now, dead or alive (admin status). */
    get leaderId():string|undefined{return this.leader(undefined,false);}
    /** Admin end of round (docs/live-service.md): the current leader wins now by the mode's own method. */
    concede(now:number):AssignmentState['result']{
        const id=this.leader(undefined,false),player=id?this.players.get(id):undefined;
        if(!player||!this.assignment||this.assignment.closed)return undefined;
        this.assignment.award(player,now);return this.assignment.state.result;
    }
    /** Code Violation: every piece of city equipment misbehaves at once, and none of it can kill (Tyler, 1 October).
     * Supplies of every kind hop away from rats that come close (on their own supported floor near home; Quick Fix
     * scares sooner and hops further and faster) and walk home when it ends; each launch machine fills itself to bursting
     * now and then (`firePressure` flings the rats around it); alarm pillars beside rats clang and knock them over. */
    private stepCodeViolation(now:number,playing:boolean):void{
        const active=playing&&this.incidentActive('code-violation');
        for(const [id,home] of this.siteHomes){
            const site=this.pickups.get(id);if(!site)continue;
            if(!active){if(site.p.x!==home.x||site.p.z!==home.z)site.p={...home};continue;}
            if(now<site.availableAt||now<(this.siteHopAt.get(id)??0))continue;
            const fix=site.kind==='quick-fix';
            let nearest:PlayerData|undefined,distance:number=fix?I.violationFixScare:I.violationScare;
            for(const player of this.players.values()){
                if(player.hp<=0||Math.abs(player.y+.7-site.p.y)>2.5)continue;
                const d=Math.hypot(player.x-site.p.x,player.z-site.p.z);if(d<distance){distance=d;nearest=player;}
            }
            if(!nearest)continue;
            // Throttle the search whether or not a spot is found; the support check is not cheap.
            this.siteHopAt.set(id,now+(fix?I.violationFixHopMs:I.violationHopMs));
            const away=Math.atan2(site.p.z-nearest.z,site.p.x-nearest.x),hop=fix?I.violationFixHop:I.violationHop,leash=fix?I.violationFixLeash:I.violationLeash;
            for(const turn of [0,.6,-.6,1.2,-1.2,1.9,-1.9]){
                const angle=away+turn,next={x:site.p.x+Math.cos(angle)*hop,y:site.p.y,z:site.p.z+Math.sin(angle)*hop};
                if(Math.hypot(next.x-home.x,next.z-home.z)>leash||!this.supportedSpot(next))continue;
                site.p=next;break;
            }
        }
        if(!active){this.misfireAt.clear();this.clangAt=0;return;}
        const span=(range:readonly [number,number])=>range[0]+Math.random()*(range[1]-range[0]);
        for(const machine of LAUNCH_MACHINES){
            const at=this.misfireAt.get(machine.id);
            // The first misfire comes at a random point in the span, so the machines never fire in step.
            if(at===undefined){this.misfireAt.set(machine.id,now+Math.random()*span(I.violationMachineMs));continue;}
            if(now<at)continue;
            this.misfireAt.set(machine.id,now+span(I.violationMachineMs));
            if(this.pressure.blowing?.[machine.id]!==undefined||this.pressureCooling(machine.id))continue;
            // Full by itself: it hangs as a full machine does, and one in three blows as an overpressure.
            const blowAt=now+PRESSURE_TUNING.blowMs;
            this.pressure.levels[machine.id]=PRESSURE_TUNING.full;(this.pressure.blowing??={})[machine.id]=blowAt;
            if(Math.random()<1/3)(this.pressure.boosts??={})[machine.id]=blowAt;
        }
        if(!this.clangAt)this.clangAt=now+span(I.violationClangMs);
        if(now<this.clangAt)return;
        this.clangAt=now+span(I.violationClangMs);
        const near=DISPATCH_STATIONS.filter(s=>[...this.players.values()].some(p=>p.hp>0&&Math.abs(p.y-s.y)<3&&Math.hypot(p.x-s.x,p.z-s.z)<I.violationClang*2));
        const station=near[Math.floor(Math.random()*near.length)];
        if(!station)return;
        const bell={x:station.target.x,y:station.target.y,z:station.target.z};
        // The bell rattles and sparks (a busy-line clank on every client), and the blast knocks the rats around it over.
        this.sound('trigger-busy',bell);
        this.impacts.push({p:bell,n:{x:0,y:1,z:0},surface:false,scale:2.4,cue:'armor-clang'});
        this.incidentEvents.push({kind:'malfunction',what:'pillar',site:station.id,p:{x:station.x,y:station.y,z:station.z},shoved:this.blast(station,I.violationClang,0,'clang')});
    }
    /** Shove every living rat within `radius` of `at` (beyond `inner`, on its floor) away from it, harder nearer, along
     * the nearest safe line (`safeShove`). Returns how many went flying. */
    private blast(at:Vec3Data,radius:number,inner:number,kind:string):number{
        let shoved=0;
        for(const player of this.players.values()){
            if(player.hp<=0||Math.abs(player.y-at.y)>3)continue;
            const dx=player.x-at.x,dz=player.z-at.z,d=Math.hypot(dx,dz);
            if(d<=inner||d>radius)continue;
            const angle=d>.05?Math.atan2(dx,dz):Math.random()*Math.PI*2;
            if(this.safeShove(player,angle,I.violationShove*(1-.5*d/radius),I.violationLift,kind))shoved++;
        }
        return shoved;
    }
    /** Code Violation never kills (Tyler, 1 October: "no one should die from code violation"): its throws go out along
     * `angle` (radians from +z toward +x) only if every point out to where the rat could come down, falling from its
     * height plus `SAFE_SHOVE_MARGIN`, stays inside the city and off the harbour (piers included). Otherwise it turns to
     * the nearest safe line; with none it does not throw at all. */
    private safeShove(player:PlayerData,angle:number,speed:number,lift:number,kind:string):boolean{
        const g=-this.world.gravity.y,fall=Math.max(0,player.y+3);
        const reach=speed*(lift+Math.sqrt(lift*lift+2*g*fall))/g+SAFE_SHOVE_MARGIN,inset=CITY_BOUNDS.min+SAFE_SHOVE_MARGIN,outset=CITY_BOUNDS.max-SAFE_SHOVE_MARGIN;
        for(const turn of SAFE_SHOVE_TURNS){
            const sx=Math.sin(angle+turn),sz=Math.cos(angle+turn);
            let safe=true;
            for(let d=0;d<=reach&&safe;d+=1.5){
                const x=player.x+sx*d,z=player.z+sz*d;
                safe=x>inset&&x<outset&&z>inset&&z<outset&&!overWater(x,z);
            }
            if(safe)return this.shove(player.id,{x:sx*speed,y:lift,z:sz*speed},kind);
        }
        return false;
    }
    /** Code Violation malfunctions since the previous call (the city map). */
    drainIncidentEvents():IncidentEvent[]{return this.incidentEvents.length?this.incidentEvents.splice(0,this.incidentEvents.length):[];}
    /** The running Dispatch incident, if any. */
    get activeIncident():IncidentId|undefined {return this.dispatch.phase==='active'?incidentInfo(this.dispatch.incident).id:undefined;}
    private incidentActive(id:IncidentId){return this.dispatch.phase==='active'&&incidentInfo(this.dispatch.incident).id===id;}
    private activate(owner?:string|null){
        if(this.dispatch.phase!=='ready')return;
        const previous=this.dispatch.incident??(this.dispatch.serial>0?incidentInfo().id:undefined);
        const roster=incidentRoster(this.evidenceMode,this.onlyIncidents);
        // A forced practice roll may repeat; a normal roll keeps the no-repeat rule unless the roster has one incident
        // (a staging playtest's `INCIDENTS=crossfire`: the empty draw threw and Dispatch never rolled).
        const forced=this.forcedIncident&&roster.some(incident=>incident.id===this.forcedIncident)?this.forcedIncident:undefined;
        const fresh=roster.filter(incident=>incident.id!==previous),choices=fresh.length?fresh:roster;
        const incident=forced??choices[Math.floor(Math.random()*choices.length)]!.id;
        const caller=owner?this.players.get(owner):undefined;
        this.dispatch={phase:'rolling',started:this.now,until:this.now+T.rollMs,serial:this.dispatch.serial+1,incident,...(caller?{caller:caller.id}:{})};
        if(caller)this.rewardSupply(caller.id,'dispatch');
    }
    /** Admin: roll an incident now, `chosen` or the ordinary no-repeat draw, ending any incident under way. No caller, so no supply. */
    rollIncident(chosen?:IncidentId):IncidentId|undefined{
        const roster=incidentRoster(this.evidenceMode,this.onlyIncidents),previous=this.dispatch.incident??(this.dispatch.serial>0?incidentInfo().id:undefined);
        const fresh=roster.filter(incident=>chosen?incident.id===chosen:incident.id!==previous),pool=fresh.length||chosen?fresh:roster;
        if(!pool.length)return undefined;
        const incident=pool[Math.floor(Math.random()*pool.length)]!.id;
        this.dispatch={phase:'rolling',started:this.now,until:this.now+T.rollMs,serial:this.dispatch.serial+1,incident};
        return incident;
    }
    /** Admin: the incident rolling or under way ends now and Dispatch cools down as after any incident. */
    endIncident():boolean{
        const d=this.dispatch;
        if(d.phase!=='rolling'&&d.phase!=='active')return false;
        this.dispatch={phase:'cooldown',started:this.now,until:this.now+T.cooldownMs,serial:d.serial,...(d.incident?{incident:d.incident}:{})};
        return true;
    }
    /** A random supply on the spot through the ordinary claim effects: the Dispatch caller's reward
     * and each new kill streak title's. Quick Fix is only in the draw when it would heal. */
    rewardSupply(playerId:string,why:RewardReason):PickupKind|undefined{
        const player=this.players.get(playerId);
        if(!player||player.hp<=0)return undefined;
        const supplies=player.hp<MAX_HP?PICKUP_KINDS:PICKUP_KINDS.filter(kind=>kind!=='quick-fix');
        const supply=supplies[Math.floor(Math.random()*supplies.length)]!;
        if(supply==='quick-fix'){player.hp=MAX_HP;this.pickupEvents.push({kind:'healed',playerId:player.id,hp:MAX_HP,cause:'pickup'});}
        else this.buffs[player.id]=mergePickup(this.buffs[player.id],supply,this.now);
        this.pickupEvents.push({kind:'rewarded',playerId:player.id,pickup:supply,why});
        return supply;
    }
    private reserveShots(count:number){
        while(this.shots.length>T.maxShots-count){
            const burst=this.shots.findIndex(s=>this.burstShots.has(s));
            const index=burst<0?0:burst,shot=this.shots[index];
            this.finishShot(shot,'capacity');this.shots.splice(index,1);
        }
    }
    private roomForShot(){
        this.reserveShots(1);return this.shots.length<T.maxShots;
    }
    private emitShot(owner:string,origin:Vec3Data,velocity:C.Vec3,id:string=crypto.randomUUID(),extra:Partial<ChaosShot>={}){
        if(!this.roomForShot())return undefined;
        const shot:ChaosShot={id,owner,p:{...origin},v:data(velocity),age:0,...extra};
        if(this.incidentActive('crossfire'))this.bankPaths.set(shot,{origin:{...origin},points:[],bounces:0});
        this.shots.push(shot);return shot;
    }
    /** The special weapon a rat holds now, if any. */
    weapon(playerId:string):WeaponKind|undefined{return heldWeapon(this.buffs,playerId,this.now);}
    /** Short Circuit (a Code Violation dud): this rat's gun does not fire for now. */
    shorted(playerId:string):boolean{return shortedOut(this.buffs,playerId,this.now);}
    shoot(owner:string,shot:ShotDescriptor):ChaosShot[]{
        if(!this.players.get(owner)||this.players.get(owner)!.hp<=0)return [];
        // A held special weapon replaces the incident's pattern. The Mousetrap is set down (`placeTrap`), never fired.
        const weapon=this.weapon(owner);
        if(weapon==='laser'){this.fireLaser(owner,shot);return [];}
        if(weapon==='mousetrap')return [];
        const incident=!weapon&&this.dispatch.phase==='active'?incidentInfo(this.dispatch.incident).id:undefined;
        let heat=0;
        if(weapon==='tommy-gun'){const last=this.tommyHeat.get(owner);heat=tommyHeat(last?.heat??0,last?.at,this.now);this.tommyHeat.set(owner,{heat,at:this.now});}
        const pattern=resolveShotPattern(shot,incident,weapon?{kind:weapon,heat}:undefined),fired:ChaosShot[]=[];
        this.reserveShots(pattern.length);
        for(const ball of pattern){
            const emitted=this.emitShot(owner,shot.origin,vec(ball.velocity),ball.id,ball.quirk?quirkBirth(ball.quirk,shot.direction):{});
            if(emitted){
                fired.push(emitted);this.shotTriggers.set(emitted.id,shot.shotId);if(incident==='scattershot')this.scatterShots.add(emitted);
                if(weapon)this.tommyBalls.add(emitted);
                if(shot.viewAt!==undefined&&Number.isFinite(shot.viewAt))this.shotViews.set(emitted.id,{trigger:shot.shotId,
                    viewAt:Math.max(this.now-NETPLAY_COMPENSATION_MS,Math.min(this.now,shot.viewAt)),untilAge:NETPLAY_COMPENSATION_MS/1000});
            }
        }
        return fired;
    }
    /** The Laser: an instant beam (`laserPath`) against the city and against rats rewound to what the shooter saw
     * (`viewAt`, at most `NETPLAY_COMPENSATION_MS` back). Walls and Ironclad coats reflect it; whatever stops it takes
     * the hit through the same paths as a ball (damage, kill credit, shot results). */
    private fireLaser(owner:string,shot:ShotDescriptor):void{
        const viewAt=shot.viewAt!==undefined&&Number.isFinite(shot.viewAt)?Math.max(this.now-NETPLAY_COMPENSATION_MS,Math.min(this.now,shot.viewAt)):undefined;
        const accept=(body:C.Body)=>{
            const target=this.targets.get(body);
            return target?.kind!=='rat'&&!(target?.kind==='case'&&this.cases.get(target.caseId??'primary')?.owner===owner)&&
                !(target?.kind==='trap'&&this.traps.get(target.trapId??'')?.state.owner===owner);
        };
        let last:{target?:Target;hit:C.RaycastResult;compensated:boolean;rewindMs:number;targetDelta:number}|undefined;
        const cast=(from:C.Vec3,to:C.Vec3):LaserCast|undefined=>{
            const solid=this.rayQuery.sphere(from,to,W.laserRadius,1|2|4|8,accept),rat=this.laserRat(from,to,owner,viewAt);
            const useRat=!!rat&&(!solid.hasHit||rat.hit.distance<solid.distance);
            const hit=useRat?rat!.hit:solid;
            if(!hit.hasHit){last=undefined;return undefined;}
            const target=useRat?rat!.target:hit.body?this.targets.get(hit.body):undefined;
            last={target,hit,compensated:useRat&&rat!.compensated,rewindMs:useRat?rat!.rewindMs:0,targetDelta:useRat?rat!.targetDelta:0};
            const on=target?.kind==='rat'?useRat&&rat!.ironclad?'armor':hit.shape===target.head?'head':'rat'
                :target?.kind==='trap'?'trap':target?.kind==='case'?'case':target?.kind==='dispatch'||target?.kind==='pressure'?'trigger':target?.kind==='corpse'?'corpse':'world';
            return{distance:hit.distance,point:data(hit.hitPointWorld),normal:data(hit.hitNormalWorld),on};
        };
        const points=laserPath(shot.origin,shot.direction,cast),end=points[points.length-1]!;
        this.beams.push({id:shot.shotId,owner,at:this.now,points});
        if(this.beams.length>MAX_BEAMS)this.beams.splice(0,this.beams.length-MAX_BEAMS);
        const result=(outcome:ShotResultOutcome,extra:Partial<ShotResultEvent>={})=>{
            this.shotEvents.push({owner,shotId:shot.shotId,ballId:shot.shotId,outcome,at:this.now,tick:this.tick,epoch:this.epoch,...extra});
            if(this.shotEvents.length>512)this.shotEvents.splice(0,this.shotEvents.length-512);
        };
        const hit=last,target=hit?.target;
        if(!hit||!end.on||end.on==='world'||end.on==='armor'){result('lifetime',{end:{x:end.x,y:end.y,z:end.z}});return;}
        const point=data(hit.hit.hitPointWorld),normal=data(hit.hit.hitNormalWorld);
        const from=points[points.length-2]!,incoming=new C.Vec3(end.x-from.x,end.y-from.y,end.z-from.z);incoming.normalize();incoming.scale(BALL_SPEED,incoming);
        if(target?.kind==='rat'&&target.player){
            const headshot=end.on==='head',damage=headshot?MAX_HP:Math.min(MAX_HP,W.laserDamage*this.carrierPower(owner));
            const reflections=points.slice(1,-1).filter(p=>p.on==='world').length;
            this.hit({owner,victim:target.player.id,damage,incoming:data(incoming),shotId:shot.shotId,ballId:shot.shotId,point,normal,compensated:hit.compensated,weapon:'laser',...(headshot?{headshot:true as const}:{}),...(reflections?{reflections}:{})});
            result(headshot?'rat-head':'rat-body',{victimId:target.player.id,damage,point,normal,compensated:hit.compensated,...(viewAt===undefined?{}:{rewindMs:hit.rewindMs,targetDelta:hit.targetDelta})});
            return;
        }
        if(target?.kind==='trap'&&target.trapId){this.damageTrap(target.trapId,W.laserTrapHits,owner);result('trap-contact',{point,normal});return;}
        if(target?.kind==='case'){
            const c=this.cases.get(target.caseId??'primary');
            if(c)this.shootCase(c,incoming,shot.shotId,owner);
            result('case-contact',{point,normal});return;
        }
        if(target?.kind==='corpse'&&target.corpseId){this.kickCorpse(target.corpseId,incoming,owner,point,normal);result('lifetime',{end:point});return;}
        if(target?.kind==='dispatch'){this.sound(this.dispatch.phase==='ready'?'trigger':'trigger-busy',point,normal);this.activate(owner);result('dispatch-contact',{point,normal});return;}
        if(target?.kind==='pressure'&&target.machineId){
            this.sound(this.pressureCooling(target.machineId)?'trigger-busy':'trigger',point,normal);
            this.addPressure(target.machineId,PRESSURE_TUNING.hit,true);result('pressure-contact',{point,normal});return;
        }
        result('lifetime',{end:point});
    }
    /** The nearest living rat (never the shooter) on a laser leg, each rewound to `viewAt` when its history covers it. */
    private laserRat(from:C.Vec3,to:C.Vec3,owner:string,viewAt:number|undefined):RatContact|undefined{
        let best:RatContact|undefined;
        for(const [id,body] of this.rats){
            if(id===owner)continue;
            const target=this.targets.get(body);if(!target?.player||target.player.hp<=0)continue;
            const historic=viewAt===undefined?undefined:this.historicRat(id,viewAt),original=body.position.clone();
            if(historic)body.position.set(historic.p.x,historic.p.y,historic.p.z);
            const hit=sweepSphereBody(from,to,W.laserRadius,body);
            if(historic)body.position.copy(original);
            if(hit.hasHit&&(!best||hit.distance<best.hit.distance))best={hit,target,compensated:!!historic,ironclad:historic?.ironclad??hasIronclad(this.buffs,id,this.now),
                rewindMs:historic?Math.max(0,this.now-viewAt!):0,targetDelta:historic?Math.hypot(original.x-historic.p.x,original.y-historic.p.y,original.z-historic.p.z):0};
        }
        return best;
    }
    /** A ball or beam on a case: Evidence Tampering launches it as a missile; otherwise a loose case (or a carried
     * one whose grip this hit breaks) is knocked away along `incoming`. */
    private shootCase(c:CaseRuntime,incoming:Vec3Data,ballId:string,owner:string|null):void{
        if(this.incidentActive('evidence-tampering')){
            if(c.owner)this.releaseCase(c);
            this.launchCaseMissile(c,vec(incoming));
            c.missileOwner=owner??undefined;
        }else if(!c.owner||this.loosensGrip(c,ballId,this.now)){
            // A held grip just jolts the case in the carrier's hand; the ball bounces off.
            this.releaseCase(c);
            const kick=vec(incoming);kick.normalize();kick.scale(T.caseShotKick,kick);
            c.body.velocity.vadd(kick,c.body.velocity);
            c.body.velocity.y=Math.max(c.body.velocity.y,T.caseShotLift);
            const speed=c.body.velocity.length();
            if(speed>T.caseShotMaxSpeed)c.body.velocity.scale(T.caseShotMaxSpeed/speed,c.body.velocity);
            c.body.angularVelocity.set(kick.z*.45,6,-kick.x*.45);
            c.body.wakeUp();c.looseSince=this.now;
        }
    }
    /** A ball or beam kicks a corpse along `incoming`; re-shooting redirects the missile and transfers its damage credit. */
    private kickCorpse(id:string,incoming:Vec3Data,owner:string|null,point:Vec3Data,normal:Vec3Data):void{
        const corpse=this.corpses.get(id);if(!corpse)return;
        const kick=vec(incoming);kick.normalize();kick.scale(T.corpseShotKick,kick);
        corpse.body.velocity.vadd(kick,corpse.body.velocity);corpse.body.velocity.y+=3;
        corpse.state.owner=owner;corpse.body.wakeUp();
        this.sound('corpse-kick',point,normal);
        corpse.body.angularVelocity.x+=kick.z*.3;corpse.body.angularVelocity.z-=kick.x*.3;
    }
    /** Immediate authoritative short throw; only invalid ownership/input refuses. */
    placeTrap(owner:string,direction:Vec3Data,origin?:Vec3Data,shotId?:string):boolean{
        const rat=this.players.get(owner);
        if(!rat||rat.hp<=0||this.weapon(owner)!=='mousetrap')return false;
        const start=data(origin??{x:rat.x,y:rat.y+1.3,z:rat.z});
        if(![rat.x,rat.y,rat.z,start.x,start.y,start.z,direction.x,direction.y,direction.z].every(Number.isFinite)||Math.hypot(direction.x,direction.y,direction.z)<.001||outsideCity(rat.x,rat.z))return false;
        // A legal rat at the edge may have its paw just outside it: clip launch, never consume without a board.
        start.x=Math.max(CITY_BOUNDS.min,Math.min(CITY_BOUNDS.max,start.x));start.z=Math.max(CITY_BOUNDS.min,Math.min(CITY_BOUNDS.max,start.z));
        for(const [id,trap] of this.traps)if(trap.state.owner===owner)this.removeTrap(id);
        if(this.traps.size>=MAX_TRAPS)this.removeTrap(this.traps.keys().next().value!);
        const entry=this.buffs[owner]!;delete entry.weapon;delete entry.weaponUntil;delete entry.weaponReadyAt;
        const id=`trap-${++this.trapSerial}`;
        this.addTrap({id,owner,x:start.x,y:start.y,z:start.z,yaw:Math.atan2(direction.x,direction.z),hp:W.trapHp,at:this.now,flightAge:0,flight:trapLaunch(direction),...(shotId?{shotId}:{})});
        this.pickupEvents.push({kind:'trap',what:'launch',trapId:id,playerId:owner,p:data(start)});
        return true;
    }
    /** A trap and its shootable block, for balls and beams only: rats walk onto it (and are held), cases and corpses pass. */
    private addTrap(state:TrapState):void{
        state={...state,...(state.flight?{flight:data(state.flight)}:{})};
        const body=new C.Body({mass:0,type:C.Body.STATIC,shape:new C.Box(new C.Vec3(.75*TRAP_SCALE+.05,.3*TRAP_TALL,W.trapRadius)),position:new C.Vec3(state.x,state.y+.3*TRAP_TALL,state.z),
            collisionFilterGroup:4,collisionFilterMask:16});
        body.quaternion.setFromAxisAngle(new C.Vec3(0,1,0),state.yaw);
        this.world.addBody(body);this.targets.set(body,{kind:'trap',trapId:state.id});this.traps.set(state.id,{state,body});
    }
    /** `hits` ball hits on a trap; at none left it breaks, credited to `by`. */
    private damageTrap(id:string,hits:number,by:string|null):void{
        const trap=this.traps.get(id);if(!trap||trap.state.brokenAt!==undefined)return;
        trap.state.hp=Math.max(0,trap.state.hp-hits);trap.state.hitAt=this.now;
        if(trap.state.hp>0)return;
        trap.state.brokenAt=this.now;this.world.removeBody(trap.body);this.targets.delete(trap.body);this.freeTrapped(trap);
        this.pickupEvents.push({kind:'trap',what:'break',trapId:id,playerId:trap.state.owner,p:{x:trap.state.x,y:trap.state.y,z:trap.state.z},by,hits:W.trapHp});
    }
    private removeTrap(id:string):void{
        const trap=this.traps.get(id);if(!trap)return;
        if(trap.state.brokenAt===undefined){this.world.removeBody(trap.body);this.targets.delete(trap.body);this.freeTrapped(trap);}
        this.traps.delete(id);
    }
    /** A trap that breaks or goes lets go of the rat it holds at once. */
    private freeTrapped(trap:{state:TrapState;held?:string}):void{
        const entry=trap.held===undefined?undefined:this.buffs[trap.held];
        if(entry&&(entry.trappedUntil??0)>this.now)delete entry.trappedUntil;
        trap.held=undefined;
    }
    /** Each step: a broken trap leaves after `trapBrokenMs`; an armed one snaps on any other living rat whose feet
     * reach it (Ironclad does not help) and holds it in place for `trapHoldMs` (no damage, no kill); it re-arms
     * `trapRearmMs` after letting go, and leaves the rat it held alone until that rat has stepped clear. */
    private stepTraps(now:number,playing:boolean,dt:number):void{
        let moved=false;
        const reach=W.trapRadius+W.trapFoot;
        const within=(rat:PlayerData,s:TrapState)=>{const dx=rat.x-s.x,dz=rat.z-s.z;return rat.hp>0&&Math.abs(rat.y-s.y)<=W.trapHeight&&dx*dx+dz*dz<=reach*reach;};
        for(const [id,trap] of this.traps){
            const s=trap.state;
            if(s.brokenAt!==undefined){if(now-s.brokenAt>=W.trapBrokenMs)this.traps.delete(id);continue;}
            if(s.flight){
                if(!playing)continue;
                moved=true;
                // Sweep the board's contact thickness against city geometry only. No rat pushing or occupied veto.
                let remaining=Math.min(dt,.1);
                while(remaining>1e-7&&s.flight){
                    const step=Math.min(remaining,1/120),v=s.flight,age=s.flightAge??0,next=trapAdvance(s,v,step,age);
                    const r=TRAP_THROW.radius,from=new C.Vec3(s.x,s.y+r,s.z),to=new C.Vec3(next.x,next.y+r,next.z);
                    let hit=this.rayQuery.sphere(from,to,r,1,()=>true),offsetX=0,offsetZ=0;
                    // The real board footprint, not only its centre, must clear walls/floors.
                    const c=Math.cos(s.yaw),sn=Math.sin(s.yaw);
                    for(const side of [-1,0,1])for(const end of [-1,0,1]){
                        if(!side&&!end)continue;
                        const ox=side*(.75*TRAP_SCALE-r)*c+end*(W.trapRadius-r)*sn,oz=-side*(.75*TRAP_SCALE-r)*sn+end*(W.trapRadius-r)*c;
                        const candidate=this.rayQuery.sphere(new C.Vec3(from.x+ox,from.y,from.z+oz),new C.Vec3(to.x+ox,to.y,to.z+oz),r,1,()=>true);
                        if(candidate.hasHit&&(!hit.hasHit||candidate.distance<hit.distance)){hit=candidate;offsetX=ox;offsetZ=oz;}
                    }
                    Object.assign(v,trapVelocity(v,step,age));s.flightAge=age+step;
                    if(hit.hasHit){
                        const n=hit.hitNormalWorld;
                        s.x=hit.hitPointWorld.x-offsetX+n.x*(r+.01);s.y=hit.hitPointWorld.y+n.y*(r+.01)-r;s.z=hit.hitPointWorld.z-offsetZ+n.z*(r+.01);
                        if(n.y>.5){delete s.flight;s.landedAt=now;this.pickupEvents.push({kind:'trap',what:'set',trapId:id,playerId:s.owner,p:{x:s.x,y:s.y,z:s.z}});}
                        else {const inward=v.x*n.x+v.y*n.y+v.z*n.z;if(inward<0){v.x-=inward*n.x;v.y-=inward*n.y;v.z-=inward*n.z;}v.x*=.3;v.z*=.3;}
                    }else {s.x=next.x;s.y=next.y;s.z=next.z;}
                    const x=Math.max(CITY_BOUNDS.min,Math.min(CITY_BOUNDS.max,s.x)),z=Math.max(CITY_BOUNDS.min,Math.min(CITY_BOUNDS.max,s.z));
                    if(x!==s.x)v.x=0;if(z!==s.z)v.z=0;s.x=x;s.z=z;
                    trap.body.position.set(s.x,s.y+.3*TRAP_TALL,s.z);trap.body.updateAABB();
                    remaining-=step;
                }
                if(s.flight)continue;
            }
            if(trap.held!==undefined&&now-(s.snapAt??-Infinity)>=W.trapHoldMs){const held=this.players.get(trap.held);if(!held||!within(held,s))trap.held=undefined;}
            if(!playing||now-(s.snapAt??-Infinity)<W.trapHoldMs+W.trapRearmMs)continue;
            for(const rat of this.players.values()){
                if(rat.id===s.owner||rat.id===trap.held||!within(rat,s)||(this.buffs[rat.id]?.trappedUntil??0)>now)continue;
                s.snapAt=now;trap.held=rat.id;
                this.buffs[rat.id]={...this.buffs[rat.id],trappedUntil:now+W.trapHoldMs};
                this.pickupEvents.push({kind:'trap',what:'snap',trapId:id,playerId:s.owner,p:{x:s.x,y:s.y,z:s.z},victim:rat.id});
                break;
            }
        }
        // Shot sweeps later in this same step must see the new shootable board position.
        if(moved)this.rayQuery.refresh();
    }

    private noteShot(shot:ChaosShot,outcome:ShotResultOutcome,extra:Partial<ShotResultEvent>={}):void {
        const shotId=this.shotTriggers.get(shot.id)??shot.id;
        this.shotEvents.push({owner:shot.owner,shotId,ballId:shot.id,outcome,at:this.now,tick:this.tick,epoch:this.epoch,...extra});
        if(this.shotEvents.length>512)this.shotEvents.splice(0,this.shotEvents.length-512);
    }
    private finishShot(shot:ChaosShot,outcome:ShotResultOutcome,extra:Partial<ShotResultEvent>={}):void {
        this.noteShot(shot,outcome,extra);
        this.shotViews.delete(shot.id);this.shotTriggers.delete(shot.id);
    }
    drainShotEvents():ShotResultEvent[]{return this.shotEvents.splice(0,this.shotEvents.length);}

    private syncRats(){
        for(const [id,b] of this.rats)if(!this.players.has(id)||this.players.get(id)!.hp<=0){
            this.world.removeBody(b);this.targets.delete(b);this.rats.delete(id);
        }
        for(const [id,p] of this.players){
            if(p.hp<=0)continue;
            let b=this.rats.get(id),target=b&&this.targets.get(b);
            if(!b||!target){
                b=new C.Body({mass:0,type:C.Body.KINEMATIC,collisionFilterGroup:2,collisionFilterMask:16});
                target={kind:'rat',player:p,head:addRatShapes(b)[2]};
                this.rats.set(id,b);this.targets.set(b,target);this.world.addBody(b);
            }
            b.position.set(p.x,p.y,p.z);b.updateAABB();
        }
    }
    private carry(p:PlayerData,c=this.primaryCase){
        this.scaleCase(1,c);
        c.missileOwner=undefined;c.hitAfter.clear();c.armed=false;c.launched=false;
        const q=new C.Quaternion(p.meshQx,p.meshQy,p.meshQz,p.meshQw);q.normalize();
        q.vmult(vec(CASE_HAND),c.body.position);
        c.body.position.vadd(new C.Vec3(p.x,p.y,p.z),c.body.position);
        q.mult(caseCarryRotation,c.body.quaternion);c.body.velocity.setZero();c.body.angularVelocity.setZero();
        c.body.type=C.Body.KINEMATIC;c.body.collisionFilterMask=16;c.body.updateAABB();
        // The heartbeat ping: once when taken, then every `casePingMs` while carried.
        if(!c.ping||this.now-c.ping.at>=T.casePingMs)c.ping={at:this.now,p:{x:c.body.position.x,y:c.body.position.y,z:c.body.position.z}};
    }
    release(id:string,incoming?:Vec3Data){
        for(const c of this.cases.values())if(c.owner===id)this.releaseCase(c,incoming);
    }
    private releaseCase(c:CaseRuntime,incoming?:Vec3Data){
        if(!c.owner)return;
        const id=c.owner;c.owner=null;c.grip=0;c.ping=undefined;
        if(c===this.primaryCase&&this.assignment?.state.jurisdiction){this.assignment.state.jurisdiction.scorerId=null;this.assignment.state.revision++;}this.scaleCase(CASE_LOOSE_SCALE,c);
        c.body.position.y+=CASE_SIZE.y*(CASE_LOOSE_SCALE-1)/2;
        c.previousOwner=id;c.pickupAfter=this.now+T.formerCarrierDelay;c.looseSince=this.now;
        c.body.type=C.Body.DYNAMIC;c.body.collisionFilterMask=1|8|16;
        c.body.updateMassProperties();c.body.wakeUp();
        if(incoming){const v=vec(incoming);v.normalize();v.scale(14.3,c.body.velocity);c.body.velocity.y+=5.2;}
        this.tell('CASE LOOSE · This is no longer your problem.');
    }
    removePlayer(id:string){
        this.pickupApproaches.delete(id);
        this.assignment?.disconnect(id);
        this.release(id);delete this.possession[id];this.tommyHeat.delete(id);
        // A rat's trap leaves with its owner (letting go of anyone it holds).
        for(const [trapId,trap] of this.traps)if(trap.state.owner===id)this.removeTrap(trapId);
        if(this.dispatch.caller===id){this.dispatch={...this.dispatch};delete this.dispatch.caller;}
    }
    /** Watchdog recovery is only allowed for loose evidence, never a human carrier. */
    recoverLooseCase(caseId='primary'):boolean {
        const c=this.cases.get(caseId);
        if(!c||c.owner||c.returningUntil)return false;
        c.returningUntil=this.now+T.recoverMs;
        this.tell('CASE RETURNING · Evidence misplaced.');return true;
    }
    /** AI rescue releases and recovers precisely the case that bot was carrying. */
    recoverCarrierCase(id:string):boolean {
        const c=[...this.cases.values()].find(c=>c.owner===id);if(!c)return false;
        this.releaseCase(c);return this.recoverLooseCase(c.id);
    }
    /** Admin: the primary case leaves whoever holds it and returns to a fresh spawn point by the ordinary recovery. */
    resetCase():boolean{this.releaseCase(this.primaryCase);return this.recoverLooseCase();}
    death(victim:PlayerData,incoming:Vec3Data,owner:string|null=victim.id):boolean{
        this.release(victim.id,incoming);
        if(this.incidentActive('most-wanted')&&this.dispatch.wanted===victim.id){
            // Bounty: whoever takes down the wanted rat gets a random supply, and everyone sees it claimed.
            const hunter=owner&&owner!==victim.id?this.players.get(owner):undefined;
            const pickup=hunter?this.rewardSupply(hunter.id,'bounty'):undefined;
            this.dispatch={...this.dispatch};delete this.dispatch.wanted;
            if(hunter&&pickup){
                this.dispatch.bounty={hunter:hunter.id,target:victim.id,at:this.now,pickup};
                this.tell(`BOUNTY CLAIMED · ${hunter.name.toUpperCase()} TOOK DOWN ${victim.name.toUpperCase()}`);
            }
        }
        const incident=this.incidentActive('improper-disposal');
        if(this.corpses.size>=T.maxCorpses){const first=this.corpses.keys().next().value;if(first)this.removeCorpse(first);}
        const direction=vec(incoming);if(direction.lengthSquared()<.01)direction.set(0,0,1);direction.normalize();
        const body=new C.Body({mass:2,shape:new C.Box(new C.Vec3(.48,.92,.38)),
            position:new C.Vec3(victim.x,victim.y+.95,victim.z),collisionFilterGroup:8,collisionFilterMask:1|4|8|16,
            linearDamping:.015,angularDamping:.04});
        body.quaternion.set(victim.meshQx,victim.meshQy,victim.meshQz,victim.meshQw);body.quaternion.normalize();
        direction.scale(incident?T.corpseSpeed:T.normalCorpseSpeed,body.velocity);body.angularVelocity.set(direction.z*15,5,-direction.x*15);
        const state:CorpseState={id:crypto.randomUUID(),victimId:victim.id,owner,appearance:{
            hatType:victim.hatType,hatColor:victim.hatColor,furColor:victim.furColor,coatColor:victim.coatColor,
            ...(victim.highlightColor===undefined?{}:{highlightColor:victim.highlightColor})
        },born:this.now,expires:this.now+T.corpseMs,...pose(body)};
        this.addCorpse(body,state);
        if(incident)this.deathBurst(state);return true;
    }
    private deathBurst(corpse:CorpseState){
        this.cheeseBurst(corpse.p,corpse.owner===undefined?corpse.victimId:corpse.owner);
    }
    /** Identical radial eruption for Improper Disposal. */
    private cheeseBurst(origin:Vec3Data,owner:string|null):void {
        this.sound('burst',origin);
        // Shared global shot capacity and fixed lifetime bound even a chain reaction.
        // Start inside the body so rays leave it without striking an artificial shell.
        for(let i=0;i<T.deathBurstBalls && this.shots.length<T.maxShots;i++){
            const angle=i*Math.PI*2/T.deathBurstBalls;
            const direction=new C.Vec3(Math.cos(angle),.12+(i%3)*.12,Math.sin(angle));direction.normalize();
            direction.scale(BALL_SPEED,direction);
            const shot:ChaosShot={id:crypto.randomUUID(),owner,
                p:{...origin},v:data(direction),age:0,explosive:true};
            this.burstShots.add(shot);this.shots.push(shot);
        }
    }
    private sound(cue:WorldFoleyCue,p:Vec3Data,n:Vec3Data={x:0,y:1,z:0},energy=20):void {
        if(!Number.isFinite(p.x+p.y+p.z+energy))return;
        this.audioImpacts.push({p:data(p),n:data(n),surface:false,audioOnly:true,foley:cue,energy:Math.max(0,Math.min(300,energy))});
        if(this.audioImpacts.length>16)this.audioImpacts.shift();
    }
    private contactSound(body:C.Body,cue:WorldFoleyCue,p:Vec3Data,n:Vec3Data,energy:number):void {
        if(energy<2||this.now-(this.contactSoundAt.get(body)??-Infinity)<120)return;
        this.contactSoundAt.set(body,this.now);this.sound(cue,p,n,energy);
    }
    private listenForContacts(body:C.Body,cue:WorldFoleyCue):void {
        body.addEventListener('collide',(event:{contact:C.ContactEquation})=>{
            const c=event.contact,other=c.bi===body?c.bj:c.bi;
            if(other.type!==C.Body.STATIC)return;
            const offset=c.bi===body?c.ri:c.rj;
            const normal=c.bi===body?c.ni.negate():c.ni;
            this.contactSound(body,cue,body.position.vadd(offset),normal,Math.abs(c.getImpactVelocityAlongNormal()));
        });
    }
    private addCorpse(body:C.Body,state:CorpseState){
        this.world.addBody(body);this.targets.set(body,{kind:'corpse',corpseId:state.id});
        this.corpses.set(state.id,{body,state,hitAfter:new Map()});
        this.listenForContacts(body,'corpse-bounce');
    }
    private stepBodies(dt:number,playing:boolean){
        // Bound ordinary travel to .8 units per substep; swept world checks catch thin walls.
        // Swept rat checks cover the entire path, including between network ticks.
        // Launched evidence rides the same swept integration as weaponized
        // missiles: at 90 m/s a dynamic body tunnels thin walls between substeps.
        const missiles=[...this.cases.values()].filter(c=>this.caseDangerous(c)||this.caseLaunched(c));
        const caseMotion=missiles.map(c=>({c,p:c.body.position.clone(),v:c.body.velocity.clone()}));
        // Weaponized cases have their own continuous sweep. They must not force
        // extra Cannon steps or repeat all nine world rays on every substep.
        const fastest=Math.max(0,...[...this.cases.values()].filter(c=>!c.owner&&!this.caseDangerous(c)&&!this.caseLaunched(c)).map(c=>c.body.velocity.length()),...[...this.corpses.values()].map(c=>c.body.velocity.length()));
        const substeps=Math.max(1,Math.min(4,Math.ceil(fastest*dt/.8)));this.substepCount+=substeps;
        for(const c of missiles){c.body.type=C.Body.KINEMATIC;c.body.collisionFilterMask=16;}
        for(let sub=0;sub<substeps;sub++){
            const previous=[...this.corpses.values()].map(c=>({c,p:c.body.position.clone(),v:c.body.velocity.clone()}));
            // Cannon advances rotation; swept integration owns missile translation.
            this.world.step(dt/substeps);
            for(const {c,p,v} of previous){
                const body=c.body;
                const obstruction=this.ray(p,body.position,1);
                if(obstruction.hasHit){
                    this.contactSound(body,'corpse-bounce',obstruction.hitPointWorld,obstruction.hitNormalWorld,v.length());
                    body.position.copy(obstruction.hitPointWorld.vadd(obstruction.hitNormalWorld.scale(.5)));
                    v.vadd(obstruction.hitNormalWorld.scale(-2*v.dot(obstruction.hitNormalWorld)),body.velocity);
                    body.velocity.scale(.72,body.velocity);body.updateAABB();
                }
                if(!playing||v.length()<T.corpseHitMinSpeed)continue;
                const delta=body.position.vsub(p),length=delta.lengthSquared();
                for(const player of this.players.values()){
                    const owner=c.state.owner===undefined?c.state.victimId:c.state.owner;
                    if(player.hp<=0||player.id===owner||player.id===c.state.victimId||
                        (c.hitAfter.get(player.id)||0)>this.now)continue;
                    const center=new C.Vec3(player.x,player.y+1,player.z);
                    const fraction=length?Math.max(0,Math.min(1,center.vsub(p).dot(delta)/length)):0;
                    const nearest=p.vadd(delta.scale(fraction));
                    if(nearest.distanceTo(center)>1.15||this.ray(nearest,center,1).hasHit)continue;
                    c.hitAfter.set(player.id,this.now+T.corpseHitCooldownMs);
                    this.hit({owner,victim:player.id,damage:v.length()>55?2:1,incoming:data(v),corpse:true});
                    this.impacts.push({p:data(center),n:data(v.unit()),surface:false,foley:'corpse-hit',energy:Math.min(300,v.length())});
                }
            }
        }
        for(const {c,p,v} of caseMotion){
            c.body.position.copy(p);c.body.velocity.copy(v);this.stepCaseMissile(dt,playing,c);
        }
    }
    private caseDangerous(c=this.primaryCase){
        return !c.owner&&c.armed&&this.incidentActive('evidence-tampering');
    }
    /** A case is a launcher rider only while it is genuinely in flight. */
    private caseLaunched(c:CaseRuntime):boolean{return c.launched&&!c.owner&&!c.returningUntil;}
    /** Flight is over once the case is slow and supported again. */
    private caseSettled(c:CaseRuntime,p:C.Vec3):boolean{
        if(c.body.velocity.length()>T.casePickupMaxSpeed)return false;
        if(p.y<=1.5)return true;
        return isReachableLandmarkPosition(p.x,p.y,p.z)||isReachableVehiclePosition(p.x,p.y,p.z);
    }
    /** Pad impulse from the same profile as the rat riders, tumbling. */
    private launchCase(c:CaseRuntime,source:ThrowSource,boost:boolean){
        const velocity=launcherVelocity(source,boost);
        c.launched=true;c.launchLift=velocity.y;
        // The watchdog treats a slow, high, unsupported case as lost. A case on a
        // pad has already been loose for seconds, so its apex would be swallowed.
        c.looseSince=this.now;
        c.body.type=C.Body.DYNAMIC;c.body.collisionFilterMask=1|8|16;c.body.updateMassProperties();
        c.body.velocity.set(velocity.x,velocity.y,velocity.z);
        c.body.angularVelocity.set(velocity.z*.25,3.5,-velocity.x*.25);
        c.body.wakeUp();
    }
    private hitCasePath(from:C.Vec3,to:C.Vec3,velocity:C.Vec3,playing:boolean,c=this.primaryCase){
        if(!playing||velocity.length()<8)return;
        const delta=to.vsub(from),length=delta.lengthSquared();
        const reach=1.55;
        for(const player of this.players.values()){
            if(player.hp<=0||(c.hitAfter.get(player.id)||0)>this.now)continue;
            if(player.id===c.missileOwner)continue;
            const center=new C.Vec3(player.x,player.y+1,player.z);
            const fraction=length?Math.max(0,Math.min(1,center.vsub(from).dot(delta)/length)):0;
            const nearest=from.vadd(delta.scale(fraction));
            if(nearest.distanceTo(center)>reach)continue;
            const blocked=this.ray(nearest,center,1);
            if(blocked.hasHit&&blocked.distance>0.35)continue;
            c.hitAfter.set(player.id,this.now+700);
            // Redirect ownership still protects the shooter from self-damage,
            // but the weaponized evidence never awards a player a kill.
            this.hit({owner:null,victim:player.id,damage:velocity.length()>=28?MAX_HP:1,incoming:data(velocity)});
            this.impacts.push({p:data(center),n:data(velocity.unit()),surface:false,cue:'thud'});
        }
    }
    private launchCaseMissile(c:CaseRuntime,incoming?:C.Vec3){
        c.armed=true;c.hitAfter.clear();c.returningUntil=0;c.launched=false;
        c.body.type=C.Body.KINEMATIC;c.body.collisionFilterMask=16;c.body.wakeUp();c.looseSince=this.now;
        if(incoming&&incoming.lengthSquared()>.01){
            const kick=incoming.clone();kick.normalize();
            const yaw=Math.hypot(kick.x,kick.z)>.01?Math.atan2(kick.z,kick.x):Math.atan2(c.body.velocity.z,c.body.velocity.x);
            c.body.velocity.set(Math.cos(yaw)*I.caseShotSpeed,Math.max(-I.caseMaxLift,Math.min(I.caseMaxLift,kick.y*I.caseShotSpeed)),Math.sin(yaw)*I.caseShotSpeed);
            c.body.angularVelocity.set(c.body.velocity.z*.09,3.5,-c.body.velocity.x*.09);
            return;
        }
        const yaw=Math.random()*Math.PI*2;
        c.body.velocity.set(Math.cos(yaw)*I.caseMissileSpeed,I.caseMissileLift,Math.sin(yaw)*I.caseMissileSpeed);
        c.body.angularVelocity.set(c.body.velocity.z*.09,3.5,-c.body.velocity.x*.09);
    }
    private beginEvidenceTampering(){
        this.casesWeaponized=true;
        for(const c of [...this.cases.values()]){
            if(!c.owner)continue;
            const holder=this.players.get(c.owner);
            this.releaseCase(c);
            if(!holder)continue;
            const away=new C.Vec3(c.body.position.x-holder.x,0,c.body.position.z-holder.z);
            if(away.lengthSquared()<.04)away.set(holder.meshQz||1,0,-holder.meshQx);
            away.normalize();away.scale(I.caseEjectSpeed,away);away.y=8;
            const offset=away.clone();offset.normalize();offset.scale(1.1,offset);
            c.body.position.vadd(offset,c.body.position);
            c.body.velocity.copy(away);
        }
        this.syncExtraCases();
        for(const c of this.cases.values())this.launchCaseMissile(c);
        this.tell('The evidence is now resisting arrest.');
    }
    private endEvidenceTampering(){
        this.casesWeaponized=false;
        this.syncExtraCases();
        const c=this.primaryCase;
        c.armed=false;c.missileOwner=undefined;c.hitAfter.clear();
        if(!c.owner){
            if(c.body.velocity.length()>16)c.body.velocity.scale(16/c.body.velocity.length(),c.body.velocity);
            c.body.type=C.Body.DYNAMIC;c.body.collisionFilterMask=1|8|16;c.body.updateMassProperties();
        }
        this.restoreObjectiveApproach(c);
    }
    private stepCaseMissile(dt:number,playing:boolean,c=this.primaryCase){
        const body=c.body;
        body.velocity.y+=BALL_GRAVITY*dt;
        // A launched case keeps its pad impulse; the weaponized missile cap stays
        // low so redirected evidence never becomes a rising rocket.
        const lift=c.launched?c.launchLift:I.caseMaxLift;
        body.velocity.y=Math.min(lift,body.velocity.y);
        // Swept integration owns translation, so Cannon never gets to apply the
        // body's damping. Mirror its formula for launched flight or the case
        // never loses energy and ping-pongs off the ground forever.
        if(c.launched)body.velocity.scale(Math.pow(1-body.linearDamping,dt),body.velocity);
        // Sweep the center and eight rotated corners. Even at missile speed a
        // thin wall intercepts the case before it can cross between physics ticks.
        const offsets=[new C.Vec3()];
        for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
            offsets.push(body.quaternion.vmult(new C.Vec3(x*CASE_SIZE.x*c.scale/2,y*CASE_SIZE.y*c.scale/2,z*CASE_SIZE.z*c.scale/2)));
        }
        let remaining=dt;
        for(let bounce=0;bounce<4&&remaining>0.000001;bounce++){
            const from=body.position.clone(),delta=body.velocity.scale(remaining),length=delta.length();
            if(length<0.000001)break;
            let fraction=1,normal:C.Vec3|undefined;
            for(const offset of offsets){
                const start=from.vadd(offset),hit=this.ray(start,start.vadd(delta),1);
                if(hit.hasHit&&body.velocity.dot(hit.hitNormalWorld)<0&&hit.distance/length<=fraction){fraction=Math.max(0,hit.distance/length);normal=hit.hitNormalWorld.clone();}
            }
            const end=from.vadd(delta.scale(fraction));
            this.hitCasePath(from,end,body.velocity,playing,c);
            body.position.copy(end);
            if(!normal)break;
            body.position.vadd(normal.scale(.025),body.position);
            const dot=body.velocity.dot(normal);
            if(dot<0)body.velocity.vadd(normal.scale(-2*dot),body.velocity);
            body.velocity.scale(c.launched?LAUNCHED_CASE_RESTITUTION:BALL_RESTITUTION,body.velocity);
            if(normal.y>.65)body.velocity.y=Math.max(I.caseBounceLift,Math.min(lift,body.velocity.y));
            this.impacts.push({p:data(end),n:data(normal),surface:true,foley:'case-bounce',energy:Math.min(300,body.velocity.length())});
            remaining*=1-fraction;
        }
        // Keep this objective inside the playable city even after a rooftop shot.
        for(const axis of ['x','z'] as const){
            const low=CITY_BOUNDS.min+.6,high=CITY_BOUNDS.max-.6;
            if(body.position[axis]<low){body.position[axis]=low;body.velocity[axis]=Math.abs(body.velocity[axis])*.9;}
            if(body.position[axis]>high){body.position[axis]=high;body.velocity[axis]=-Math.abs(body.velocity[axis])*.9;}
        }
        // Replenish lateral motion only. Boosting total velocity turned a floor
        // rebound into an ever-rising rocket, especially after a shot claimed it.
        // A launched case is exempt: it must be allowed to settle and be collected.
        const lateral=Math.hypot(body.velocity.x,body.velocity.z);
        if(!c.launched&&lateral<I.caseRicochetMinSpeed){
            const yaw=lateral>.01?Math.atan2(body.velocity.z,body.velocity.x):Math.atan2(c.body.angularVelocity.x,-c.body.angularVelocity.z);
            body.velocity.x=Math.cos(yaw)*I.caseRicochetMinSpeed;body.velocity.z=Math.sin(yaw)*I.caseRicochetMinSpeed;
        }
        body.updateAABB();
    }
    private removeCorpse(id:string){const c=this.corpses.get(id);if(c){this.world.removeBody(c.body);this.targets.delete(c.body);this.corpses.delete(id);}}
    private ray(from:C.Vec3,to:C.Vec3,mask:number){
        return this.rayQuery.closest(from,to,mask);
    }
    /** Crossfire, a real world bounce at `at`: the ball heats a step and the bounce joins its path. Returns its world bounces so far. */
    private heatShot(shot:ChaosShot,at:Vec3Data):number{
        crossfireBounce(shot);
        let record=this.bankPaths.get(shot);
        if(!record){record={points:[],bounces:0};this.bankPaths.set(shot,record);}
        if(record.points.length<CROSSFIRE.pathPoints)record.points.push(data(at));
        return record.bounces=Math.min(CROSSFIRE.maxBounces,record.bounces+1);
    }
    /** A bank shot hitting at `at`: its world bounces and its path (muzzle, bounces, hit, to the centimetre); nothing unbanked. */
    private bankReport(shot:ChaosShot,at:Vec3Data):{bounces:number;path:Vec3Data[]}|undefined{
        const record=this.bankPaths.get(shot);if(!record?.bounces)return undefined;
        const path=[...(record.origin?[record.origin]:[]),...record.points,at];
        return {bounces:record.bounces,path:path.map(p=>({x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100,z:Math.round(p.z*100)/100}))};
    }
    private recordRatHistory(now:number):void {
        for(const [id,player] of this.players){
            const alive=player.hp>0,previous=this.ratLives.get(id);
            const life=previous?previous.life+(!previous.alive&&alive?1:0):1;
            this.ratLives.set(id,{alive,life});
            const samples=this.ratHistory.get(id)??[];
            const sample={at:now,p:{x:player.x,y:player.y,z:player.z},alive,life,ironclad:hasIronclad(this.buffs,id,now)};
            const last=samples[samples.length-1];
            if(last&&last.at===now)samples[samples.length-1]=sample;else samples.push(sample);
            while(samples.length>40||samples[1]?.at<now-NETPLAY_HISTORY_MS)samples.shift();
            this.ratHistory.set(id,samples);
        }
        for(const id of this.ratHistory.keys())if(!this.players.has(id)){this.ratHistory.delete(id);this.ratLives.delete(id);}
    }
    private historicRat(id:string,at:number):{p:Vec3Data;alive:boolean;life:number;ironclad:boolean}|undefined {
        const samples=this.ratHistory.get(id);if(!samples?.length)return;
        const current=this.ratLives.get(id),first=samples[0],last=samples[samples.length-1];
        if(at<first.at||at>last.at+50)return;
        if(at>=last.at)return current?.life===last.life?last:undefined;
        let right=1;while(right<samples.length&&samples[right].at<at)right++;
        const a=samples[right-1],b=samples[right];
        if(!a||!b||!a.alive||!b.alive||a.life!==b.life||a.life!==current?.life)return;
        const t=b.at===a.at?1:(at-a.at)/(b.at-a.at);
        return{p:{x:a.p.x+(b.p.x-a.p.x)*t,y:a.p.y+(b.p.y-a.p.y)*t,z:a.p.z+(b.p.z-a.p.z)*t},alive:true,life:a.life,ironclad:a.ironclad&&b.ironclad};
    }
    private recordCaseHistory(now:number):void {
        const c=this.primaryCase,sample={at:now,p:data(c.body.position),q:{x:c.body.quaternion.x,y:c.body.quaternion.y,z:c.body.quaternion.z,w:c.body.quaternion.w},owner:c.owner,scale:c.scale};
        const last=this.caseHistory[this.caseHistory.length-1];if(last?.at===now)this.caseHistory[this.caseHistory.length-1]=sample;else this.caseHistory.push(sample);
        while(this.caseHistory.length>40||this.caseHistory[1]?.at<now-NETPLAY_HISTORY_MS)this.caseHistory.shift();
    }
    private historicCase(at:number):typeof this.caseHistory[number]|undefined {
        const samples=this.caseHistory;if(!samples.length||at<samples[0].at||at>samples[samples.length-1].at+50)return;
        const last=samples[samples.length-1];if(at>=last.at)return last;
        let right=1;while(right<samples.length&&samples[right].at<at)right++;
        const a=samples[right-1],b=samples[right];if(!a||!b||a.owner!==b.owner||a.scale!==b.scale)return;
        const t=b.at===a.at?1:(at-a.at)/(b.at-a.at),q={x:a.q.x+(b.q.x-a.q.x)*t,y:a.q.y+(b.q.y-a.q.y)*t,z:a.q.z+(b.q.z-a.q.z)*t,w:a.q.w+(b.q.w-a.q.w)*t};
        const length=Math.hypot(q.x,q.y,q.z,q.w)||1;
        return{at,p:{x:a.p.x+(b.p.x-a.p.x)*t,y:a.p.y+(b.p.y-a.p.y)*t,z:a.p.z+(b.p.z-a.p.z)*t},q:{x:q.x/length,y:q.y/length,z:q.z/length,w:q.w/length},owner:a.owner,scale:a.scale};
    }
    private caseSweep(from:C.Vec3,to:C.Vec3,radius:number,shot:ChaosShot):{available:boolean;hit?:C.RaycastResult;target?:Target}|undefined {
        const view=this.shotViews.get(shot.id);if(!view||shot.age>view.untilAge)return;
        const historic=this.historicCase(view.viewAt+shot.age*1000);if(!historic||historic.scale!==this.primaryCase.scale)return;
        if(historic.owner===shot.owner)return{available:true};
        const body=this.primaryCase.body,position=body.position.clone(),rotation=body.quaternion.clone();
        body.position.copy(vec(historic.p));body.quaternion.set(historic.q.x,historic.q.y,historic.q.z,historic.q.w);
        const hit=sweepSphereBody(from,to,radius,body);body.position.copy(position);body.quaternion.copy(rotation);
        return hit.hasHit?{available:true,hit,target:this.targets.get(body)}:{available:true};
    }
    private ratSweep(from:C.Vec3,to:C.Vec3,radius:number,shot:ChaosShot):{hit:C.RaycastResult;target:Target;compensated:boolean;ironclad:boolean;rewindMs:number;targetDelta:number}|undefined {
        const view=this.shotViews.get(shot.id);if(!view||shot.age>view.untilAge)return;
        const sampleAt=view.viewAt+shot.age*1000;
        let best:{hit:C.RaycastResult;target:Target;compensated:boolean;ironclad:boolean;rewindMs:number;targetDelta:number}|undefined;
        for(const [id,body] of this.rats){
            if(id===shot.owner)continue;
            const target=this.targets.get(body);if(!target?.player||target.player.hp<=0)continue;
            const historic=this.historicRat(id,sampleAt),useHistoric=!!historic;
            const original=body.position.clone();
            if(historic)body.position.set(historic.p.x,historic.p.y,historic.p.z);
            const hit=sweepSphereBody(from,to,radius,body);
            if(historic)body.position.copy(original);
            if(hit.hasHit&&(!best||hit.distance<best.hit.distance))best={hit,target,compensated:useHistoric,ironclad:historic?.ironclad??hasIronclad(this.buffs,id,this.now),
                rewindMs:useHistoric?Math.max(0,this.now-sampleAt):0,targetDelta:historic?Math.hypot(original.x-historic.p.x,original.y-historic.p.y,original.z-historic.p.z):0};
        }
        return best;
    }
    private advanceAssignment(dt:number,now:number,playing:boolean):void{
        const rules=this.assignment;if(!rules||rules.closed)return;
        const d=this.dispatch,from=now-Math.max(0,dt)*1000;
        let start=Infinity,end=Infinity;
        if(d.incident==='evidence-tampering'){
            if(d.phase==='rolling'){start=d.until;end=start+T.activeMs;}
            else if(d.phase==='active'){start=d.started;end=d.until;}
            else if(d.phase==='cooldown'){end=d.started;start=end-T.activeMs;}
        }
        const cuts=[from,...[start,end,rules.state.liveAt,...(rules.state.jurisdiction?[this.primaryAcquiredAt]:[])].filter(t=>t>from&&t<now),now].sort((a,b)=>a-b);
        for(let i=0;i<cuts.length-1;i++){
            const a=cuts[i],b=cuts[i+1];
            rules.setPhase(a,a>=start&&a<end);
            if(playing)rules.advance(a,b,this.primaryCase.returningUntil||(rules.state.jurisdiction&&a<this.primaryAcquiredAt)?null:this.primaryCase.owner);
        }
        rules.setPhase(now,now>=start&&now<end);
    }
    private returnAtDestination(c:CaseRuntime,id:DestinationId):void{
        const p=destinationPoint(id);p.y+=1;
        c.body.position.copy(vec(p));c.body.velocity.setZero();c.body.angularVelocity.setZero();
        c.body.updateAABB();c.body.wakeUp();c.looseSince=this.now;
    }
    private restoreObjectiveApproach(c:CaseRuntime):void{
        if(c!==this.primaryCase||!this.assignment||this.assignment.closed)return;
        // Include the case's physical extent at a building edge, not only its
        // center: incident cleanup must not turn an overlapping missile into a stamp.
        c.body.updateAABB();const {lowerBound:l,upperBound:u}=c.body.aabb;
        const id=this.assignment.state.destinations.find(id=>{
            const b=ASSIGNMENT_DESTINATIONS[id].bounds;
            return u.x>b.xmin&&l.x<b.xmax&&u.y>b.ymin&&l.y<b.ymax&&u.z>b.zmin&&l.z<b.zmax;
        });
        if(id&&!c.owner){this.returnAtDestination(c,id);this.tell('EVIDENCE RETURNED · Fresh entry required.');}
    }
    private checkAssignmentLocation(c:CaseRuntime):void {
        const rules=this.assignment,holder=c.owner?this.players.get(c.owner):undefined;
        if(c!==this.primaryCase||!rules?.active||rules.closed||c.returningUntil||this.casesWeaponized||!holder)return;
        const outcome=rules.visit(holder.id,holder,this.now);
        if(outcome==='delivered'){
            this.releaseCase(c);
            this.placeCaseAtSpawn(c,holder);
            c.body.quaternion.set(0,0,0,1);c.body.velocity.setZero();c.body.angularVelocity.setZero();
            c.body.previousPosition.copy(c.body.position);c.body.interpolatedPosition.copy(c.body.position);
            c.body.updateAABB();c.body.wakeUp();c.hitAfter.clear();
            c.previousOwner=null;c.pickupAfter=0;c.returningUntil=0;c.looseSince=this.now;c.armed=false;c.missileOwner=undefined;
            c.launched=false;
            const next=activeDestination(rules.state);
            this.tell(`PAPERWORK DELIVERED! ${holder.name} · ${rules.state.deliveries[holder.id]}/${ASSIGNMENT_TUNING.deliveryTarget} · CASE RELOCATED · NEXT: ${next?ASSIGNMENT_DESTINATIONS[next].label:''}`);
        }
    }
    step(dt:number,now:number,playing=true){
        this.now=now;this.tick++;this.recordRatHistory(now);this.syncRats();this.rayQuery.refresh();
        this.advanceAssignment(dt,now,playing);
        playing=playing&&!this.assignment?.closed;
        this.pressure.launches=this.pressure.launches.filter(event=>now-event.at<=PRESSURE_LAUNCH.eventMs);
        if(this.pressure.shoves){
            this.pressure.shoves=this.pressure.shoves.filter(event=>now-event.at<=PRESSURE_LAUNCH.eventMs);
            if(!this.pressure.shoves.length)delete this.pressure.shoves;
        }
        // A restored room can cross multiple deadlines while asleep. Advance
        // without briefly applying an incident whose active window already ended.
        for(let transition=0;transition<3;transition++){
            const d=this.dispatch;
            if(d.phase==='ready'||now<d.until)break;
            if(d.phase==='rolling')this.dispatch={...d,phase:'active',started:d.until,until:d.until+T.activeMs};
            else if(d.phase==='active')this.dispatch={...d,phase:'cooldown',started:d.until,until:d.until+T.cooldownMs};
            else {this.dispatch={...d,phase:'ready',started:now,until:0};delete this.dispatch.caller;}
        }
        const weaponized=this.incidentActive('evidence-tampering');
        if(weaponized&&!this.casesWeaponized)this.beginEvidenceTampering();
        else if(!weaponized&&this.casesWeaponized)this.endEvidenceTampering();
        this.stepPressure(dt,now,playing);
        this.stepSurge(now,playing);
        this.stepFlights(now,playing);
        this.stepIncidentEffects(now,playing);
        this.syncExtraCases();
        for(const c of this.cases.values())this.updateCase(c,dt,playing);
        this.recordCaseHistory(now);
        this.stepPickups(now,playing);
        this.stepTraps(now,playing,dt);
        while(this.beams.length&&now-this.beams[0]!.at>W.laserBeamMs)this.beams.shift();
        // Small physical steps keep the theatrical bodies within their collision surfaces.
        this.stepBodies(dt,playing);
        for(const b of this.world.bodies)if(b.type!==C.Body.STATIC)b.updateAABB();
        for(let i=this.shots.length-1;i>=0;i--){
            const shot=this.shots[i];shot.age+=dt;
            if(this.shotTriggers.has(shot.id)&&!this.shotStepped.has(shot)){this.shotStepped.add(shot);this.noteShot(shot,'first-step');}
            if(shot.age>shotLife(shot)){this.finishShot(shot,'lifetime',{end:data(shot.p)});this.shots.splice(i,1);continue;}
            const radius=BALL_RADIUS;
            // Bad Ammunition: a path personality flies its own way along the aim, with no drop until its first contact.
            if(steerQuirk(shot))shot.v.y+=BALL_GRAVITY*dt;
            const from=vec(shot.p),motion=vec(shot.v).scale(dt),to=from.vadd(motion);
            const travel=motion.length()||1;
            // Ordinary rounds skip their shooter; explosive debris can hit them.
            // Preserve the owner's carried-case exclusion before closest contact.
            const historicalCase=this.caseSweep(from,to,radius,shot);
            const compensatedRats=this.shotViews.has(shot.id)&&shot.age<=this.shotViews.get(shot.id)!.untilAge;
            const acceptsShot=(body:C.Body)=>{
                const target=this.targets.get(body);
                return !(target?.kind==='rat'&&(compensatedRats||!shot.explosive&&target.player?.id===shot.owner))&&!(historicalCase?.available&&body===this.primaryCase.body)&&!(shot.owner && (!shot.explosive&&target?.player?.id===shot.owner ||
                    target?.kind==='case' && this.cases.get(target.caseId??'primary')?.owner===shot.owner ||
                    target?.kind==='trap' && this.traps.get(target.trapId??'')?.state.owner===shot.owner));
            };
            const solidHit=this.rayQuery.sphere(from,to,radius,1|2|4|8,acceptsShot),ratHit=this.ratSweep(from,to,radius,shot);
            let hit=solidHit,target=hit.body?this.targets.get(hit.body):undefined,useRat=false;
            if(historicalCase?.hit&&(!hit.hasHit||historicalCase.hit.distance<hit.distance)){hit=historicalCase.hit;target=historicalCase.target;}
            if(ratHit&&(!hit.hasHit||ratHit.hit.distance<hit.distance)){hit=ratHit.hit;target=ratHit.target;useRat=true;}
            const stop=radius+.01;
            const contact=hit.hasHit?Math.max(0,hit.distance):travel;
            const worldHit=hit.hasHit&&contact<=travel+.0001&&(shot.explosive||target?.player?.id!==shot.owner);
            if(!worldHit){shot.p=data(to);continue;}
            const normal=hit.hitNormalWorld,point=hit.hitPointWorld.vadd(normal.scale(stop));
            shot.p=data(point);
            const incoming={...shot.v};
            if(target?.kind==='rat' && target.player && target.player.hp>0){
                // Body hits take one hit point; a headshot is lethal. A Crossfire bank
                // shot deals ordinary damage (Tyler, 2 October: no more one-shot kills); a finishing one is still a BANK SHOT.
                const headshot=hit.shape===target.head;
                const damage=headshot?MAX_HP:Math.min(MAX_HP,this.carrierPower(shot.owner));
                if((useRat?ratHit!.ironclad:hasIronclad(this.buffs,target.player.id,now))){
                    // A reflective coat, not a hit shield: keep the original shooter
                    // and finite budget, and never treat a rat contact as a wall bounce.
                    bounceShot(shot.v,normal);quirkBounce(shot);
                    this.impacts.push({p:data(point),n:data(normal),surface:false,scale:1.1,cue:'armor-clang'});
                    this.noteShot(shot,'ironclad-reflect',{victimId:target.player.id,point:data(hit.hitPointWorld),normal:data(normal),
                        compensated:useRat&&ratHit!.compensated,...(useRat?{rewindMs:ratHit!.rewindMs,targetDelta:ratHit!.targetDelta}:{})});
                    continue;
                }
                const compensated=useRat&&ratHit!.compensated,viewAttempted=!!this.shotViews.get(shot.id)&&shot.age<=this.shotViews.get(shot.id)!.untilAge;
                if(playing)this.hit({owner:shot.owner,victim:target.player.id,damage,incoming,shotId:this.shotTriggers.get(shot.id)??shot.id,ballId:shot.id,
                    point:data(hit.hitPointWorld),normal:data(normal),compensated,...(shot.explosive?{explosive:true}:{}),...(headshot?{headshot:true}:{}),...(shot.cause?{cause:shot.cause}:{}),...(this.tommyBalls.has(shot)?{weapon:'tommy-gun' as const}:{}),
                    ...(shot.wallBounced&&this.incidentActive('crossfire')?this.bankReport(shot,hit.hitPointWorld):undefined)});
                // Scattershot: every ball knocks its rat flying along the shot (five at close range send it far).
                if(playing&&this.scatterShots.has(shot)){
                    const along=Math.hypot(incoming.x,incoming.z)||1;
                    this.shove(target.player.id,{x:incoming.x/along*I.scatterShove,y:I.scatterLift,z:incoming.z/along*I.scatterShove},'blast');
                }
                this.impacts.push({p:data(hit.hitPointWorld),n:data(normal),surface:false});
                this.finishShot(shot,headshot?'rat-head':'rat-body',{victimId:target.player.id,damage,point:data(hit.hitPointWorld),normal:data(normal),compensated,
                    ...(useRat?{rewindMs:ratHit!.rewindMs,targetDelta:ratHit!.targetDelta}:{}),
                    ...(viewAttempted&&!compensated?{fallback:'history-unavailable'}:{})});
                this.shots.splice(i,1);continue;
            }
            if(target?.kind==='trap'&&target.trapId){
                // A Mousetrap eats the ball and takes the hit.
                if(playing)this.damageTrap(target.trapId,1,shot.owner);
                this.impacts.push({p:data(hit.hitPointWorld),n:data(normal),surface:false,scale:.8,cue:'thud'});
                this.finishShot(shot,'trap-contact',{point:data(hit.hitPointWorld),normal:data(normal)});
                this.shots.splice(i,1);continue;
            }
            if(target?.kind==='case'){
                const c=this.cases.get(target.caseId??'primary')!;
                this.noteShot(shot,'case-contact',{point:data(hit.hitPointWorld),normal:data(normal)});
                this.shootCase(c,incoming,shot.id,shot.owner);
            }
            if(target?.kind==='corpse' && target.corpseId)this.kickCorpse(target.corpseId,incoming,shot.owner,hit.hitPointWorld,normal);
            const firstWorld=target?.kind==='world'&&!shot.wallBounced;
            bounceShot(shot.v,normal);const superball=shot.quirk==='superball';quirkBounce(shot);
            if(target?.kind==='world')shot.wallBounced=true;
            // Crossfire: every real world bounce heats the ball and is remembered for a bank kill's path.
            const banked=target?.kind==='world'&&this.incidentActive('crossfire')?this.heatShot(shot,hit.hitPointWorld):0;
            if(target?.kind==='world')this.noteShot(shot,'world-bounce',{point:data(hit.hitPointWorld),normal:data(normal)});
            if(target?.kind==='dispatch')this.noteShot(shot,'dispatch-contact',{point:data(hit.hitPointWorld),normal:data(normal)});
            if(target?.kind==='pressure')this.noteShot(shot,'pressure-contact',{point:data(hit.hitPointWorld),normal:data(normal)});
            if(target?.kind==='dispatch'&&playing){this.sound(this.dispatch.phase==='ready'?'trigger':'trigger-busy',hit.hitPointWorld,normal);this.activate(shot.owner);}
            if(target?.kind==='pressure'&&playing){
                this.sound(this.pressureCooling(target.machineId!)?'trigger-busy':'trigger',hit.hitPointWorld,normal);
                const pumped=this.pumpedBy.get(shot)??[];
                if(!pumped.includes(target.machineId!)){pumped.push(target.machineId!);this.pumpedBy.set(shot,pumped);this.addPressure(target.machineId!,PRESSURE_TUNING.hit,true);}
            }
            this.impacts.push({p:data(hit.hitPointWorld),n:data(normal),surface:true,...(target?.kind==='case'?{cue:'case-hit' as const}:target?.kind==='world'?{foley:superball?'boing' as const:firstWorld&&this.incidentActive('crossfire')?'charge' as const:'bounce' as const,energy:Math.min(300,Math.hypot(shot.v.x,shot.v.y,shot.v.z))}:{}),...(banked?{bounces:banked}:{})});
        }
        // A corpse knocked into the harbour sinks out of sight (the case rule's line: y -9).
        for(const [id,c] of this.corpses)if(now>=c.state.expires||c.body.position.y< -9||outsideCity(c.body.position.x,c.body.position.z))this.removeCorpse(id);
        for(const c of this.cases.values())this.stepLooseCase(c,now,playing);
        for(const id of this.pickupApproaches.keys())if(!this.players.has(id))this.pickupApproaches.delete(id);
        for(const player of this.players.values()){
            if(!playing||player.hp<=0){this.pickupApproaches.delete(player.id);continue;}
            const entry=this.pickupApproaches.get(player.id);
            const p={x:player.x,y:player.y+.8,z:player.z};
            if(!entry)this.pickupApproaches.set(player.id,{p,at:now,seq:0});
            else if(entry.p.x!==p.x||entry.p.y!==p.y||entry.p.z!==p.z)this.pickupApproaches.set(player.id,{p,at:now,seq:entry.seq});
        }
        if(this.impacts.length>64)this.impacts.splice(0,this.impacts.length-64);
    }
    private stepLooseCase(c:CaseRuntime,now:number,playing:boolean){
        if(!c.owner){
            const p=c.body.position;
            // A launched case is mid-flight, not lost. Its apex is slow and high,
            // which is exactly the shape the recovery watchdog hunts for, so the
            // flight is exempt until the case settles or genuinely escapes.
            const settled=this.caseSettled(c,p);
            if(c.launched&&(settled||p.y< -9||outsideCity(p.x,p.z))){
                // Flight integration leaves the body kinematic; hand it back to
                // Cannon and give it the ordinary grace before any recovery.
                c.launched=false;c.looseSince=now;
                c.body.type=C.Body.DYNAMIC;c.body.collisionFilterMask=1|8|16;c.body.updateMassProperties();
            }
            const invalid=!Number.isFinite(p.x+p.y+p.z)||outsideCity(p.x,p.z)||p.y< -9 ||
                (!c.launched &&
                (c.body.velocity.length()<.4 && p.y>1.5 && !isReachableLandmarkPosition(p.x,p.y,p.z) && !isReachableVehiclePosition(p.x,p.y,p.z) && now-c.looseSince>4000) ||
                (now-c.looseSince>T.stuckMs && this.embedded(p)));
            if(invalid && !c.returningUntil){
                // Incident missiles never blink out or wait in recovery. A
                // genuinely escaped case re-enters immediately for the full incident.
                c.returningUntil=this.casesWeaponized?now:now+T.recoverMs;
                if(!this.casesWeaponized)this.tell('CASE RETURNING · Evidence misplaced.');
            }
            if(this.casesWeaponized&&c.returningUntil)c.returningUntil=now;
            if(c.returningUntil && now>=c.returningUntil){
                this.placeCaseAtSpawn(c);c.body.quaternion.set(0,0,0,1);c.body.velocity.setZero();c.body.angularVelocity.setZero();
                c.hitAfter.clear();
                c.body.type=C.Body.DYNAMIC;c.body.collisionFilterMask=1|8|16;c.body.updateMassProperties();
                c.body.wakeUp();c.returningUntil=0;c.looseSince=now;
                if(this.casesWeaponized)this.launchCaseMissile(c);
                else {c.missileOwner=undefined;c.armed=false;}
                if(!this.casesWeaponized)this.restoreObjectiveApproach(c);
            }
            if(!c.returningUntil && playing && !this.assignment?.closed && !this.casesWeaponized && !this.caseDangerous(c) && c.body.velocity.length()<=T.casePickupMaxSpeed){
                for(const player of this.players.values()){
                    if(this.collectCase(player,now).accepted)break;
                }
            }
        }
    }
    private updateCase(c:CaseRuntime,dt:number,playing:boolean){
        if(c.owner){
            const p=this.players.get(c.owner);
            if(!p||p.hp<=0)this.releaseCase(c);else{
                this.carry(p,c);
                if(playing)this.checkAssignmentLocation(c);
                if(playing)this.possession[p.id]=(this.possession[p.id]||0)+dt;
            }
        }
        if(c.armed&&!this.caseDangerous(c)&&!this.casesWeaponized){
            if(c.body.velocity.length()>16)c.body.velocity.scale(16/c.body.velocity.length(),c.body.velocity);
            c.missileOwner=undefined;c.hitAfter.clear();c.armed=false;
            if(!c.owner){c.body.type=C.Body.DYNAMIC;c.body.collisionFilterMask=1|8|16;c.body.updateMassProperties();}
        }
    }
    private embedded(point:C.Vec3):boolean{
        for(const [body,target] of this.targets){
            if(target.kind!=='world')continue;
            const local=body.pointToLocalFrame(point);
            const shape=body.shapes[0];
            if(shape instanceof C.Box && Math.abs(local.x)<shape.halfExtents.x-.05 &&
                Math.abs(local.y)<shape.halfExtents.y-.05 && Math.abs(local.z)<shape.halfExtents.z-.05)return true;
        }
        return false;
    }
    private caseSnapshot(c:CaseRuntime):CaseState{
        return {...pose(c.body),owner:c.owner,previousOwner:c.previousOwner,pickupAfter:c.pickupAfter,
            returningUntil:c.returningUntil,...(c.owner&&c.grip&&this.now-c.gripAt<=T.caseGripMs?{grip:c.grip}:{}),...(c.missileOwner?{missileOwner:c.missileOwner}:{}),
            ...(c.owner&&c.ping?{ping:{at:c.ping.at,p:{...c.ping.p}}}:{})};
    }
    /** One enemy ball on a carried case. True when this hit breaks the grip; a ball counts once, and a grip left alone for `caseGripMs` is whole again. */
    private loosensGrip(c:CaseRuntime,ball:string,now:number):boolean{
        if(c.gripBall===ball)return false;
        if(now-c.gripAt>T.caseGripMs)c.grip=0;
        c.grip++;c.gripAt=now;c.gripBall=ball;
        return c.grip>=T.caseGripHits;
    }
    private buffSnapshot():BuffMap{
        const active:BuffMap={};
        for(const id of Object.keys(this.buffs)){
            const entry=activeBuffs(this.buffs,id,this.now);
            if(Object.keys(entry).length)active[id]=entry;
        }
        return active;
    }
    private shotSnapshot(s:ChaosShot):ChaosShot{
        return {...s,p:{...s.p},v:{...s.v},
            ...(s.wallBounced?{wallBounced:true}:{})};
    }
    /** Physics substeps and ray/sphere queries since the previous call (Worker diagnostics). */
    takeWork():{rays:number;substeps:number}{
        const work={rays:this.rayQuery.queries,substeps:this.substepCount};
        this.rayQuery.queries=0;this.substepCount=0;return work;
    }
    snapshot(drain=true):ChaosState{
        const state:ChaosState={time:this.now,epoch:this.epoch,tick:this.tick,case:this.caseSnapshot(this.primaryCase),
            ...(this.assignment?{assignment:structuredClone(this.assignment.state)}:{}),
            extraCases:[...this.cases.values()].filter(c=>c!==this.primaryCase).map(c=>({id:c.id,...this.caseSnapshot(c)})),dispatch:{...this.dispatch},pressure:{...this.pressure,levels:{...this.pressure.levels},...(this.pressure.blowing?{blowing:{...this.pressure.blowing}}:{}),...(this.pressure.fired?{fired:{...this.pressure.fired}}:{}),...(this.pressure.boosts?{boosts:{...this.pressure.boosts}}:{}),...(this.pressure.shoves?{shoves:this.pressure.shoves.map(e=>({...e,velocity:{...e.velocity}}))}:{}),...(this.pressure.vents?{vents:this.pressure.vents.map(v=>({...v}))}:{}),launches:this.pressure.launches.map(e=>({...e,velocity:{...e.velocity}}))},possession:{...this.possession},
            pickups:[...this.pickups].map(([id,site])=>({id,kind:site.kind,x:site.p.x,y:site.p.y,z:site.p.z,availableAt:site.availableAt})),
            buffs:this.buffSnapshot(),
            ...(this.traps.size?{traps:[...this.traps.values()].map(t=>({...t.state,...(t.state.flight?{flight:data(t.state.flight)}:{})}))}:{}),
            ...(this.beams.length?{beams:this.beams.map(b=>({...b,points:b.points.map(p=>({...p}))}))}:{}),
            corpses:[...this.corpses.values()].map(c=>({...c.state,...pose(c.body)})),
            shots:this.shots.map(s=>this.shotSnapshot(s)),impacts:[...this.impacts.slice(-64),...(this.impacts.length<64?this.audioImpacts.slice(-(64-this.impacts.length)):[])].slice(0,64),notice:{...this.notice}};
        if(drain){this.impacts=[];this.audioImpacts=[];}return state;
    }
    reset(){for(const shot of this.shots)this.finishShot(shot,'reset');this.pickupApproaches.clear();this.recentPickupClaims.clear();this.ratHistory.clear();this.caseHistory.length=0;this.ratLives.clear();this.shotViews.clear();this.shotTriggers.clear();this.epoch=crypto.randomUUID();this.tick=0;this.impacts=[];this.audioImpacts=[];for(const id of [...this.corpses.keys()])this.removeCorpse(id);this.shots=[];this.primaryCase.owner=null;this.primaryCase.missileOwner=undefined;this.primaryCase.hitAfter.clear();this.primaryCase.armed=false;this.possession={};
        this.assignment=undefined;
        this.buffs={};this.pickupEvents.length=0;this.tommyHeat.clear();this.beams=[];
        for(const id of [...this.traps.keys()])this.removeTrap(id);
        for(const site of this.pickups.values()){site.availableAt=0;site.kind=siteKind(site.kind);}
        this.primaryCase.previousOwner=null;this.primaryCase.pickupAfter=0;
        this.dispatch={phase:'ready',started:this.now,until:0,serial:this.dispatch.serial+1};this.casesWeaponized=false;this.syncExtraCases();
        this.pressure={serial:this.pressure.serial+1,levels:{},launches:[]};this.flights.clear();this.thrownUntil.clear();this.pendingVents.clear();
        this.misfireAt.clear();this.clangAt=0;this.incidentEvents.length=0;
        this.primaryCase.body.type=C.Body.DYNAMIC;this.primaryCase.body.collisionFilterMask=1|8|16;this.scaleCase(CASE_LOOSE_SCALE);this.placeCaseAtSpawn();
        this.primaryCase.body.velocity.setZero();this.primaryCase.body.angularVelocity.setZero();this.primaryCase.body.wakeUp();this.primaryCase.looseSince=this.now;this.primaryCase.returningUntil=0;this.primaryCase.launched=false;this.primaryCase.ping=undefined;}
    private restoreCase(c:CaseRuntime,saved:CaseState,time:number){
        c.owner=saved.owner&&!this.isCaseHolder(saved.owner)?saved.owner:null;
        c.previousOwner=saved.previousOwner;c.pickupAfter=saved.pickupAfter;c.missileOwner=saved.missileOwner;
        c.returningUntil=saved.returningUntil;c.looseSince=time;this.scaleCase(c.owner?1:CASE_LOOSE_SCALE,c);
        c.ping=c.owner&&saved.ping?{at:saved.ping.at,p:{...saved.ping.p}}:undefined;
        // A restored case is never mid-flight; the checkpoint carries its velocity.
        c.launched=false;
        c.body.position.copy(vec(saved.p));c.body.velocity.copy(vec(saved.v));c.body.angularVelocity.copy(vec(saved.spin));
        Object.assign(c.body.quaternion,saved.q);
        c.body.type=c.owner?C.Body.KINEMATIC:C.Body.DYNAMIC;
        c.body.collisionFilterMask=c.owner?16:1|8|16;
        c.body.updateMassProperties();c.body.updateAABB();
        c.armed=this.incidentActive('evidence-tampering')&&!c.owner;
    }
    private restore(s:ChaosState){
        // Room hibernation/reconnection must not restock consumed supplies early.
        for(const saved of s.pickups??[]){
            const site=this.pickups.get(saved.id);
            if(site&&(saved.kind==='quick-fix')===(site.kind==='quick-fix')&&Number.isFinite(saved.availableAt)){site.kind=saved.kind;site.availableAt=Math.max(0,saved.availableAt!);}
        }
        const assignment=restoreAssignment(s.assignment,Date.now());if(assignment)this.setAssignment(assignment);
        // Pressure is kept through a restore (it never leaks), including a machine
        // hanging full. Checkpoints from before the pressure model have none.
        const saved=s.pressure;
        this.pressure={serial:saved?.serial||0,levels:{...saved?.levels},launches:[],
            ...(saved?.blowing?{blowing:{...saved.blowing}}:{}),...(saved?.fired?{fired:{...saved.fired}}:{}),...(saved?.boosts?{boosts:{...saved.boosts}}:{}),
            ...(saved?.vents?.length?{vents:saved.vents.map(v=>({...v}))}:{})};
        for(const vent of this.pressure.vents??[])if(vent.at>s.time)this.pendingVents.add(vent.id);
        // Carry on the same surge: fresh vent ids after the restored ones, and no second finale.
        const surging=s.dispatch.phase==='active'&&s.dispatch.incident==='pressure-surge';
        this.surge={serial:s.dispatch.serial,finale:surging&&s.time>=s.dispatch.until-SURGE.finaleMs?s.dispatch.serial:-1,nextWave:0,nextSuction:0,
            vents:1+Math.max(-1,...(this.pressure.vents??[]).map(v=>Number(v.id.split('-').pop())).filter(Number.isFinite))};
        this.now=s.time;this.dispatch={...s.dispatch,...(s.dispatch.incident?{incident:incidentInfo(s.dispatch.incident).id}:{})};
        this.possession={...s.possession};this.notice={...s.notice};this.restoreCase(this.primaryCase,s.case,s.time);
        this.casesWeaponized=this.incidentActive('evidence-tampering')&&s.dispatch.until>Date.now();
        if(this.casesWeaponized){
            for(const id of EXTRA_CASE_IDS){
                const c=this.createCase(id),saved=s.extraCases?.find(c=>c.id===id);
                if(saved)this.restoreCase(c,saved,s.time);else this.placeCaseAtSpawn(c);
            }
            for(const c of this.cases.values()){
                if(c.owner)this.releaseCase(c);
                c.armed=true;
                if(c.body.velocity.length()<12)this.launchCaseMissile(c);
                else {c.body.type=C.Body.KINEMATIC;c.body.collisionFilterMask=16;c.body.wakeUp();}
            }
        }
        const elapsed=Math.max(0,(Date.now()-s.time)/1000);
        this.shots=s.shots.filter(shot=>shot.age+elapsed<shotLife(shot)).map(shot=>({...shot,p:{...shot.p},v:{...shot.v},age:shot.age+elapsed}));
        for(const c of s.corpses){
            if(c.expires<=Date.now())continue;
            const body=new C.Body({mass:2,shape:new C.Box(new C.Vec3(.48,.92,.38)),
                position:vec(c.p),collisionFilterGroup:8,collisionFilterMask:1|4|8|16,linearDamping:.015,angularDamping:.04});
            Object.assign(body.quaternion,c.q);body.velocity.copy(vec(c.v));body.angularVelocity.copy(vec(c.spin));this.addCorpse(body,c);
        }
        if(elapsed>2&&!this.assignment)for(const c of this.cases.values())if(!c.owner)c.returningUntil=Date.now()+T.recoverMs;
        if(this.assignment?.state.phase==='suspended'&&!this.casesWeaponized)this.restoreObjectiveApproach(this.primaryCase);
        // A trap leaves with its owner: one whose owner has left is not restored.
        for(const saved of (s.traps??[]).slice(0,MAX_TRAPS))if(saved.brokenAt===undefined&&saved.hp>0&&this.players.has(saved.owner))this.addTrap({...saved});
        this.trapSerial=Math.max(0,...(s.traps??[]).map(t=>Number(t.id.split('-').pop())).filter(Number.isFinite));
    }
}
