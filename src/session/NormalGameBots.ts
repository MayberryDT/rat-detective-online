import * as C from 'cannon-es';
import { NetworkManager, resolveWebSocketUrl } from '../network/NetworkManager';
import { ObjectiveBotBrain, type ObjectiveNavigation } from '../shared/ObjectiveBotBrain';
import { BotNavigation } from '../shared/BotNavigation';
import { StaticCityBroadphase } from '../shared/StaticCityBroadphase';
import { SpatialRayQuery } from '../shared/SpatialRayQuery';
import { CITY_BOUNDS, grayboxBoxes } from '../shared/grayboxLayout';
import { DISPATCH_STATIONS, LAUNCH_MACHINES, type ChaosState } from '../shared/chaosState';
import { COAT_COLORS, FUR_COLORS, HAT_COLORS, HAT_TYPES } from '../shared/ratAppearance';
import type { ClientMessage, PlayerData, RatAppearance, ServerMessage, Vec3Data } from '../shared/networkProtocol';
import type { WorldSpec } from '../shared/worldSpec';

/** Explicit, private, local-only opt-in. A normal/public room can never acquire bots. */
export function normalGameBotCount(location: { hostname: string; search: string }): number {
    const params = new URLSearchParams(location.search);
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname) &&
        /^graybox-practice-[a-z0-9-]+$/i.test(params.get('room') ?? '') && params.get('bots') === '11' ? 11 : 0;
}
const NAMES = ['Constable Trap', 'Inspector Nibbles', 'Sergeant Stilton', 'Detective Crumbs', 'Officer Whiskers', 'Captain Cheddar', 'Deputy Squeaks', 'Inspector Gouda', 'Constable Alley', 'Detective Rind', 'Sergeant Scurry'];
export interface BotTransport {
    state: string;
    onMessage: ((message: ServerMessage) => void) | null;
    connect(name: string, appearance: RatAppearance): void;
    send(message: ClientMessage): boolean;
    destroy(): void;
}
interface Bot {
    transport: BotTransport;
    id: string;
    body: C.Body;
    brain: ObjectiveBotBrain;
    facing: number;
    launchedUntil: number;
    normalJump: boolean;
    lastLaunch: string;
    lastMovementAt: number;
}
interface BotOptions {
    createTransport?: () => BotTransport;
    /** Uses the one rendered remote rat's animated gun, without building duplicate models. */
    muzzle?: (id: string, position: Vec3Data, facing: number) => Vec3Data | undefined;
    navigation?: ObjectiveNavigation;
}

/** Eleven ordinary network clients. Only steering is local; health, scoring,
 * case ownership, respawns, incidents, victory and reset all belong to GameRoom. */
export class NormalGameBots {
    readonly world = new C.World({ gravity: new C.Vec3(0, -25, 0) });
    private readonly players = new Map<string, PlayerData>();
    private readonly bots: Bot[] = [];
    private readonly ray = new SpatialRayQuery(this.world);
    private readonly from = new C.Vec3();
    private readonly to = new C.Vec3();
    private playing = true;
    private disposed = false;
    private chaos?: ChaosState;
    private simulationNow = 0;
    private nextRouteAt = -Infinity;
    private readonly navigation: ObjectiveNavigation;
    private lastNavigationAt = -Infinity;
    constructor(spec: WorldSpec, snapshot: Record<string, PlayerData>, private readonly options: BotOptions = {}) {
        for (const p of Object.values(snapshot)) this.players.set(p.id, { ...p });
        this.world.broadphase = new StaticCityBroadphase(this.world);
        this.world.collisionMatrix=new C.ObjectCollisionMatrix() as unknown as C.ArrayCollisionMatrix;
        this.world.collisionMatrixPrevious=new C.ObjectCollisionMatrix() as unknown as C.ArrayCollisionMatrix;
        this.world.broadphase.useBoundingBoxes = true;
        this.world.defaultContactMaterial.friction = 0;
        this.world.defaultContactMaterial.restitution = .05;
        for (const b of grayboxBoxes(spec)) {
            const body = new C.Body({mass:0, shape:new C.Box(new C.Vec3(b.w/2,b.h/2,b.d/2)), position:new C.Vec3(b.x,b.y,b.z)});
            body.quaternion.setFromEuler(b.rx,0,b.rz);
            this.world.addBody(body);
        }
        for (const control of [...DISPATCH_STATIONS, ...LAUNCH_MACHINES]) for (const b of [control.box, control.target]) {
            this.world.addBody(new C.Body({mass:0,shape:new C.Box(new C.Vec3(b.w/2,b.h/2,b.d/2)),position:new C.Vec3(b.x,b.y,b.z)}));
        }
        const navigation = options.navigation ?? new BotNavigation(spec);
        this.navigation=navigation;
        const sharedNavigation: ObjectiveNavigation = {
            explorationTargets: () => navigation.explorationTargets(),
            route: (from, to) => {
                // Eleven brains share one planner budget: never eleven A* calls
                // in the same frame, and no path work during every physics tick.
                if(this.simulationNow<this.nextRouteAt)return undefined;
                this.nextRouteAt=this.simulationNow+80;
                return navigation.route(from,to);
            },
        };
        for (let i=0;i<11;i++) {
            const transport = options.createTransport?.() ?? new NetworkManager({url:resolveWebSocketUrl(),receiveMode:'welcome-only'});
            const body = new C.Body({mass:5, fixedRotation:true, linearDamping:.1, angularDamping:1, collisionFilterGroup:2, collisionFilterMask:1});
            body.addShape(new C.Sphere(.6),new C.Vec3(0,.6,0));
            body.addShape(new C.Sphere(.45),new C.Vec3(0,1.3,0));
            body.addShape(new C.Sphere(.28),new C.Vec3(0,1.9,0));
            const bot: Bot = {transport,id:'',body,brain:new ObjectiveBotBrain(sharedNavigation,i),facing:0,launchedUntil:0,normalJump:false,lastLaunch:'',lastMovementAt:-Infinity};
            this.bots.push(bot);
            // The human's feed is the common source. Each extra socket only needs
            // its own welcome, including reconnection identity and server spawn.
            transport.onMessage = message => {
                if (this.disposed || message.type !== 'welcome') return;
                if (bot.id) this.players.delete(bot.id);
                bot.id = message.id;
                this.players.set(bot.id, {...message.player});
                this.playing = message.round.phase === 'playing';
                if (!this.world.bodies.includes(body)) this.world.addBody(body);
                this.place(bot, message.player);
            };
            transport.connect(NAMES[i], {hatType:HAT_TYPES[i%HAT_TYPES.length],coatColor:COAT_COLORS[i%COAT_COLORS.length],hatColor:HAT_COLORS[(i+1)%HAT_COLORS.length],furColor:FUR_COLORS[i%FUR_COLORS.length]});
        }
    }
    get count(): number { return this.bots.length; }
    private place(bot: Bot, p: Vec3Data): void {
        bot.body.position.set(p.x,p.y,p.z);bot.body.velocity.setZero();bot.body.force.setZero();bot.body.aabbNeedsUpdate=true;
        bot.launchedUntil=0;bot.normalJump=false;bot.lastMovementAt=-Infinity;bot.body.wakeUp();
        bot.brain.reset();
    }
    updateHuman(id: string, p: Vec3Data, hp: number): void {
        const player=this.players.get(id);if(player)Object.assign(player,p,{hp});
    }
    receive(message: ServerMessage): void {
        if(this.disposed)return;
        switch(message.type){
            case 'playerJoined':this.players.set(message.player.id,{...message.player});break;
            case 'playerMoved':case 'playerCorrected': {
                const player=this.players.get(message.player.id);if(player)Object.assign(player,message.player);
                if(message.type==='playerCorrected'){const bot=this.bots.find(b=>b.id===message.player.id);if(bot)this.place(bot,message.player);}
                break;
            }
            case 'playerDamaged': {const p=this.players.get(message.id);if(p)p.hp=message.hp;break;}
            case 'playerDied': {const p=this.players.get(message.victimId);if(p){p.hp=0;p.respawnAt=message.respawnAt;}break;}
            case 'playerRespawn': {
                const p=this.players.get(message.id);if(p){Object.assign(p,message);delete p.respawnAt;}
                const bot=this.bots.find(b=>b.id===message.id);if(bot)this.place(bot,message);
                break;
            }
            case 'playerLeft':this.players.delete(message.id);break;
            case 'gameWon':this.playing=false;for(const bot of this.bots)bot.body.velocity.setZero();break;
            case 'gameReset':this.playing=true;this.chaos=undefined;this.nextRouteAt=-Infinity;for(const bot of this.bots)bot.brain.reset();break;
            case 'chaos':
                this.chaos=message.state;
                for(const launch of message.state.pressure?.launches??[]){
                    const bot=this.bots.find(b=>b.id===launch.playerId);
                    if(!bot||bot.lastLaunch===launch.id||message.state.time-launch.at>1500||!this.players.get(bot.id)?.hp)continue;
                    bot.lastLaunch=launch.id;bot.body.velocity.set(launch.velocity.x,launch.velocity.y,launch.velocity.z);
                    bot.launchedUntil=Date.now()+1600;bot.normalJump=false;bot.body.wakeUp();
                }
                break;
        }
    }
    private visible(bot: Bot,target:Vec3Data):boolean {
        this.from.set(bot.body.position.x,bot.body.position.y+1.5,bot.body.position.z);
        this.to.set(target.x,target.y+1,target.z);
        return !this.ray.closest(this.from,this.to,1).hasHit;
    }
    private visibleControl(bot:Bot,target:Vec3Data):boolean {
        this.from.set(bot.body.position.x,bot.body.position.y+1.5,bot.body.position.z);
        this.to.set(target.x,target.y,target.z);
        const hit=this.ray.closest(this.from,this.to,1);
        // A terminal's red face is itself solid. Reaching that face counts as
        // visible; a wall or the terminal's back still blocks the shot.
        return !hit.hasHit||hit.hitPointWorld.distanceTo(this.to)<.22;
    }
    step(dt:number,now:number):void {
        if(this.disposed||!this.playing)return;
        this.simulationNow=now;
        // Incremental searches share a maximum 2 ms slice, including when a
        // render frame has several catch-up physics steps.
        if(now-this.lastNavigationAt>=15){this.navigation.update?.(2);this.lastNavigationAt=now;}
        this.ray.refresh();
        for(const bot of this.bots){
            const self=this.players.get(bot.id),body=bot.body;
            if(bot.transport.state!=='playing'||!self||self.hp<=0){body.velocity.setZero();body.sleep();continue;}
            let grounded=false;
            for(const contact of this.world.contacts){const normal=contact.bi===body?-contact.ni.y:contact.bj===body?contact.ni.y:0;if(normal>.5){grounded=true;break;}}
            if(grounded)bot.normalJump=false;
            Object.assign(self,{x:body.position.x,y:body.position.y,z:body.position.z});
            const intent=bot.brain.step(now,self,this.players.values(),this.chaos,target=>this.visible(bot,target),grounded&&Math.hypot(body.velocity.x,body.velocity.z)<1,grounded,target=>this.visibleControl(bot,target));
            if(now>=bot.launchedUntil){
                body.velocity.x+=(intent.x-body.velocity.x)*.14;body.velocity.z+=(intent.z-body.velocity.z)*.14;
                if(intent.jump){body.velocity.y=16*Math.sqrt(1.28);bot.normalJump=true;}
            }
            if(bot.normalJump)body.force.y+=body.mass*this.world.gravity.y*.28;
            for(const axis of ['x','z'] as const){
                if(body.position[axis]<CITY_BOUNDS.min+4&&body.velocity[axis]<0)body.velocity[axis]=Math.max(8,-body.velocity[axis]*.45);
                if(body.position[axis]>CITY_BOUNDS.max-4&&body.velocity[axis]>0)body.velocity[axis]=-Math.max(8,body.velocity[axis]*.45);
            }
            bot.facing=intent.facing;body.wakeUp();
            if(intent.shoot){
                const origin=this.options.muzzle?.(bot.id,body.position,bot.facing);
                if(origin){
                    // Ordered pose then shot keeps fast airborne bots' muzzle
                    // validation tied to the same pose, not a 100ms-old update.
                    const q={x:0,y:Math.sin(bot.facing/2),z:0,w:Math.cos(bot.facing/2)};
                    const poseSent=bot.transport.send({type:'updateMovement',position:{x:body.position.x,y:body.position.y,z:body.position.z},rotation:{x:0,y:0,z:0,w:1},meshRotation:q});
                    if(!poseSent)continue;
                    bot.lastMovementAt=now;
                    const dx=intent.shoot.x-origin.x,dy=intent.shoot.y-origin.y,dz=intent.shoot.z-origin.z,length=Math.hypot(dx,dy,dz);
                    if(length>0)bot.transport.send({type:'shoot',shotId:crypto.randomUUID(),origin,direction:{x:dx/length,y:dy/length,z:dz/length}});
                }
            }
        }
        this.world.step(dt);
        for(const bot of this.bots){
            const self=this.players.get(bot.id);if(bot.transport.state!=='playing'||!self||self.hp<=0)continue;
            const p=bot.body.position;
            for(const axis of ['x','z'] as const){const old=p[axis];p[axis]=Math.max(CITY_BOUNDS.min+3,Math.min(CITY_BOUNDS.max-3,old));if(old!==p[axis])bot.body.aabbNeedsUpdate=true;}
            Object.assign(self,{x:p.x,y:p.y,z:p.z});
            if(now-bot.lastMovementAt>=100){
                const q={x:0,y:Math.sin(bot.facing/2),z:0,w:Math.cos(bot.facing/2)};
                if(bot.transport.send({type:'updateMovement',position:{x:p.x,y:p.y,z:p.z},rotation:{x:0,y:0,z:0,w:1},meshRotation:q}))bot.lastMovementAt=now;
            }
        }
    }
    dispose():void {
        if(this.disposed)return;this.disposed=true;
        for(const bot of this.bots){bot.transport.onMessage=null;bot.transport.destroy();}
        this.bots.length=0;this.players.clear();
        for(const body of [...this.world.bodies])this.world.removeBody(body);
    }
}
