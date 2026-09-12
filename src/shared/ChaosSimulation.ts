import * as C from 'cannon-es';
import {resolveShotPattern} from './shotPattern';
import type {WorldFoleyCue} from './foleyEvents';
import { SpatialRayQuery } from './SpatialRayQuery';
import { StaticCityBroadphase } from './StaticCityBroadphase';
import { launcherVelocity } from './launcherVelocity';
import { incidentInfo, incidentRoster, type EvidenceMode, type IncidentId } from './incidentCatalog';
import { CITY_BOUNDS, grayboxBoxes } from './grayboxLayout';
import { isReachableLandmarkPosition } from './landmarkLayout';
import { isReachableVehiclePosition } from './vehicleLayout';
import { BALL_SPEED, BALL_GRAVITY, BALL_RESTITUTION, BALL_LIFETIME, BALL_RADIUS } from './ballTuning';
import { CASE_HOME, CASE_HAND, CASE_CARRY_ROTATION, CASE_SIZE, CASE_LOOSE_SCALE, CASE_SPAWNS, EXTRA_CASE_IDS, CHAOS_TUNING as T, INCIDENT_TUNING as I, DISPATCH_STATIONS, PRESSURE_LAUNCH, LAUNCH_MACHINES, MAX_LAUNCH_EVENTS,
    COUNTERFEIT_IDS,
    type CaseState, type ChaosState, type ChaosShot, type CorpseState, type PhysicalPose } from './chaosState';
import { hasIronclad, mergePickup, activeBuffs, buffExpired, PICKUP_TUNING, resolvePickupPoints,
    type BuffMap, type PickupKind, type PickupPoint } from './pickups';
import type { WorldSpec } from './worldSpec';
import { worldSpawnPoints } from './playerSpawns';
import { MAX_HP, type PlayerData, type ShotDescriptor, type Vec3Data } from './networkProtocol';
import { AssignmentRules } from './AssignmentRules';
import { activeDestination, ASSIGNMENT_DESTINATIONS, destinationPoint, restoreAssignment, type AssignmentState, type DestinationId } from './assignments';

const caseCarryRotation=new C.Quaternion(CASE_CARRY_ROTATION.x,CASE_CARRY_ROTATION.y,CASE_CARRY_ROTATION.z,CASE_CARRY_ROTATION.w);

const outsideCity=(x:number,z:number)=>x<CITY_BOUNDS.min||x>CITY_BOUNDS.max||z<CITY_BOUNDS.min||z>CITY_BOUNDS.max;

const vec=(v:Vec3Data)=>new C.Vec3(v.x,v.y,v.z);
const data=(v:Vec3Data)=>({x:v.x,y:v.y,z:v.z});
const pose=(b:C.Body):PhysicalPose=>({p:data(b.position),q:{x:b.quaternion.x,y:b.quaternion.y,z:b.quaternion.z,w:b.quaternion.w},v:data(b.velocity),spin:data(b.angularVelocity)});
const shotRadius=(shot:ChaosShot)=>shot.radius??BALL_RADIUS;
type Target = { kind:'world'|'case'|'dispatch'|'pressure'|'corpse'|'rat'; player?:PlayerData; head?:C.Shape; corpseId?:string; machineId?:string; caseId?:string };
interface CaseRuntime {
    id:string;body:C.Body;owner:string|null;previousOwner:string|null;missileOwner?:string;
    hitAfter:Map<string,number>;pickupAfter:number;returningUntil:number;looseSince:number;
    scale:number;lastSpawn:Vec3Data;armed:boolean;
    /** Planted Evidence counterfeit: a hazard that never equips or grants objective status. */
    fake:boolean;
}
/** null ownership is an environmental Tampering hit, including neutral chains. */
export interface ChaosHit { owner:string|null; victim:string; damage:number; incoming:Vec3Data }
/** A pickup claim the room must announce. Healing is drained so the room can
 * persist and broadcast the restored health without the sim owning networking. */
export type PickupEvent =
    | { kind:'collected'; pickupId:string; pickup:PickupKind; playerId:string }
    | { kind:'healed'; playerId:string; hp:number };
/** One authoritative simulation, also usable by the solo preview. No rendering or DOM. */
export class ChaosSimulation {
    readonly world = new C.World({gravity:new C.Vec3(0,-25,0)});
    private primaryCase!:CaseRuntime;
    private readonly cases=new Map<string,CaseRuntime>();
    get caseBody():C.Body{return this.primaryCase.body;}
    private readonly rayQuery=new SpatialRayQuery(this.world);
    readonly targets=new Map<C.Body,Target>();
    private rats=new Map<string,C.Body>();
    private readonly pickupApproaches=new Map<string,{p:C.Vec3;at:number}>();
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
    private pickupPoints?:PickupPoint[];
    private possession:Record<string,number>={};
    private dispatch:ChaosState['dispatch']={phase:'ready',started:0,until:0,serial:0};
    private lastSurgePulse=0;
    private casesWeaponized=false;
    private plantedSerial:number|undefined;
    private dispatchActivator:string|null=null;
    /** Room-selected evidence incident. Defaults to the shipped Planted Evidence. */
    evidenceMode:EvidenceMode='planted';
    /** Practice-only override: force every roll to one incident id. */
    forcedIncident:IncidentId|null=null;
    private pressure:NonNullable<ChaosState['pressure']>={serial:0,until:0,cooldowns:{},launches:[]};
    private notice={serial:0,text:'Find the Hot Case. Shoot Dispatch.'};
    private now=Date.now();
    get time():number{return this.now;}
    private assignment?:AssignmentRules;
    get assignmentState():AssignmentState|undefined{return this.assignment?.state;}
    setAssignment(state:AssignmentState):void{this.assignment=new AssignmentRules(structuredClone(state),this.players);}
    private hit(hit:ChaosHit):void{if(!this.assignment?.closed)this.onHit(hit);}
    get caseHolderId():string|null{return this.primaryCase.owner;}
    /** Called synchronously by authoritative damage resolution, never at launch. */
    creditCaseKill(killerId:string|null):boolean {
        if(killerId===null || this.casesWeaponized || this.primaryCase.returningUntil)return false;
        return this.assignment?.kill(killerId,this.primaryCase.owner,this.now)??false;
    }
    isCaseHolder(id:string):boolean{for(const c of this.cases.values())if(c.owner===id)return true;return false;}
    constructor(private players:Map<string,PlayerData>,private onHit:(hit:ChaosHit)=>void, saved?:ChaosState, spec?:WorldSpec) {
        // The city is mostly static boxes; sweep-and-prune avoids testing every
        // static pair whenever a case or corpse moves.
        this.world.broadphase=new StaticCityBroadphase(this.world);
        this.world.broadphase.useBoundingBoxes=true;
        this.world.defaultContactMaterial.friction=.15;
        this.world.defaultContactMaterial.restitution=.72;
        for(const b of grayboxBoxes(spec)){
            const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(b.w/2,b.h/2,b.d/2))});
            body.position.set(b.x,b.y,b.z);body.quaternion.setFromEuler(b.rx,0,b.rz);body.updateAABB();
            this.world.addBody(body);this.targets.set(body,{kind:'world'});
        }
        for(const station of DISPATCH_STATIONS){
            this.addControl(station.box,'world');this.addControl(station.target,'dispatch');
        }
        for(const machine of LAUNCH_MACHINES){
            this.addControl(machine.box,'world');this.addControl(machine.target,'pressure',machine.id);
        }
        this.seedPickups(spec);
        this.primaryCase=this.createCase('primary');
        if(saved)this.restore(saved);else this.placeCaseAtSpawn();
    }
    /** Keep rewards on their authored supported floor; street medkits use the
     * world's clear spawn pavement. No unsupported reward is forced into geometry. */
    private seedPickups(spec?:WorldSpec):void{
        let clear:readonly Vec3Data[];
        try{clear=spec?worldSpawnPoints(spec):CASE_SPAWNS;}catch{clear=CASE_SPAWNS;}
        this.pickupPoints=resolvePickupPoints(clear,14,p=>{
            const ray=(from:C.Vec3,to:C.Vec3)=>{const hit=new C.RaycastResult();this.world.raycastClosest(from,to,{collisionFilterMask:1},hit);return hit;};
            const foot=p.y-.7;
            // Rays starting inside a shelf can miss every face. Check the whole
            // rat/prop volume against static boxes before testing floor support.
            const local=new C.Vec3(),point=new C.Vec3();
            for(const body of this.world.bodies){
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
        });
        for(const point of this.pickupPoints)this.pickups.set(point.id,{kind:point.kind,p:{...point.p},availableAt:0});
    }
    private createCase(id:string,fake=false):CaseRuntime{
        const body=new C.Body({mass:1.5,shape:new C.Box(new C.Vec3(CASE_SIZE.x/2,CASE_SIZE.y/2,CASE_SIZE.z/2)),
            position:vec(CASE_HOME),collisionFilterGroup:4,collisionFilterMask:1|8|16,linearDamping:.2,angularDamping:.25});
        body.addShape(new C.Box(new C.Vec3(.15,.035,.04)),new C.Vec3(0,.43,0));
        for(const x of [-.12,.12])body.addShape(new C.Box(new C.Vec3(.0275,.065,.04)),new C.Vec3(x,.36,0));
        const c:CaseRuntime={id,body,owner:null,previousOwner:null,hitAfter:new Map(),pickupAfter:0,
            returningUntil:0,looseSince:this.now,scale:1,lastSpawn:CASE_HOME,armed:false,fake};
        // A counterfeit is planted, not thrown: park it exactly where it was placed
        // so a validated spawn can never drift into geometry or a passing rat.
        if(fake){body.type=C.Body.STATIC;body.mass=0;body.collisionFilterMask=16;body.updateMassProperties();}
        this.world.addBody(body);this.targets.set(body,{kind:'case',caseId:id});this.cases.set(id,c);
        this.listenForContacts(body,'case-bounce');
        this.scaleCase(CASE_LOOSE_SCALE,c);return c;
    }
    private syncExtraCases(){
        if(this.incidentActive('evidence-tampering')){
            this.dropFakes();
            for(const id of EXTRA_CASE_IDS)if(!this.cases.has(id))this.placeCaseAtSpawn(this.createCase(id));
        }else if(this.incidentActive('planted-evidence')){
            // Leave no weaponized missiles behind if the mode changed mid-room.
            for(const [id,c] of [...this.cases])if(id!=='primary'&&!c.fake)this.removeCaseBody(id,c);
            if(this.plantedSerial!==this.dispatch.serial){
                this.plantedSerial=this.dispatch.serial;
                for(const id of COUNTERFEIT_IDS)if(!this.cases.has(id))this.placeFake(this.createCase(id,true));
            }
        }else {this.plantedSerial=undefined;this.dropExtras();}
    }
    private removeCaseBody(id:string,c:CaseRuntime):void{
        this.world.removeBody(c.body);this.targets.delete(c.body);this.cases.delete(id);
    }
    /** Quietly retire every extra case or counterfeit without an unannounced detonation. */
    private dropExtras():void{for(const [id,c] of [...this.cases])if(id!=='primary')this.removeCaseBody(id,c);}
    private dropFakes():void{for(const [id,c] of [...this.cases])if(id!=='primary'&&c.fake)this.removeCaseBody(id,c);}
    private placeFake(c:CaseRuntime):void{
        this.rayQuery.refresh();
        const walls=[...this.targets].filter(([,target])=>target.kind==='world');
        for(const [body] of walls)body.updateAABB();
        const clear=CASE_SPAWNS.filter(p=>{
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
        const apart=clear.filter(p=>![...this.cases.values()].some(other=>other!==c&&Math.hypot(other.body.position.x-p.x,other.body.position.z-p.z)<10));
        let available=apart.length?apart:clear;
        // Never arm a trap inside a living rat's contact range: every player needs
        // a chance to see it and choose to shoot it, walk around, or risk it.
        const unoccupied=available.filter(p=>![...this.players.values()].some(r=>r.hp>0&&Math.hypot(r.x-p.x,r.y-p.y,r.z-p.z)<12));
        if(unoccupied.length)available=unoccupied;
        const candidates=available.filter(p=>p.x!==c.lastSpawn.x||p.z!==c.lastSpawn.z);
        const pool=candidates.length?candidates:available;
        const spawn=pool.length?pool[Math.floor(Math.random()*pool.length)]:CASE_HOME;
        c.lastSpawn=spawn;c.body.position.copy(vec(spawn));c.body.velocity.setZero();c.body.angularVelocity.setZero();c.body.updateAABB();
    }
    /** One counterfeit detonates once. Emitted balls keep the initiating shot's
     * ownership; a contact trap uses neutral attribution and kills its collector. */
    private detonateFake(c:CaseRuntime,owner:string|null,killerId?:string):void{
        if(!this.cases.has(c.id))return;
        const origin=c.body.position.clone();
        this.removeCaseBody(c.id,c);
        this.cheeseBurst(data(origin),owner);
        this.impacts.push({p:data(origin),n:{x:0,y:1,z:0},surface:false,scale:2.6,cue:'case-hit'});
        if(killerId){
            // The trap is a world hazard, not a player kill: no self-kill credit and
            // no invented credit to whoever happened to be carrying the real case.
            this.hit({owner:null,victim:killerId,damage:MAX_HP,incoming:{x:0,y:1,z:0}});
        }
    }
    /** Living rats that step into a counterfeit's close range trigger the lethal trap. */
    private stepFakes(playing:boolean):void{
        if(!playing||!this.incidentActive('planted-evidence'))return;
        for(const c of [...this.cases.values()]){
            if(!c.fake||c.owner)continue;
            const p=c.body.position;
            for(const player of this.players.values()){
                if(player.hp<=0)continue;
                const reach=new C.Vec3(player.x,player.y+.8,player.z);
                if(reach.distanceTo(p)>PICKUP_TUNING.claimRadius)continue;
                this.detonateFake(c,null,player.id);break;
            }
        }
    }
    /** Claim one available pickup at a time. The claim is atomic inside the single
     * authoritative loop, so two rats reaching together can never both receive it. */
    private stepPickups(now:number,playing:boolean):void{
        for(const [id,entry] of Object.entries(this.buffs)){
            const player=this.players.get(id);
            if(!player||player.hp<=0||buffExpired(entry,now))delete this.buffs[id];
        }
        if(!playing)return;
        for(const [id,site] of this.pickups){
            if(now<site.availableAt)continue;
            for(const player of this.players.values()){
                if(player.hp<=0)continue;
                if(site.kind==='quick-fix'&&player.hp>=MAX_HP)continue;
                const reach=new C.Vec3(player.x,player.y+.8,player.z);
                if(reach.distanceTo(vec(site.p))>PICKUP_TUNING.claimRadius)continue;
                if(site.kind==='quick-fix'){
                    player.hp=MAX_HP;
                    this.pickupEvents.push({kind:'healed',playerId:player.id,hp:player.hp});
                }else this.buffs[player.id]=mergePickup(this.buffs[player.id],site.kind,now);
                site.availableAt=now+PICKUP_TUNING.respawnMs;
                this.pickupEvents.push({kind:'collected',pickupId:id,pickup:site.kind,playerId:player.id});
                // Feedback travels with the claim; the room may announce it and the
                // client's local audio reads the existing impact channel.
                this.impacts.push({p:{...site.p},n:{x:0,y:1,z:0},surface:false,scale:1.4,audioOnly:true});
                break;
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
        const roster=incidentRoster(this.evidenceMode);
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
        this.world.addBody(body);this.targets.set(body,{kind,machineId});
    }
    private activatePressure(machineId:string,surge=false){
        const machine=LAUNCH_MACHINES.find(m=>m.id===machineId);
        if(!machine)return;
        const cooldowns=this.pressure.cooldowns??(this.pressure.cooldowns={});
        if(!surge&&this.now<(cooldowns[machine.id]??0))return;
        const pad=machine.pad;
        const nearby=[...this.players.values()].filter(p=>p.hp>0 && Math.abs(p.y-pad.y)<2 &&
            Math.hypot(p.x-pad.x,p.z-pad.z)<=pad.radius);
        // Fire even when empty: seeing the remote mechanism activate teaches
        // players which launcher this trigger operates. Occupants alone receive impulses.
        this.pressure.serial++;cooldowns[machine.id]=this.now+machine.cooldownMs;
        this.pressure.until=cooldowns[PRESSURE_LAUNCH.id]??0;
        // Keep other stations' outstanding events. A rat can only occupy one pad,
        // and its newest impulse replaces an older event if launched again.
        const selected=new Set(nearby.map(p=>p.id));
        const velocity=launcherVelocity(machine);
        this.pressure.launches=[...this.pressure.launches.filter(e=>!selected.has(e.playerId)),
            ...nearby.map(player=>({id:`launch-${this.pressure.serial}-${player.id}`,machineId:machine.id,
                playerId:player.id,at:this.now,velocity:{...velocity}}))].slice(-MAX_LAUNCH_EVENTS);
    }
    private tell(text:string){this.notice={serial:this.notice.serial+1,text};}
    private incidentActive(id:IncidentId){return this.dispatch.phase==='active'&&incidentInfo(this.dispatch.incident).id===id;}
    private activate(owner?:string|null){
        if(this.dispatch.phase!=='ready')return;
        const previous=this.dispatch.incident??(this.dispatch.serial>0?incidentInfo().id:undefined);
        const roster=incidentRoster(this.evidenceMode);
        // A forced practice roll may repeat; a normal roll keeps the no-repeat rule.
        const forced=this.forcedIncident&&roster.some(incident=>incident.id===this.forcedIncident)?this.forcedIncident:undefined;
        const choices=roster.filter(incident=>incident.id!==previous);
        const incident=forced??choices[Math.floor(Math.random()*choices.length)].id;
        this.dispatch={phase:'rolling',started:this.now,until:this.now+T.rollMs,serial:this.dispatch.serial+1,incident};
        this.lastSurgePulse=0;
        this.dispatchActivator=owner&&this.players.has(owner)?owner:null;
    }
    private reserveShots(count:number){
        while(this.shots.length>T.maxShots-count){
            const burst=this.shots.findIndex(s=>this.burstShots.has(s));
            this.shots.splice(burst<0?0:burst,1);
        }
    }
    private roomForShot(){
        this.reserveShots(1);return this.shots.length<T.maxShots;
    }
    private emitShot(owner:string,origin:Vec3Data,velocity:C.Vec3,id:string=crypto.randomUUID(),extra:Partial<ChaosShot>={}){
        if(!this.roomForShot())return undefined;
        const shot:ChaosShot={id,owner,p:{...origin},v:data(velocity),age:0,...extra};
        this.shots.push(shot);return shot;
    }
    private originalShot():Partial<ChaosShot>{
        return {original:true,...(this.incidentActive('popcorn-panic')?{popAt:this.now+I.popcornPulseMs}:{})};
    }
    private aimJitter(direction:C.Vec3,spread:number){
        const axis=Math.abs(direction.y)<.95?new C.Vec3(0,1,0):new C.Vec3(1,0,0);
        const side=direction.cross(axis);side.normalize();
        const up=side.cross(direction);up.normalize();
        const yaw=(Math.random()*2-1)*spread,pitch=(Math.random()*2-1)*spread*.35;
        const aimed=direction.scale(Math.cos(yaw)*Math.cos(pitch)).vadd(side.scale(Math.sin(yaw))).vadd(up.scale(Math.sin(pitch)));
        aimed.normalize();return aimed;
    }
    shoot(owner:string,shot:ShotDescriptor):ChaosShot[]{
        if(!this.players.get(owner)||this.players.get(owner)!.hp<=0)return [];
        const incident=this.dispatch.phase==='active'?incidentInfo(this.dispatch.incident).id:undefined;
        const pattern=resolveShotPattern(shot,incident),fired:ChaosShot[]=[];
        this.reserveShots(pattern.length);
        for(const ball of pattern){
            const emitted=this.emitShot(owner,shot.origin,vec(ball.velocity),ball.id,this.originalShot());
            if(emitted)fired.push(emitted);
        }
        return fired;
    }

    private syncRats(){
        for(const [id,b] of this.rats)if(!this.players.has(id)||this.players.get(id)!.hp<=0){
            this.world.removeBody(b);this.targets.delete(b);this.rats.delete(id);
        }
        for(const [id,p] of this.players){
            if(p.hp<=0)continue;
            let b=this.rats.get(id);
            if(!b){
                b=new C.Body({mass:0,type:C.Body.KINEMATIC,collisionFilterGroup:2,collisionFilterMask:16});
                b.addShape(new C.Sphere(.6),new C.Vec3(0,.6,0));
                b.addShape(new C.Sphere(.45),new C.Vec3(0,1.3,0));
                const head=new C.Sphere(.28);b.addShape(head,new C.Vec3(0,1.9,0));
                this.rats.set(id,b);this.targets.set(b,{kind:'rat',player:p,head});this.world.addBody(b);
            }
            b.position.set(p.x,p.y,p.z);b.updateAABB();
        }
    }
    private carry(p:PlayerData,c=this.primaryCase){
        this.scaleCase(1,c);
        c.missileOwner=undefined;c.hitAfter.clear();c.armed=false;
        const q=new C.Quaternion(p.meshQx,p.meshQy,p.meshQz,p.meshQw);q.normalize();
        q.vmult(vec(CASE_HAND),c.body.position);
        c.body.position.vadd(new C.Vec3(p.x,p.y,p.z),c.body.position);
        q.mult(caseCarryRotation,c.body.quaternion);c.body.velocity.setZero();c.body.angularVelocity.setZero();
        c.body.type=C.Body.KINEMATIC;c.body.collisionFilterMask=16;c.body.updateAABB();
    }
    release(id:string,incoming?:Vec3Data){
        for(const c of this.cases.values())if(c.owner===id)this.releaseCase(c,incoming);
    }
    private releaseCase(c:CaseRuntime,incoming?:Vec3Data){
        if(!c.owner)return;
        const id=c.owner;c.owner=null;this.scaleCase(CASE_LOOSE_SCALE,c);
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
        this.release(id);delete this.possession[id];
        if(this.dispatchActivator===id)this.dispatchActivator=null;
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
    death(victim:PlayerData,incoming:Vec3Data,owner:string|null=victim.id):boolean{
        this.release(victim.id,incoming);
        const incident=this.incidentActive('improper-disposal');
        if(this.corpses.size>=T.maxCorpses){const first=this.corpses.keys().next().value;if(first)this.removeCorpse(first);}
        const direction=vec(incoming);if(direction.lengthSquared()<.01)direction.set(0,0,1);direction.normalize();
        const body=new C.Body({mass:2,shape:new C.Box(new C.Vec3(.48,.92,.38)),
            position:new C.Vec3(victim.x,victim.y+.95,victim.z),collisionFilterGroup:8,collisionFilterMask:1|4|16,
            linearDamping:.015,angularDamping:.04});
        body.quaternion.set(victim.meshQx,victim.meshQy,victim.meshQz,victim.meshQw);body.quaternion.normalize();
        direction.scale(incident?T.corpseSpeed:T.normalCorpseSpeed,body.velocity);body.angularVelocity.set(direction.z*15,5,-direction.x*15);
        const state:CorpseState={id:crypto.randomUUID(),victimId:victim.id,owner,appearance:{
            hatType:victim.hatType,hatColor:victim.hatColor,furColor:victim.furColor,coatColor:victim.coatColor
        },born:this.now,expires:this.now+T.corpseMs,...pose(body)};
        this.addCorpse(body,state);
        if(incident)this.deathBurst(state);return true;
    }
    private deathBurst(corpse:CorpseState){
        this.cheeseBurst(corpse.p,corpse.owner===undefined?corpse.victimId:corpse.owner);
    }
    /** Identical radial eruption for Improper Disposal and Planted Evidence. */
    private cheeseBurst(origin:Vec3Data,owner:string|null):void {
        this.sound('burst',origin);
        // Shared global shot capacity and fixed lifetime bound even a chain reaction.
        // Start inside the body so rays leave it without striking an artificial shell.
        for(let i=0;i<T.deathBurstBalls && this.shots.length<T.maxShots;i++){
            const angle=i*Math.PI*2/T.deathBurstBalls;
            const direction=new C.Vec3(Math.cos(angle),.12+(i%3)*.12,Math.sin(angle));direction.normalize();
            direction.scale(BALL_SPEED,direction);
            const shot:ChaosShot={id:crypto.randomUUID(),owner,
                p:{...origin},v:data(direction),age:0,original:false,radius:BALL_RADIUS};
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
        const missiles=[...this.cases.values()].filter(c=>this.caseDangerous(c));
        const caseMotion=missiles.map(c=>({c,p:c.body.position.clone(),v:c.body.velocity.clone()}));
        // Weaponized cases have their own continuous sweep. They must not force
        // extra Cannon steps or repeat all nine world rays on every substep.
        const fastest=Math.max(0,...[...this.cases.values()].filter(c=>!c.owner&&!this.caseDangerous(c)).map(c=>c.body.velocity.length()),...[...this.corpses.values()].map(c=>c.body.velocity.length()));
        const substeps=Math.max(1,Math.min(4,Math.ceil(fastest*dt/.8)));
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
                    this.hit({owner,victim:player.id,damage:v.length()>55?2:1,incoming:data(v)});
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
            this.hit({owner:null,victim:player.id,damage:velocity.length()>=28?3:1,incoming:data(velocity)});
            this.impacts.push({p:data(center),n:data(velocity.unit()),surface:false,cue:'thud'});
        }
    }
    private launchCaseMissile(c:CaseRuntime,incoming?:C.Vec3){
        c.armed=true;c.hitAfter.clear();c.returningUntil=0;
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
        body.velocity.y=Math.min(I.caseMaxLift,body.velocity.y);
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
            body.velocity.scale(BALL_RESTITUTION,body.velocity);
            if(normal.y>.65)body.velocity.y=Math.max(I.caseBounceLift,Math.min(I.caseMaxLift,body.velocity.y));
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
        const lateral=Math.hypot(body.velocity.x,body.velocity.z);
        if(lateral<I.caseRicochetMinSpeed){
            const yaw=lateral>.01?Math.atan2(body.velocity.z,body.velocity.x):Math.atan2(c.body.angularVelocity.x,-c.body.angularVelocity.z);
            body.velocity.x=Math.cos(yaw)*I.caseRicochetMinSpeed;body.velocity.z=Math.sin(yaw)*I.caseRicochetMinSpeed;
        }
        body.updateAABB();
    }
    private removeCorpse(id:string){const c=this.corpses.get(id);if(c){this.world.removeBody(c.body);this.targets.delete(c.body);this.corpses.delete(id);}}
    private ray(from:C.Vec3,to:C.Vec3,mask:number){
        return this.rayQuery.closest(from,to,mask);
    }
    private nextCheeseRadius(current:number){
        for(const radius of I.cheeseRadii)if(radius>current+.001)return radius;
        return I.cheeseRadii[I.cheeseRadii.length-1];
    }
    private unstickShot(shot:ChaosShot){
        const radius=shotRadius(shot),origin=vec(shot.p);
        for(const dir of [new C.Vec3(1,0,0),new C.Vec3(-1,0,0),new C.Vec3(0,1,0),new C.Vec3(0,-1,0),new C.Vec3(0,0,1),new C.Vec3(0,0,-1)]){
            const hit=this.ray(origin,origin.vadd(dir.scale(radius+.05)),1);
            if(!hit.hasHit)continue;
            const overlap=radius-hit.distance+.04;
            if(overlap>0)origin.vadd(hit.hitNormalWorld.scale(overlap),origin);
        }
        shot.p=data(origin);
    }
    private growShot(shot:ChaosShot){
        if(!this.incidentActive('big-cheese'))return;
        const next=this.nextCheeseRadius(shotRadius(shot));
        if(next<=shotRadius(shot)+.001)return;
        shot.radius=next;this.unstickShot(shot);
    }
    private popShot(shot:ChaosShot){
        const children=I.popcornChildren;
        const live=this.shots.length;
        const spawn=Math.min(children,T.maxShots-(live-1));
        if(spawn<2){shot.popAt=this.now+180;return;}
        const index=this.shots.indexOf(shot);
        if(index>=0)this.shots.splice(index,1);
        const forward=vec(shot.v);const speed=Math.max(BALL_SPEED*.8,forward.length()||BALL_SPEED);
        const dir=forward.lengthSquared()<.01?new C.Vec3(0,1,0):forward.unit();
        this.impacts.push({p:{...shot.p},n:{x:0,y:1,z:0},surface:true,scale:2.4,cue:'pop'});
        for(let i=0;i<spawn;i++){
            const yaw=(i-(spawn-1)/2)*.34;
            const rotation=new C.Quaternion();rotation.setFromAxisAngle(new C.Vec3(0,1,0),yaw);
            const spread=this.aimJitter(rotation.vmult(dir),.22);
            spread.y=Math.max(.42,spread.y+.55+(i%2)*.12);spread.normalize();spread.scale(speed,spread);
            const child:ChaosShot={id:crypto.randomUUID(),owner:shot.owner,p:{...shot.p},v:data(spread),age:shot.age,
                original:false,radius:BALL_RADIUS*.72,wallBounced:shot.wallBounced,delayed:shot.delayed};
            this.burstShots.add(child);this.shots.push(child);
        }
    }
    private reflect(shot:ChaosShot,normal:C.Vec3){
        const v=vec(shot.v);v.vadd(normal.scale(-2*v.dot(normal)),v);v.scale(BALL_RESTITUTION,v);shot.v=data(v);return v;
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
        const cuts=[from,...[start,end,rules.state.liveAt].filter(t=>t>from&&t<now),now].sort((a,b)=>a-b);
        for(let i=0;i<cuts.length-1;i++){
            const a=cuts[i],b=cuts[i+1];
            rules.setPhase(a,a>=start&&a<end);
            if(playing)rules.advance(a,b,this.primaryCase.returningUntil?null:this.primaryCase.owner);
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
            const next=activeDestination(rules.state);
            this.tell(`PAPERWORK DELIVERED! ${holder.name} · ${rules.state.deliveries[holder.id]}/3 · CASE RELOCATED · NEXT: ${next?ASSIGNMENT_DESTINATIONS[next].label:''}`);
        }
    }
    step(dt:number,now:number,playing=true){
        this.now=now;this.syncRats();this.rayQuery.refresh();
        this.advanceAssignment(dt,now,playing);
        playing=playing&&!this.assignment?.closed;
        this.pressure.launches=this.pressure.launches.filter(event=>now-event.at<=PRESSURE_LAUNCH.eventMs);
        // A restored room can cross multiple deadlines while asleep. Advance
        // without briefly applying an incident whose active window already ended.
        for(let transition=0;transition<3;transition++){
            const d=this.dispatch;
            if(d.phase==='ready'||now<d.until)break;
            if(d.phase==='rolling')this.dispatch={...d,phase:'active',started:d.until,until:d.until+T.activeMs};
            else if(d.phase==='active')this.dispatch={...d,phase:'cooldown',started:d.until,until:d.until+T.cooldownMs};
            else this.dispatch={...d,phase:'ready',started:now,until:0};
        }
        const weaponized=this.incidentActive('evidence-tampering');
        if(weaponized&&!this.casesWeaponized)this.beginEvidenceTampering();
        else if(!weaponized&&this.casesWeaponized)this.endEvidenceTampering();
        if(playing&&this.incidentActive('pressure-surge')){
            const pulse=Math.floor(Math.max(0,now-this.dispatch.started)/3000);
            if(pulse>this.lastSurgePulse){
                // One synchronized citywide pulse; never replay missed pulses after a pause.
                this.lastSurgePulse=pulse;
                for(const machine of LAUNCH_MACHINES)this.activatePressure(machine.id,true);
            }
        }
        if(playing&&this.incidentActive('popcorn-panic')){
            for(const shot of this.shots){
                if(!shot.original||shot.stuckUntil)continue;
                if(!shot.popAt)shot.popAt=now+I.popcornPulseMs;
            }
            const due=this.shots.filter(shot=>shot.original&&shot.popAt&&shot.popAt<=now&&!shot.stuckUntil);
            for(const shot of due)this.popShot(shot);
        }else for(const shot of this.shots)shot.popAt=undefined;
        if(!this.incidentActive('delayed-reaction')){
            for(const shot of this.shots)if(shot.stuckUntil){shot.stuckUntil=undefined;this.unstickShot(shot);this.sound('unstick',shot.p);}
        }
        if(!this.incidentActive('big-cheese')){
            for(const shot of this.shots)if((shot.radius??BALL_RADIUS)>BALL_RADIUS+.001){shot.radius=BALL_RADIUS;this.unstickShot(shot);}
        }
        this.syncExtraCases();
        for(const c of this.cases.values())this.updateCase(c,dt,playing);
        this.stepPickups(now,playing);
        this.stepFakes(playing);
        // Small physical steps keep the theatrical bodies within their collision surfaces.
        this.stepBodies(dt,playing);
        for(const b of this.world.bodies)if(b.type!==C.Body.STATIC)b.updateAABB();
        for(let i=this.shots.length-1;i>=0;i--){
            const shot=this.shots[i];shot.age+=dt;
            if(shot.age>BALL_LIFETIME){this.shots.splice(i,1);continue;}
            if(shot.stuckUntil){
                if(now<shot.stuckUntil)continue;
                shot.stuckUntil=undefined;this.unstickShot(shot);this.sound('unstick',shot.p);
            }
            shot.v.y+=BALL_GRAVITY*dt;
            const radius=shotRadius(shot);
            const from=vec(shot.p),motion=vec(shot.v).scale(dt),to=from.vadd(motion);
            const travel=motion.length()||1;
            const large=radius>BALL_RADIUS+.02;
            // Skip the shooter's body AND their carried case before choosing a
            // contact, including banked and enlarged rounds. Walls behind them
            // must still be hit; ownership changes apply on the very next sweep.
            const acceptsShot=(body:C.Body)=>{
                const target=this.targets.get(body);
                return !(shot.owner && (target?.player?.id===shot.owner ||
                    target?.kind==='case' && this.cases.get(target.caseId??'primary')?.owner===shot.owner));
            };
            const hit=large?this.rayQuery.sphere(from,to,radius,1|2|4|8,acceptsShot):this.rayQuery.closest(from,to,1|2|4|8,acceptsShot);
            const target=hit.body?this.targets.get(hit.body):undefined;
            const stop=large?radius+.01:.05;
            const contact=hit.hasHit?Math.max(0,hit.distance-(large?0:stop)):travel;
            const worldHit=hit.hasHit&&contact<=travel+.0001&&target?.player?.id!==shot.owner;
            if(!worldHit){shot.p=data(to);continue;}
            const normal=hit.hitNormalWorld,point=hit.hitPointWorld.vadd(normal.scale(stop));
            shot.p=data(point);
            const incoming={...shot.v};
            if(target?.kind==='rat' && target.player && target.player.hp>0){
                const damage=hit.shape===target.head||(this.incidentActive('crossfire')&&shot.wallBounced)?3:1;
                if(hasIronclad(this.buffs,target.player.id,now)){
                    // A reflective coat, not a hit shield: keep the original shooter
                    // and finite budget, and never treat a rat contact as a wall bounce.
                    this.reflect(shot,normal);
                    this.impacts.push({p:data(point),n:data(normal),surface:false,scale:1.1,cue:'armor-clang'});
                    continue;
                }
                if(playing)this.hit({owner:shot.owner,victim:target.player.id,damage,incoming});
                this.impacts.push({p:data(hit.hitPointWorld),n:data(normal),surface:false});
                this.shots.splice(i,1);continue;
            }
            if(target?.kind==='case'){
                const c=this.cases.get(target.caseId??'primary')!;
                if(c.fake){
                    // The triggering ball is consumed by the blast, matching the
                    // established shot-prop convention; no fake missile state.
                    this.detonateFake(c,shot.owner??null);
                    this.impacts.push({p:data(hit.hitPointWorld),n:data(normal),surface:false,scale:1.6,cue:'case-hit'});
                    this.shots.splice(i,1);continue;
                }
                if(this.incidentActive('evidence-tampering')){
                    if(c.owner)this.releaseCase(c);
                    this.launchCaseMissile(c,vec(incoming));
                    c.missileOwner=shot.owner??undefined;
                }else{
                    if(c.owner)this.releaseCase(c);
                    const kick=vec(incoming);kick.normalize();kick.scale(T.caseShotKick,kick);
                    c.body.velocity.vadd(kick,c.body.velocity);
                    c.body.velocity.y=Math.max(c.body.velocity.y,T.caseShotLift);
                    const speed=c.body.velocity.length();
                    if(speed>T.caseShotMaxSpeed)c.body.velocity.scale(T.caseShotMaxSpeed/speed,c.body.velocity);
                    c.body.angularVelocity.set(kick.z*.45,6,-kick.x*.45);
                    c.body.wakeUp();c.looseSince=now;
                }
            }
            if(target?.kind==='corpse' && target.corpseId){
                const corpse=this.corpses.get(target.corpseId);
                if(corpse){
                    const kick=vec(incoming);kick.normalize();kick.scale(T.corpseShotKick,kick);
                    corpse.body.velocity.vadd(kick,corpse.body.velocity);corpse.body.velocity.y+=3;
                    // Re-shooting redirects the missile and transfers its damage credit.
                    corpse.state.owner=shot.owner;corpse.body.wakeUp();
                    this.sound('corpse-kick',hit.hitPointWorld,normal);
                    corpse.body.angularVelocity.x+=kick.z*.3;corpse.body.angularVelocity.z-=kick.x*.3;
                }
            }
            const firstWorld=target?.kind==='world'&&!shot.wallBounced;
            const split=firstWorld&&this.incidentActive('ricochet-racket');
            const delay=firstWorld&&this.incidentActive('delayed-reaction')&&!shot.delayed;
            if(target?.kind==='world')shot.wallBounced=true;
            if(target?.kind==='dispatch'&&playing){this.sound(this.dispatch.phase==='ready'?'trigger':'trigger-busy',hit.hitPointWorld,normal);this.activate(shot.owner);}
            if(target?.kind==='pressure'&&playing){this.sound(now<(this.pressure.cooldowns?.[target.machineId!]??0)?'trigger-busy':'trigger',hit.hitPointWorld,normal);this.activatePressure(target.machineId!);}
            const v=this.reflect(shot,normal);
            const radiusBefore=shotRadius(shot);
            if(target?.kind==='world')this.growShot(shot);
            if(delay){
                shot.delayed=true;
                shot.stuckUntil=now+(I.delayedMin+Math.random()*(I.delayedMax-I.delayedMin))*1000;
                this.impacts.push({p:data(point),n:data(normal),surface:true,scale:shotRadius(shot)/BALL_RADIUS,cue:'thud'});
                continue;
            }
            if(split){
                const axis=Math.abs(normal.y)<.95?new C.Vec3(0,1,0):new C.Vec3(1,0,0);
                const side=normal.cross(axis);side.normalize();
                for(const sign of [-1,1]){
                    if(this.shots.length>=T.maxShots)break;
                    const spread=v.vadd(side.scale(sign*v.length()*.22));spread.normalize();spread.scale(v.length(),spread);
                    const extra:ChaosShot={id:crypto.randomUUID(),owner:shot.owner,p:{...shot.p},v:data(spread),age:shot.age,
                        wallBounced:true,original:false,radius:shot.radius};
                    this.burstShots.add(extra);this.shots.push(extra);
                }
            }
            this.impacts.push({p:data(hit.hitPointWorld),n:data(normal),surface:true,scale:shotRadius(shot)/BALL_RADIUS,...(target?.kind==='case'?{cue:'case-hit' as const}:target?.kind==='world'?{foley:shotRadius(shot)>radiusBefore?'grow' as const:split?'split' as const:firstWorld&&this.incidentActive('crossfire')?'charge' as const:'bounce' as const,energy:Math.min(300,v.length())}:{})});
        }
        for(const [id,c] of this.corpses)if(now>=c.state.expires||c.body.position.y< -20||outsideCity(c.body.position.x,c.body.position.z))this.removeCorpse(id);
        for(const c of this.cases.values())this.stepLooseCase(c,now,playing);
        for(const id of this.pickupApproaches.keys())if(!this.players.has(id))this.pickupApproaches.delete(id);
        for(const player of this.players.values()){
            if(!playing||player.hp<=0){this.pickupApproaches.delete(player.id);continue;}
            const entry=this.pickupApproaches.get(player.id);
            if(entry){entry.p.set(player.x,player.y+.8,player.z);entry.at=now;}
            else this.pickupApproaches.set(player.id,{p:new C.Vec3(player.x,player.y+.8,player.z),at:now});
        }
        if(this.impacts.length>64)this.impacts.splice(0,this.impacts.length-64);
    }
    private stepLooseCase(c:CaseRuntime,now:number,playing:boolean){
        // Counterfeits never equip, never recover and never return: they only
        // wait to be shot or to detonate on the first rat that reaches them.
        if(c.fake)return;
        if(!c.owner){
            const p=c.body.position;
            const invalid=!Number.isFinite(p.x+p.y+p.z)||outsideCity(p.x,p.z)||p.y< -9 ||
                (c.body.velocity.length()<.4 && p.y>1.5 && !isReachableLandmarkPosition(p.x,p.y,p.z) && !isReachableVehiclePosition(p.x,p.y,p.z) && now-c.looseSince>4000) ||
                (now-c.looseSince>T.stuckMs && this.embedded(p));
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
                    if(player.hp<=0 || this.isCaseHolder(player.id) || (player.id===c.previousOwner&&now<c.pickupAfter))continue;
                    const reach=new C.Vec3(player.x,player.y+.8,player.z);
                    // Catch a run-by between movement packets, without accepting
                    // teleports, stale approaches or collecting through a wall.
                    const previous=this.pickupApproaches.get(player.id);
                    const closest=reach.clone();
                    if(previous&&now-previous.at<=150){
                        const delta=reach.vsub(previous.p),length=delta.lengthSquared();
                        if(length>0&&length<=36){
                            const t=Math.max(0,Math.min(1,p.vsub(previous.p).dot(delta)/length));
                            previous.p.vadd(delta.scale(t),closest);
                        }
                    }
                    if(closest.distanceTo(p)>T.pickupRadius)continue;
                    if(this.ray(closest,p,1).hasHit||this.ray(reach,p,1).hasHit)continue;
                    c.owner=player.id;this.carry(player,c);this.checkAssignmentLocation(c);
                    if(c.owner===player.id)this.tell('This rat is on the case · '+player.name);break;
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
            returningUntil:c.returningUntil,...(c.missileOwner?{missileOwner:c.missileOwner}:{}),...(c.fake?{fake:true}:{})};
    }
    private buffSnapshot():BuffMap{
        const active:BuffMap={};
        for(const id of Object.keys(this.buffs)){
            const entry=activeBuffs(this.buffs,id,this.now);
            if(entry.ironcladUntil||entry.hustleUntil)active[id]=entry;
        }
        return active;
    }
    private shotSnapshot(s:ChaosShot):ChaosShot{
        return {...s,p:{...s.p},v:{...s.v},
            ...(s.wallBounced?{wallBounced:true}:{}),
            ...(s.delayed?{delayed:true}:{}),
            ...(s.original?{original:true}:{}),
            ...((s.radius??BALL_RADIUS)!==BALL_RADIUS?{radius:s.radius}:{}),
            ...(s.stuckUntil?{stuckUntil:s.stuckUntil}:{}),
            ...(s.popAt?{popAt:s.popAt}:{})};
    }
    snapshot(drain=true):ChaosState{
        const state:ChaosState={time:this.now,case:this.caseSnapshot(this.primaryCase),
            ...(this.assignment?{assignment:structuredClone(this.assignment.state)}:{}),
            extraCases:[...this.cases.values()].filter(c=>c!==this.primaryCase).map(c=>({id:c.id,...this.caseSnapshot(c)})),dispatch:{...this.dispatch},pressure:{...this.pressure,cooldowns:{...this.pressure.cooldowns},launches:this.pressure.launches.map(e=>({...e,velocity:{...e.velocity}}))},possession:{...this.possession},
            pickups:[...this.pickups].map(([id,site])=>({id,kind:site.kind,x:site.p.x,y:site.p.y,z:site.p.z,availableAt:site.availableAt})),
            buffs:this.buffSnapshot(),
            corpses:[...this.corpses.values()].map(c=>({...c.state,...pose(c.body)})),
            shots:this.shots.map(s=>this.shotSnapshot(s)),impacts:[...this.impacts.slice(-64),...(this.impacts.length<64?this.audioImpacts.slice(-(64-this.impacts.length)):[])].slice(0,64),notice:{...this.notice}};
        if(drain){this.impacts=[];this.audioImpacts=[];}return state;
    }
    reset(){this.pickupApproaches.clear();this.impacts=[];this.audioImpacts=[];for(const id of [...this.corpses.keys()])this.removeCorpse(id);this.shots=[];this.primaryCase.owner=null;this.primaryCase.missileOwner=undefined;this.primaryCase.hitAfter.clear();this.primaryCase.armed=false;this.possession={};
        this.assignment=undefined;
        this.buffs={};this.pickupEvents.length=0;
        for(const site of this.pickups.values())site.availableAt=0;
        this.primaryCase.previousOwner=null;this.primaryCase.pickupAfter=0;
        this.dispatch={phase:'ready',started:this.now,until:0,serial:this.dispatch.serial+1};this.casesWeaponized=false;this.syncExtraCases();
        this.lastSurgePulse=0;this.dispatchActivator=null;
        this.pressure={serial:this.pressure.serial+1,until:0,cooldowns:{},launches:[]};
        this.primaryCase.body.type=C.Body.DYNAMIC;this.primaryCase.body.collisionFilterMask=1|8|16;this.scaleCase(CASE_LOOSE_SCALE);this.placeCaseAtSpawn();
        this.primaryCase.body.velocity.setZero();this.primaryCase.body.angularVelocity.setZero();this.primaryCase.body.wakeUp();this.primaryCase.looseSince=this.now;this.primaryCase.returningUntil=0;}
    private restoreCase(c:CaseRuntime,saved:CaseState,time:number){
        c.owner=saved.owner&&!this.isCaseHolder(saved.owner)?saved.owner:null;
        c.previousOwner=saved.previousOwner;c.pickupAfter=saved.pickupAfter;c.missileOwner=saved.missileOwner;
        c.returningUntil=saved.returningUntil;c.looseSince=time;this.scaleCase(c.owner?1:CASE_LOOSE_SCALE,c);
        c.body.position.copy(vec(saved.p));c.body.velocity.copy(vec(saved.v));c.body.angularVelocity.copy(vec(saved.spin));
        Object.assign(c.body.quaternion,saved.q);
        // Counterfeits stay parked where they were planted, exactly like a fresh one.
        const parked=c.fake;
        c.body.type=parked?C.Body.STATIC:c.owner?C.Body.KINEMATIC:C.Body.DYNAMIC;
        c.body.collisionFilterMask=(c.owner||parked)?16:1|8|16;
        c.body.updateMassProperties();c.body.updateAABB();
        c.armed=!parked&&this.incidentActive('evidence-tampering')&&!c.owner;
    }
    private restore(s:ChaosState){
        // Room hibernation/reconnection must not restock consumed supplies early.
        for(const saved of s.pickups??[]){
            const site=this.pickups.get(saved.id);
            if(site&&saved.kind===site.kind&&Number.isFinite(saved.availableAt))site.availableAt=Math.max(0,saved.availableAt!);
        }
        const assignment=restoreAssignment(s.assignment,Date.now());if(assignment)this.setAssignment(assignment);
        this.pressure={serial:s.pressure?.serial||0,until:s.pressure?.until||0,
            cooldowns:{...s.pressure?.cooldowns,[PRESSURE_LAUNCH.id]:s.pressure?.cooldowns?.[PRESSURE_LAUNCH.id]??s.pressure?.until??0},launches:[]};
        this.now=s.time;this.dispatch={...s.dispatch,...(s.dispatch.incident?{incident:incidentInfo(s.dispatch.incident).id}:{})};
        this.possession={...s.possession};this.notice={...s.notice};this.restoreCase(this.primaryCase,s.case,s.time);
        this.lastSurgePulse=this.incidentActive('pressure-surge')?Math.floor(Math.max(0,s.time-s.dispatch.started)/3000):0;
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
        // Restore only surviving traps; a missing ID has already detonated.
        if(this.incidentActive('planted-evidence')&&s.dispatch.until>Date.now()){
            this.plantedSerial=this.dispatch.serial;
            for(const id of COUNTERFEIT_IDS){
                const saved=s.extraCases?.find(x=>x.id===id);
                if(s.extraCases&&!saved)continue;
                const c=this.createCase(id,true);
                if(saved)this.restoreCase(c,saved,s.time);else this.placeFake(c);
            }
        }
        const elapsed=Math.max(0,(Date.now()-s.time)/1000);
        this.shots=s.shots.filter(shot=>shot.age+elapsed<BALL_LIFETIME).map(shot=>({...shot,p:{...shot.p},v:{...shot.v},age:shot.age+elapsed,
            radius:shot.radius??BALL_RADIUS,original:shot.original===true,delayed:shot.delayed===true,
            ...(shot.popAt?{popAt:shot.popAt}:{})}));
        for(const c of s.corpses){
            if(c.expires<=Date.now())continue;
            const body=new C.Body({mass:2,shape:new C.Box(new C.Vec3(.48,.92,.38)),
                position:vec(c.p),collisionFilterGroup:8,collisionFilterMask:1|4|16,linearDamping:.015,angularDamping:.04});
            Object.assign(body.quaternion,c.q);body.velocity.copy(vec(c.v));body.angularVelocity.copy(vec(c.spin));this.addCorpse(body,c);
        }
        if(elapsed>2&&!this.assignment)for(const c of this.cases.values())if(!c.owner)c.returningUntil=Date.now()+T.recoverMs;
        if(this.assignment?.state.phase==='suspended'&&!this.casesWeaponized)this.restoreObjectiveApproach(this.primaryCase);
    }
}
