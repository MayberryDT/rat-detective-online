import * as C from 'cannon-es';
import {BotNavigation} from '../shared/BotNavigation';
import {RatBot} from '../shared/bots/ratBot';
import type {MotorNavigation} from '../shared/bots/motor';
import {StaticCityBroadphase,addCityBody,cityBoxBody} from '../shared/StaticCityBroadphase';
import {CITY_BARS_GROUP} from '../shared/boxFrame';
import {SpatialRayQuery} from '../shared/SpatialRayQuery';
import {CITY_BOUNDS,grayboxBoxes} from '../shared/grayboxLayout';
import {DISPATCH_STATIONS,LAUNCH_MACHINES,MAX_LAUNCH_EVENTS,type ChaosState} from '../shared/chaosState';
import {LAUNCH_DRIFT_DECAY} from '../shared/launcherVelocity';
import {guardFastFall,touchingSlick} from '../shared/ratSurfaces';
import type {PlayerData,Vec3Data} from '../shared/networkProtocol';
import type {Decision,Mind,Personality} from '../shared/bots/intent';
import type {GoalContext} from '../shared/bots/goals';
import type {WorldSpec} from '../shared/worldSpec';

export interface ServerBotCallbacks {
    move:(id:string,position:Vec3Data,facing:number,at?:number)=>void;
    shoot:(id:string,origin:Vec3Data,direction:Vec3Data)=>void;
    recover?:(id:string)=>void;
    recoverCase?:()=>void;
    /** Each new decision a bot takes (every 180–300 ms and on events), for the recorder. */
    decide?:(id:string,decision:Decision,now:number)=>void;
}
interface Bot {
    id:string;body:C.Body;brain:RatBot;actor?:PlayerData;decided?:Decision;
    facing:number;initialized:boolean;alive:boolean;normalJump:boolean;zoneHop:boolean;
    launchedUntil:number;lastLaunchAt:number;lastMovementAt:number;
    /** The launcher's sideways throw, fading until landing, under the brain's steering. */
    driftX:number;driftZ:number;
    strandedSince:number;escapeCheckAt:number;escapeX:number;escapeZ:number;
    progressAt:number;progressX:number;progressZ:number;
    pocketAt:number;pocketX:number;pocketZ:number;progressMark:number;
}

/** Backstop for a bot that paces a small pocket (a railed crane landing, a hop up the next flight and back):
 * no waypoint, goal or fight and never this far from one spot, for this long, is a rescue even when the
 * 1.5-unit clock keeps restarting. Long enough that a bot briefly circling a street is never teleported. */
const POCKET_RADIUS=24,POCKET_RESCUE_MS=90000;

/** RatModel's raised firing arm (-.49, .91+.36, .09+.10) plus its
 * rat-muzzle anchor (0,.106,.28), rotated by the current authoritative yaw.
 * Rendering recoil/walk animation must never move the server's shot origin. */
export function serverBotMuzzle(position:Vec3Data,facing:number):Vec3Data {
    const x=-.49,z=.47,c=Math.cos(facing),s=Math.sin(facing);
    return{x:position.x+x*c+z*s,y:position.y+1.376,z:position.z-x*s+z*c};
}

/** Hosted, render-free steering and physical movement. GameRoom owns all player
 * records, health, spawn/reset decisions, shots, incident effects and scoring. */
export class ServerBotController {
    readonly world=new C.World({gravity:new C.Vec3(0,-25,0)});
    private readonly bots=new Map<string,Bot>();
    private readonly actors=new Map<string,PlayerData>();
    private readonly navigation:BotNavigation;
    private readonly ray=new SpatialRayQuery(this.world);
    private readonly from=new C.Vec3();
    private readonly to=new C.Vec3();
    private readonly launchesSeen=new Set<string>();
    private now=0;
    private lastNavigationAt=-Infinity;
    private wasPlaying=true;
    private disposed=false;
    private looseCaseSince=0;
    private looseCasePosition?:Vec3Data;

    /** `personality` names each bot's hidden personality, looked up whenever the bot is (re)placed, since a
     * slot's rat and name can change between rounds. Default: every bot a tryhard. `mind` answers before the
     * code mind for every bot (the room's Jev mind); it switches on and off without resetting a bot. */
    constructor(spec:WorldSpec,botIds:readonly string[],private readonly callbacks:ServerBotCallbacks,private readonly personality:(id:string)=>Personality=()=>'tryhard',mind?:Mind<GoalContext>){
        this.world.broadphase=new StaticCityBroadphase(this.world);
        this.world.broadphase.useBoundingBoxes=true;
        this.world.collisionMatrix=new C.ObjectCollisionMatrix() as unknown as C.ArrayCollisionMatrix;
        this.world.collisionMatrixPrevious=new C.ObjectCollisionMatrix() as unknown as C.ArrayCollisionMatrix;
        this.world.defaultContactMaterial.friction=0;this.world.defaultContactMaterial.restitution=.05;
        for(const box of grayboxBoxes(spec)){
            addCityBody(this.world,cityBoxBody(box));
        }
        for(const control of [...DISPATCH_STATIONS,...LAUNCH_MACHINES])for(const box of [control.box,control.target]){
            const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(box.w/2,box.h/2,box.d/2)),position:new C.Vec3(box.x,box.y,box.z)});
            addCityBody(this.world,body);
        }
        this.navigation=new BotNavigation(spec);
        const sharedNavigation:MotorNavigation={
            explorationTargets:()=>this.navigation.explorationTargets(),
            travelPoint:(from,to)=>this.navigation.travelPoint(from,to),
            supported:from=>this.navigation.supported(from),
            jumpStep:(from,to)=>this.navigation.jumpStep(from,to),
            approachStep:(from,to)=>this.navigation.approachStep(from,to),
            route:(from,to)=>this.navigation.route(from,to),
            localStep:(from,to)=>this.navigation.localStep(from,to),
            ray:(from,to)=>{
                this.from.set(from.x,from.y,from.z);this.to.set(to.x,to.y,to.z);
                const hit=this.ray.closest(this.from,this.to,1);
                return hit.hasHit?{point:{x:hit.hitPointWorld.x,y:hit.hitPointWorld.y,z:hit.hitPointWorld.z},normal:{x:hit.hitNormalWorld.x,y:hit.hitNormalWorld.y,z:hit.hitNormalWorld.z}}:undefined;
            },
        };
        let index=0;
        for(const id of new Set(botIds)){
            const body=new C.Body({mass:5,fixedRotation:true,linearDamping:.1,angularDamping:1,collisionFilterGroup:2,collisionFilterMask:1|CITY_BARS_GROUP});
            body.addShape(new C.Sphere(.6),new C.Vec3(0,.6,0));
            body.addShape(new C.Sphere(.45),new C.Vec3(0,1.3,0));
            body.addShape(new C.Sphere(.28),new C.Vec3(0,1.9,0));
            this.bots.set(id,{id,body,brain:new RatBot(sharedNavigation,index++,Math.random,{mind}),facing:0,initialized:false,alive:false,
                normalJump:false,zoneHop:false,launchedUntil:0,lastLaunchAt:-Infinity,lastMovementAt:-Infinity,driftX:0,driftZ:0,
                strandedSince:0,escapeCheckAt:0,escapeX:0,escapeZ:0,progressAt:0,progressX:0,progressZ:0,pocketAt:0,pocketX:0,pocketZ:0,progressMark:0});
        }
    }
    reset(id:string,position:Vec3Data):void {
        if(this.disposed)return;
        const bot=this.bots.get(id);if(!bot)return;
        const body=bot.body;
        body.position.set(position.x,position.y,position.z);body.previousPosition.copy(body.position);body.interpolatedPosition.copy(body.position);
        body.velocity.setZero();body.force.setZero();body.angularVelocity.setZero();body.torque.setZero();body.aabbNeedsUpdate=true;
        if(!body.world)this.world.addBody(body);
        body.wakeUp();bot.initialized=true;bot.alive=true;bot.normalJump=false;bot.zoneHop=false;bot.launchedUntil=0;bot.driftX=bot.driftZ=0;
        bot.lastLaunchAt=this.now;bot.lastMovementAt=-Infinity;bot.brain.reset();bot.brain.personality=this.personality(id);
        bot.strandedSince=0;bot.escapeCheckAt=0;bot.escapeX=0;bot.escapeZ=0;
        bot.progressAt=this.now;bot.progressX=position.x;bot.progressZ=position.z;
        bot.pocketAt=this.now;bot.pocketX=position.x;bot.pocketZ=position.z;bot.progressMark=bot.brain.progressMark;
    }
    private visible(bot:Bot,target:Vec3Data,control=false):boolean {
        this.from.set(bot.body.position.x,bot.body.position.y+1.5,bot.body.position.z);
        this.to.set(target.x,target.y+(control?0:1),target.z);
        const hit=this.ray.closest(this.from,this.to,1);
        // Launcher crowns and alarm bells are thick boxes the ray stops on.
        // Hitting the actual requested control body is visibility, not occlusion.
        return !hit.hasHit||control&&(hit.hitPointWorld.distanceTo(this.to)<.22||
            !!hit.body&&Math.hypot(hit.body.position.x-target.x,hit.body.position.y-target.y,hit.body.position.z-target.z)<.01);
    }
    private stop(bot:Bot):void {
        bot.body.velocity.setZero();bot.body.force.setZero();bot.body.sleep();
    }
    private move(bot:Bot,now:number):void {
        const p=bot.body.position;
        this.callbacks.move(bot.id,{x:p.x,y:p.y,z:p.z},bot.facing,now);bot.lastMovementAt=now;
    }
    /** Try walking off an unsupported roof without walking through walls. */
    private escape(bot:Bot,now:number):void {
        if(now<bot.escapeCheckAt)return;
        bot.escapeCheckAt=now+500;bot.escapeX=0;bot.escapeZ=0;
        const p=bot.body.position,base=Math.atan2(-p.x,-p.z)+Math.floor((now-bot.strandedSince)/2500)*.8;
        for(let i=0;i<8;i++){
            const angle=base+i*Math.PI/4,x=Math.sin(angle),z=Math.cos(angle);
            let clear=true;
            for(const height of [.6,1.3,1.9])for(const side of [-.55,0,.55]){
                this.from.set(p.x+z*side,p.y+height,p.z-x*side);
                this.to.set(this.from.x+x*1.3,this.from.y,this.from.z+z*1.3);
                if(this.ray.closest(this.from,this.to,1).hasHit)clear=false;
            }
            if(clear){bot.escapeX=x*6.5;bot.escapeZ=z*6.5;return;}
        }
    }
    private recoverLooseCase(now:number,chaos:ChaosState|undefined):void {
        const c=chaos?.case;
        if(!c||c.owner||c.returningUntil>now||Math.hypot(c.v.x,c.v.y,c.v.z)>.5){
            this.looseCaseSince=0;this.looseCasePosition=undefined;return;
        }
        if(!this.looseCasePosition||Math.hypot(c.p.x-this.looseCasePosition.x,c.p.y-this.looseCasePosition.y,c.p.z-this.looseCasePosition.z)>2){
            this.looseCasePosition={...c.p};this.looseCaseSince=now;return;
        }
        if(now-this.looseCaseSince<30000)return;
        // Other bots failing is not proof that an active approach is impossible.
        if([...this.bots.values()].some(bot=>bot.alive&&bot.brain.objective==='case'&&!bot.brain.navigationStalled))return;
        if([...this.actors.values()].some(p=>!this.bots.has(p.id)&&p.hp>0&&Math.hypot(p.x-c.p.x,p.y-c.p.y,p.z-c.p.z)<12))return;
        const votes=[...this.bots.values()].filter(bot=>{
            const failed=bot.brain.failedCasePosition;
            return bot.alive&&failed&&Math.hypot(failed.x-c.p.x,failed.y-c.p.y,failed.z-c.p.z)<2;
        }).length;
        if(votes>=3){this.callbacks.recoverCase?.();this.looseCaseSince=now;}
    }
    step(dt:number,now:number,players:ReadonlyMap<string,PlayerData>,chaos:ChaosState|undefined,playing:boolean):void {
        if(this.disposed||!Number.isFinite(dt)||dt<=0||!Number.isFinite(now))return;
        this.now=now;
        if(!playing){for(const bot of this.bots.values())this.stop(bot);this.wasPlaying=false;return;}
        for(const [id,actor] of players)this.actors.set(id,actor);
        for(const id of this.actors.keys())if(!players.has(id))this.actors.delete(id);
        for(const bot of this.bots.values()){
            const player=players.get(bot.id);
            if(!player||player.hp<=0){bot.alive=false;this.stop(bot);if(bot.body.world)this.world.removeBody(bot.body);continue;}
            if(!bot.initialized||!bot.alive||!this.wasPlaying)this.reset(bot.id,player);
            if(!bot.actor)bot.actor={...player};else Object.assign(bot.actor,player);
            Object.assign(bot.actor,{x:bot.body.position.x,y:bot.body.position.y,z:bot.body.position.z});
            this.actors.set(bot.id,bot.actor);
        }
        this.wasPlaying=true;
        for(const launch of chaos?.pressure?.launches??[]){
            if(this.launchesSeen.has(launch.id))continue;
            this.launchesSeen.add(launch.id);
            if(this.launchesSeen.size>MAX_LAUNCH_EVENTS*2)this.launchesSeen.delete(this.launchesSeen.values().next().value!);
            const bot=this.bots.get(launch.playerId);
            if(!bot?.alive||launch.at<bot.lastLaunchAt||now-launch.at>1500||launch.at>now+100)continue;
            bot.lastLaunchAt=launch.at;bot.body.velocity.set(launch.velocity.x,launch.velocity.y,launch.velocity.z);
            bot.strandedSince=0;bot.progressAt=now;
            bot.launchedUntil=now+150;bot.normalJump=false;bot.zoneHop=false;bot.body.wakeUp();
            bot.driftX=launch.velocity.x;bot.driftZ=launch.velocity.z;
        }
        for(const shove of chaos?.pressure?.shoves??[]){
            if(this.launchesSeen.has(shove.id))continue;
            this.launchesSeen.add(shove.id);
            if(this.launchesSeen.size>MAX_LAUNCH_EVENTS*2)this.launchesSeen.delete(this.launchesSeen.values().next().value!);
            const bot=this.bots.get(shove.playerId);
            if(!bot?.alive||now-shove.at>1500||shove.at>now+100)continue;
            const v=bot.body.velocity;v.x+=shove.velocity.x;v.z+=shove.velocity.z;v.y=Math.max(v.y,shove.velocity.y);
            bot.driftX+=shove.velocity.x;bot.driftZ+=shove.velocity.z;
            bot.launchedUntil=now+150;bot.normalJump=false;bot.zoneHop=false;bot.body.wakeUp();
        }
        if(now-this.lastNavigationAt>=15){
            // The second bound is required in Workers, where performance.now()
            // may stay frozen throughout a synchronous event's CPU work.
            this.navigation.update(2,96);
            this.lastNavigationAt=now;
        }
        this.ray.refresh();
        const groundedBodies=new Set<C.Body>();
        for(const contact of this.world.contacts){
            if(-contact.ni.y>.5)groundedBodies.add(contact.bi);
            if(contact.ni.y>.5)groundedBodies.add(contact.bj);
        }
        for(const bot of this.bots.values()){
            const self=bot.actor,body=bot.body;
            if(!self||!bot.alive||(players.get(bot.id)?.hp??0)<=0)continue;
            const grounded=groundedBodies.has(body);
            // Cannon retains the takeoff contact for a step. Keep jump gravity
            // through the new zone hop. Preserve the established traversal arc.
            if(grounded&&(!bot.zoneHop||body.velocity.y<=1)){bot.normalJump=false;bot.zoneHop=false;}
            const intent=bot.brain.step(now,self,this.actors.values(),chaos,target=>this.visible(bot,target),
                grounded&&Math.hypot(body.velocity.x,body.velocity.z)<1,grounded,target=>this.visible(bot,target,true));
            const decision=bot.brain.decision;
            if(decision&&decision!==bot.decided){bot.decided=decision;this.callbacks.decide?.(bot.id,decision,now);}
            if(!bot.progressAt||Math.hypot(body.position.x-bot.progressX,body.position.z-bot.progressZ)>1.5){
                bot.progressAt=now;bot.progressX=body.position.x;bot.progressZ=body.position.z;
            }
            const wantsMove=bot.brain.navigationStalled||Math.hypot(intent.x,intent.z)>.5;
            if(!bot.pocketAt||!wantsMove&&grounded||bot.brain.progressMark!==bot.progressMark||Math.hypot(body.position.x-bot.pocketX,body.position.z-bot.pocketZ)>POCKET_RADIUS){
                bot.pocketAt=now;bot.pocketX=body.position.x;bot.pocketZ=body.position.z;bot.progressMark=bot.brain.progressMark;
            }
            if(!wantsMove){bot.strandedSince=0;bot.progressAt=now;}
            else if(grounded&&now>bot.lastLaunchAt+8000){
                bot.strandedSince=bot.progressAt;
                if((now-bot.progressAt>=30000||now-bot.pocketAt>=POCKET_RESCUE_MS)&&this.callbacks.recover){
                    bot.strandedSince=0;this.callbacks.recover(bot.id);continue;
                }
                if(now-bot.progressAt>=8000){
                    this.escape(bot,now);intent.x=bot.escapeX;intent.z=bot.escapeZ;
                    if(intent.x||intent.z)intent.facing=Math.atan2(intent.x,intent.z);
                }
            }
            if(grounded&&now>=bot.launchedUntil)bot.driftX=bot.driftZ=0;
            else if(bot.driftX||bot.driftZ){const fade=Math.exp(-LAUNCH_DRIFT_DECAY*Math.min(dt,1/30));bot.driftX*=fade;bot.driftZ*=fade;}
            // A bot steering a planned roof route cancels the drift to reach its landing.
            // A chute owns the ride (bots never plan into one; they may be knocked in).
            const drift=bot.brain.flyingRoute?0:1,riding=touchingSlick(this.world,body);
            if(!riding){body.velocity.x+=(intent.x+bot.driftX*drift-body.velocity.x)*.14;body.velocity.z+=(intent.z+bot.driftZ*drift-body.velocity.z)*.14;}
            // Ignore stale takeoff contacts briefly, without ever locking air steering.
            if(intent.jump&&grounded&&!riding&&now>=bot.launchedUntil){body.velocity.y=16*Math.sqrt(1.28);bot.normalJump=true;bot.zoneHop=!!intent.zoneHop;}
            if(bot.normalJump)body.force.y+=body.mass*this.world.gravity.y*.28;
            for(const axis of ['x','z'] as const){
                if(body.position[axis]<CITY_BOUNDS.min+4&&body.velocity[axis]<0)body.velocity[axis]=Math.max(8,-body.velocity[axis]*.45);
                if(body.position[axis]>CITY_BOUNDS.max-4&&body.velocity[axis]>0)body.velocity[axis]=-Math.max(8,body.velocity[axis]*.45);
            }
            bot.facing=intent.facing;body.wakeUp();guardFastFall(this.world,body,Math.min(dt,1/30));
            if(intent.shoot){
                const origin=serverBotMuzzle(body.position,bot.facing),dx=intent.shoot.x-origin.x,dy=intent.shoot.y-origin.y,dz=intent.shoot.z-origin.z;
                const length=Math.hypot(dx,dy,dz);
                if(length>0){this.move(bot,now);this.callbacks.shoot(bot.id,origin,{x:dx/length,y:dy/length,z:dz/length});}
            }
        }
        this.recoverLooseCase(now,chaos);
        this.world.step(Math.min(dt,1/30));
        for(const bot of this.bots.values()){
            if(!bot.alive||(players.get(bot.id)?.hp??0)<=0)continue;
            const p=bot.body.position;
            for(const axis of ['x','z'] as const){const old=p[axis];p[axis]=Math.max(CITY_BOUNDS.min+3,Math.min(CITY_BOUNDS.max-3,old));if(old!==p[axis])bot.body.aabbNeedsUpdate=true;}
            if(bot.actor)Object.assign(bot.actor,{x:p.x,y:p.y,z:p.z});
            if(now-bot.lastMovementAt>=49.5)this.move(bot,now);
        }
    }
    /** Navigation and visibility work since the previous call (Worker diagnostics). */
    takeWork():{navExpansions:number;navEdgeProbes:number;botRays:number}{
        const nav=this.navigation.work,work={navExpansions:nav.expansions,navEdgeProbes:nav.edgeProbes,botRays:this.ray.queries};
        nav.expansions=0;nav.edgeProbes=0;this.ray.queries=0;return work;
    }
    dispose():void {
        if(this.disposed)return;this.disposed=true;
        for(const body of [...this.world.bodies])this.world.removeBody(body);
        this.bots.clear();this.actors.clear();this.launchesSeen.clear();
    }
}
