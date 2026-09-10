import * as C from 'cannon-es';
import { SpatialRayQuery } from './SpatialRayQuery';
import { StaticCityBroadphase } from './StaticCityBroadphase';
import { launcherVelocity } from './launcherVelocity';
import { INCIDENTS, incidentInfo, type IncidentId } from './incidentCatalog';
import { CITY_BOUNDS, grayboxBoxes } from './grayboxLayout';
import { isReachableLandmarkPosition } from './landmarkLayout';
import { isReachableVehiclePosition } from './vehicleLayout';
import { BALL_SPEED, BALL_GRAVITY, BALL_RESTITUTION, BALL_LIFETIME, BALL_RADIUS } from './ballTuning';
import { CASE_HOME, CASE_HAND, CASE_CARRY_ROTATION, CASE_SIZE, CASE_LOOSE_SCALE, CASE_SPAWNS, EXTRA_CASE_IDS, CHAOS_TUNING as T, INCIDENT_TUNING as I, DISPATCH_STATIONS, PRESSURE_LAUNCH, LAUNCH_MACHINES, MAX_LAUNCH_EVENTS,
    type CaseState, type ChaosState, type ChaosShot, type CorpseState, type PhysicalPose } from './chaosState';
import type { PlayerData, ShotDescriptor, Vec3Data } from './networkProtocol';
import type { WorldSpec } from './worldSpec';

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
}
export interface ChaosHit { owner:string; victim:string; damage:number; incoming:Vec3Data }
/** One authoritative simulation, also usable by the solo preview. No rendering or DOM. */
export class ChaosSimulation {
    readonly world = new C.World({gravity:new C.Vec3(0,-25,0)});
    private primaryCase!:CaseRuntime;
    private readonly cases=new Map<string,CaseRuntime>();
    get caseBody():C.Body{return this.primaryCase.body;}
    private readonly rayQuery=new SpatialRayQuery(this.world);
    readonly targets=new Map<C.Body,Target>();
    private rats=new Map<string,C.Body>();
    private corpses=new Map<string,{body:C.Body;state:CorpseState;hitAfter:Map<string,number>}>();
    private shots:ChaosShot[]=[];
    private readonly burstShots=new WeakSet<ChaosShot>();
    private impacts:ChaosState['impacts']=[];
    private possession:Record<string,number>={};
    private dispatch:ChaosState['dispatch']={phase:'ready',started:0,until:0,serial:0};
    private lastSurgePulse=0;
    private casesWeaponized=false;
    private dispatchActivator:string|null=null;
    private pressure:NonNullable<ChaosState['pressure']>={serial:0,until:0,cooldowns:{},launches:[]};
    private notice={serial:0,text:'Find the Hot Case. Shoot Dispatch.'};
    private now=Date.now();
    get caseHolderId():string|null{return this.primaryCase.owner;}
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
        this.primaryCase=this.createCase('primary');
        if(saved)this.restore(saved);else this.placeCaseAtSpawn();
    }
    private createCase(id:string):CaseRuntime{
        const body=new C.Body({mass:1.5,shape:new C.Box(new C.Vec3(CASE_SIZE.x/2,CASE_SIZE.y/2,CASE_SIZE.z/2)),
            position:vec(CASE_HOME),collisionFilterGroup:4,collisionFilterMask:1|8|16,linearDamping:.2,angularDamping:.25});
        body.addShape(new C.Box(new C.Vec3(.15,.035,.04)),new C.Vec3(0,.43,0));
        for(const x of [-.12,.12])body.addShape(new C.Box(new C.Vec3(.0275,.065,.04)),new C.Vec3(x,.36,0));
        const c:CaseRuntime={id,body,owner:null,previousOwner:null,hitAfter:new Map(),pickupAfter:0,
            returningUntil:0,looseSince:this.now,scale:1,lastSpawn:CASE_HOME,armed:false};
        this.world.addBody(body);this.targets.set(body,{kind:'case',caseId:id});this.cases.set(id,c);
        this.scaleCase(CASE_LOOSE_SCALE,c);return c;
    }
    private syncExtraCases(){
        if(this.incidentActive('evidence-tampering')){
            for(const id of EXTRA_CASE_IDS)if(!this.cases.has(id))this.placeCaseAtSpawn(this.createCase(id));
        }else for(const [id,c] of this.cases){
            if(id==='primary')continue;
            this.world.removeBody(c.body);this.targets.delete(c.body);this.cases.delete(id);
        }
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
    private placeCaseAtSpawn(c=this.primaryCase){
        this.rayQuery.refresh();
        const walls=[...this.targets].filter(([,target])=>target.kind==='world');
        for(const [body] of walls)body.updateAABB();
        const clear=CASE_SPAWNS.filter(p=>{
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
        const available=separated.length?separated:clear;
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
    private activate(owner?:string){
        if(this.dispatch.phase!=='ready')return;
        const previous=this.dispatch.incident??(this.dispatch.serial>0?incidentInfo().id:undefined);
        const choices=INCIDENTS.filter(incident=>incident.id!==previous);
        const incident=choices[Math.floor(Math.random()*choices.length)].id;
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
    private crookedAim(direction:C.Vec3){
        const axis=Math.abs(direction.y)<.95?new C.Vec3(0,1,0):new C.Vec3(1,0,0);
        const side=direction.cross(axis);side.normalize();
        const up=side.cross(direction);up.normalize();
        // An annulus excludes accurate shots, including RNG midpoint values.
        const angle=.12+Math.random()*.38,azimuth=Math.random()*Math.PI*2;
        return direction.scale(Math.cos(angle)).vadd(side.scale(Math.sin(angle)*Math.cos(azimuth)))
            .vadd(up.scale(Math.sin(angle)*Math.sin(azimuth)));
    }
    shoot(owner:string,shot:ShotDescriptor){
        if(!this.players.get(owner) || this.players.get(owner)!.hp<=0)return;
        const direction=vec(shot.direction);direction.normalize();
        if(this.incidentActive('scattershot')){
            this.reserveShots(5);
            const v=direction.scale(BALL_SPEED);
            this.emitShot(owner,shot.origin,v,shot.shotId,this.originalShot());
            for(const angle of [-.22,-.11,.11,.22]){
                const rotation=new C.Quaternion();rotation.setFromAxisAngle(new C.Vec3(0,1,0),angle);
                this.emitShot(owner,shot.origin,rotation.vmult(v),crypto.randomUUID(),this.originalShot());
            }
            return;
        }
        if(this.incidentActive('bad-ammunition')){
            const roll=Math.random(),count=roll<.7?1:roll<.9?2:3;
            this.reserveShots(count);
            for(let i=0;i<count;i++)this.emitShot(owner,shot.origin,this.crookedAim(direction).scale(BALL_SPEED),
                i===0?shot.shotId:crypto.randomUUID(),this.originalShot());
            return;
        }
        this.emitShot(owner,shot.origin,direction.scale(BALL_SPEED),shot.shotId,this.originalShot());
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
    death(victim:PlayerData,incoming:Vec3Data,owner=victim.id):boolean{
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
        // Shared global shot capacity and fixed lifetime bound even a chain reaction.
        // Start inside the body so rays leave it without striking an artificial shell.
        for(let i=0;i<T.deathBurstBalls && this.shots.length<T.maxShots;i++){
            const angle=i*Math.PI*2/T.deathBurstBalls;
            const direction=new C.Vec3(Math.cos(angle),.12+(i%3)*.12,Math.sin(angle));direction.normalize();
            direction.scale(BALL_SPEED,direction);
            const shot:ChaosShot={id:crypto.randomUUID(),owner:corpse.owner||corpse.victimId,
                p:{...corpse.p},v:data(direction),age:0,original:false,radius:BALL_RADIUS};
            this.burstShots.add(shot);this.shots.push(shot);
        }
    }
    private addCorpse(body:C.Body,state:CorpseState){
        this.world.addBody(body);this.targets.set(body,{kind:'corpse',corpseId:state.id});
        this.corpses.set(state.id,{body,state,hitAfter:new Map()});
    }
    private stepBodies(dt:number,playing:boolean){
        // Bound ordinary travel to .8 units per substep; swept world checks catch thin walls.
        // Swept rat checks cover the entire path, including between network ticks.
        const missiles=[...this.cases.values()].filter(c=>this.caseDangerous(c));
        const fastest=Math.max(0,...[...this.cases.values()].filter(c=>!c.owner).map(c=>c.body.velocity.length()),...[...this.corpses.values()].map(c=>c.body.velocity.length()));
        const substeps=Math.max(1,Math.min(4,Math.ceil(fastest*dt/.8)));
        for(let sub=0;sub<substeps;sub++){
            const previous=[...this.corpses.values()].map(c=>({c,p:c.body.position.clone(),v:c.body.velocity.clone()}));
            const caseMotion=missiles.map(c=>({c,p:c.body.position.clone(),v:c.body.velocity.clone()}));
            // Cannon advances rotation; swept integration owns missile translation.
            for(const c of missiles){c.body.type=C.Body.KINEMATIC;c.body.collisionFilterMask=16;}
            this.world.step(dt/substeps);
            for(const {c,p,v} of caseMotion){
                c.body.position.copy(p);c.body.velocity.copy(v);this.stepCaseMissile(dt/substeps,playing,c);
            }
            for(const {c,p,v} of previous){
                const body=c.body;
                const obstruction=this.ray(p,body.position,1);
                if(obstruction.hasHit){
                    body.position.copy(obstruction.hitPointWorld.vadd(obstruction.hitNormalWorld.scale(.5)));
                    v.vadd(obstruction.hitNormalWorld.scale(-2*v.dot(obstruction.hitNormalWorld)),body.velocity);
                    body.velocity.scale(.72,body.velocity);body.updateAABB();
                }
                if(!playing||v.length()<T.corpseHitMinSpeed)continue;
                const delta=body.position.vsub(p),length=delta.lengthSquared();
                for(const player of this.players.values()){
                    const owner=c.state.owner||c.state.victimId;
                    if(player.hp<=0||player.id===owner||player.id===c.state.victimId||
                        (c.hitAfter.get(player.id)||0)>this.now)continue;
                    const center=new C.Vec3(player.x,player.y+1,player.z);
                    const fraction=length?Math.max(0,Math.min(1,center.vsub(p).dot(delta)/length)):0;
                    const nearest=p.vadd(delta.scale(fraction));
                    if(nearest.distanceTo(center)>1.15||this.ray(nearest,center,1).hasHit)continue;
                    c.hitAfter.set(player.id,this.now+T.corpseHitCooldownMs);
                    this.onHit({owner,victim:player.id,damage:v.length()>55?2:1,incoming:data(v)});
                    this.impacts.push({p:data(center),n:data(v.unit()),surface:false});
                }
            }
        }
    }
    private caseDangerous(c=this.primaryCase){
        return !c.owner&&c.armed&&this.incidentActive('evidence-tampering');
    }
    private missileCredit(c:CaseRuntime,victim:string){
        if(c.missileOwner&&c.missileOwner!==victim&&this.players.has(c.missileOwner))return c.missileOwner;
        if(this.dispatchActivator&&this.dispatchActivator!==victim&&this.players.has(this.dispatchActivator))return this.dispatchActivator;
        return [...this.players.values()].find(player=>player.hp>0&&player.id!==victim)?.id;
    }
    private hitCasePath(from:C.Vec3,to:C.Vec3,velocity:C.Vec3,playing:boolean,c=this.primaryCase){
        if(!playing||velocity.length()<8)return;
        const delta=to.vsub(from),length=delta.lengthSquared();
        const reach=1.55;
        for(const player of this.players.values()){
            if(player.hp<=0||(c.hitAfter.get(player.id)||0)>this.now)continue;
            if(player.id===c.missileOwner)continue;
            const owner=this.missileCredit(c,player.id);if(!owner)continue;
            const center=new C.Vec3(player.x,player.y+1,player.z);
            const fraction=length?Math.max(0,Math.min(1,center.vsub(from).dot(delta)/length)):0;
            const nearest=from.vadd(delta.scale(fraction));
            if(nearest.distanceTo(center)>reach)continue;
            const blocked=this.ray(nearest,center,1);
            if(blocked.hasHit&&blocked.distance>0.35)continue;
            c.hitAfter.set(player.id,this.now+700);
            this.onHit({owner,victim:player.id,damage:velocity.length()>=28?3:1,incoming:data(velocity)});
            this.impacts.push({p:data(center),n:data(velocity.unit()),surface:false,cue:'thud'});
        }
    }
    private launchCaseMissile(c:CaseRuntime,incoming?:C.Vec3){
        c.armed=true;c.hitAfter.clear();c.returningUntil=0;
        c.body.type=C.Body.KINEMATIC;c.body.collisionFilterMask=16;c.body.wakeUp();c.looseSince=this.now;
        if(incoming&&incoming.lengthSquared()>.01){
            const kick=incoming.clone();kick.normalize();kick.scale(I.caseShotSpeed,kick);
            c.body.velocity.copy(kick);c.body.angularVelocity.set(kick.z*.4,12,-kick.x*.4);
            return;
        }
        const yaw=Math.random()*Math.PI*2;
        c.body.velocity.set(Math.cos(yaw)*I.caseMissileSpeed,I.caseMissileLift,Math.sin(yaw)*I.caseMissileSpeed);
        c.body.angularVelocity.set(c.body.velocity.z*.3,10,-c.body.velocity.x*.3);
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
    }
    private stepCaseMissile(dt:number,playing:boolean,c=this.primaryCase){
        const body=c.body;
        body.velocity.y+=BALL_GRAVITY*dt;
        if(!c.missileOwner){
            if(body.velocity.y>18)body.velocity.y=18;
            if(body.position.y>7&&body.velocity.y>0)body.velocity.y*=.82;
        }
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
            this.impacts.push({p:data(end),n:data(normal),surface:true});
            remaining*=1-fraction;
        }
        // Keep this objective inside the playable city even after a rooftop shot.
        for(const axis of ['x','z'] as const){
            const low=CITY_BOUNDS.min+.6,high=CITY_BOUNDS.max-.6;
            if(body.position[axis]<low){body.position[axis]=low;body.velocity[axis]=Math.abs(body.velocity[axis])*.9;}
            if(body.position[axis]>high){body.position[axis]=high;body.velocity[axis]=-Math.abs(body.velocity[axis])*.9;}
        }
        const minimumSpeed=c.missileOwner?I.caseShotSpeed*.72:18;
        if(c.missileOwner&&body.velocity.length()>0.01&&body.velocity.length()<minimumSpeed){
            body.velocity.scale(minimumSpeed/body.velocity.length(),body.velocity);
        }else if(body.velocity.length()<18){
            const yaw=Math.atan2(body.velocity.z||Math.sin(this.now*.001),body.velocity.x||Math.cos(this.now*.001));
            body.velocity.set(Math.cos(yaw)*I.caseMissileSpeed*.72,Math.max(6,body.velocity.y),Math.sin(yaw)*I.caseMissileSpeed*.72);
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
    step(dt:number,now:number,playing=true){
        this.now=now;this.syncRats();this.rayQuery.refresh();
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
            for(const shot of this.shots)if(shot.stuckUntil){shot.stuckUntil=undefined;this.unstickShot(shot);}
        }
        if(!this.incidentActive('big-cheese')){
            for(const shot of this.shots)if((shot.radius??BALL_RADIUS)>BALL_RADIUS+.001){shot.radius=BALL_RADIUS;this.unstickShot(shot);}
        }
        this.syncExtraCases();
        for(const c of this.cases.values())this.updateCase(c,dt,playing);
        // Small physical steps keep the theatrical bodies within their collision surfaces.
        this.stepBodies(dt,playing);
        for(const b of this.world.bodies)if(b.type!==C.Body.STATIC)b.updateAABB();
        for(let i=this.shots.length-1;i>=0;i--){
            const shot=this.shots[i];shot.age+=dt;
            if(shot.age>BALL_LIFETIME){this.shots.splice(i,1);continue;}
            if(shot.stuckUntil){
                if(now<shot.stuckUntil)continue;
                shot.stuckUntil=undefined;this.unstickShot(shot);
            }
            shot.v.y+=BALL_GRAVITY*dt;
            const radius=shotRadius(shot);
            const from=vec(shot.p),motion=vec(shot.v).scale(dt),to=from.vadd(motion);
            const travel=motion.length()||1;
            const hit=this.ray(from,to,1|2|4|8),target=hit.body?this.targets.get(hit.body):undefined;
            const stop=radius>BALL_RADIUS+.02?radius:0.05;
            const contact=hit.hasHit?Math.max(0,hit.distance-stop):travel;
            const worldHit=hit.hasHit&&contact<=travel+.0001&&target?.player?.id!==shot.owner;
            if(!worldHit){
                let consumed=false;
                if(radius>BALL_RADIUS+.02&&playing){
                    for(const player of this.players.values()){
                        if(player.hp<=0||player.id===shot.owner)continue;
                        const center=new C.Vec3(player.x,player.y+1,player.z);
                        const length=motion.lengthSquared();
                        const fraction=length?Math.max(0,Math.min(1,center.vsub(from).dot(motion)/length)):0;
                        const nearest=from.vadd(motion.scale(fraction));
                        if(nearest.distanceTo(center)>radius+1.05||this.ray(nearest,center,1).hasHit)continue;
                        const damage=(this.incidentActive('crossfire')&&shot.wallBounced)?3:1;
                        this.onHit({owner:shot.owner,victim:player.id,damage,incoming:{...shot.v}});
                        const n=center.vsub(nearest);if(n.lengthSquared()<.0001)n.set(0,1,0);else n.normalize();
                        this.impacts.push({p:data(nearest),n:data(n),surface:false});
                        this.shots.splice(i,1);consumed=true;break;
                    }
                }
                if(consumed)continue;
                shot.p=data(to);continue;
            }
            const normal=hit.hitNormalWorld,point=hit.hitPointWorld.vadd(normal.scale(stop));
            shot.p=data(point);
            const incoming={...shot.v};
            if(target?.kind==='rat' && target.player && target.player.hp>0){
                const damage=hit.shape===target.head||(this.incidentActive('crossfire')&&shot.wallBounced)?3:1;
                if(playing)this.onHit({owner:shot.owner,victim:target.player.id,damage,incoming});
                this.impacts.push({p:data(hit.hitPointWorld),n:data(normal),surface:false});
                this.shots.splice(i,1);continue;
            }
            if(target?.kind==='case'){
                const c=this.cases.get(target.caseId??'primary')!;
                if(this.incidentActive('evidence-tampering')){
                    if(c.owner)this.releaseCase(c);
                    this.launchCaseMissile(c,vec(incoming));
                    c.missileOwner=shot.owner;
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
                    corpse.body.angularVelocity.x+=kick.z*.3;corpse.body.angularVelocity.z-=kick.x*.3;
                }
            }
            const firstWorld=target?.kind==='world'&&!shot.wallBounced;
            const split=firstWorld&&this.incidentActive('ricochet-racket');
            const delay=firstWorld&&this.incidentActive('delayed-reaction')&&!shot.delayed;
            if(target?.kind==='world')shot.wallBounced=true;
            if(target?.kind==='dispatch'&&playing)this.activate(shot.owner);
            if(target?.kind==='pressure'&&playing)this.activatePressure(target.machineId!);
            const v=this.reflect(shot,normal);
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
            this.impacts.push({p:data(hit.hitPointWorld),n:data(normal),surface:true,scale:shotRadius(shot)/BALL_RADIUS,...(target?.kind==='case'?{cue:'case-hit' as const}:{})});
        }
        for(const [id,c] of this.corpses)if(now>=c.state.expires||c.body.position.y< -20||outsideCity(c.body.position.x,c.body.position.z))this.removeCorpse(id);
        for(const c of this.cases.values())this.stepLooseCase(c,now,playing);
        if(this.impacts.length>64)this.impacts.splice(0,this.impacts.length-64);
    }
    private stepLooseCase(c:CaseRuntime,now:number,playing:boolean){
        if(!c.owner){
            const p=c.body.position;
            const invalid=!Number.isFinite(p.x+p.y+p.z)||outsideCity(p.x,p.z)||p.y< -9 ||
                (c.body.velocity.length()<.4 && p.y>1.5 && !isReachableLandmarkPosition(p.x,p.y,p.z) && !isReachableVehiclePosition(p.x,p.y,p.z) && now-c.looseSince>4000) ||
                (now-c.looseSince>T.stuckMs && this.embedded(p));
            if(invalid && !c.returningUntil){c.returningUntil=now+T.recoverMs;this.tell('CASE RETURNING · Evidence misplaced.');}
            if(c.returningUntil && now>=c.returningUntil){
                this.placeCaseAtSpawn(c);c.body.quaternion.set(0,0,0,1);c.body.velocity.setZero();c.body.angularVelocity.setZero();
                c.hitAfter.clear();
                c.body.type=C.Body.DYNAMIC;c.body.collisionFilterMask=1|8|16;c.body.updateMassProperties();
                c.body.wakeUp();c.returningUntil=0;c.looseSince=now;
                if(this.casesWeaponized)this.launchCaseMissile(c);
                else {c.missileOwner=undefined;c.armed=false;}
            }
            if(!c.returningUntil && playing && !this.casesWeaponized && !this.caseDangerous(c) && c.body.velocity.length()<=T.casePickupMaxSpeed){
                for(const player of this.players.values()){
                    if(player.hp<=0 || this.isCaseHolder(player.id) || (player.id===c.previousOwner&&now<c.pickupAfter))continue;
                    const reach=new C.Vec3(player.x,player.y+.8,player.z);
                    if(reach.distanceTo(p)>T.pickupRadius)continue;
                    if(this.ray(reach,p,1).hasHit)continue;
                    c.owner=player.id;this.carry(player,c);this.tell('This rat is on the case · '+player.name);break;
                }
            }
        }
    }
    private updateCase(c:CaseRuntime,dt:number,playing:boolean){
        if(c.owner){
            const p=this.players.get(c.owner);
            if(!p||p.hp<=0)this.releaseCase(c);else{
                this.carry(p,c);
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
            returningUntil:c.returningUntil,...(c.missileOwner?{missileOwner:c.missileOwner}:{})};
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
            extraCases:[...this.cases.values()].filter(c=>c!==this.primaryCase).map(c=>({id:c.id,...this.caseSnapshot(c)})),dispatch:{...this.dispatch},pressure:{...this.pressure,cooldowns:{...this.pressure.cooldowns},launches:this.pressure.launches.map(e=>({...e,velocity:{...e.velocity}}))},possession:{...this.possession},
            corpses:[...this.corpses.values()].map(c=>({...c.state,...pose(c.body)})),
            shots:this.shots.map(s=>this.shotSnapshot(s)),impacts:[...this.impacts],notice:{...this.notice}};
        if(drain)this.impacts=[];return state;
    }
    reset(){for(const id of [...this.corpses.keys()])this.removeCorpse(id);this.shots=[];this.primaryCase.owner=null;this.primaryCase.missileOwner=undefined;this.primaryCase.hitAfter.clear();this.primaryCase.armed=false;this.possession={};
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
        c.body.type=c.owner?C.Body.KINEMATIC:C.Body.DYNAMIC;c.body.collisionFilterMask=c.owner?16:1|8|16;
        c.body.updateMassProperties();c.body.updateAABB();
        c.armed=this.incidentActive('evidence-tampering')&&!c.owner;
    }
    private restore(s:ChaosState){
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
        if(elapsed>2)for(const c of this.cases.values())if(!c.owner)c.returningUntil=Date.now()+T.recoverMs;
    }
}
