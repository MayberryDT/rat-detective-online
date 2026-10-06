import * as C from 'cannon-es';
import {ChaosSimulation, type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CITY_PREVIEW_SEED, GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {MAX_HP, type PlayerData, type ShotDescriptor,type Vec3Data} from '../../src/shared/networkProtocol';
import type {PickupPoint} from '../../src/shared/pickups';
import {applyHit, createPlayer} from '../../src/worker/gameState';

export const PRACTICE_WORLD = {seed:CITY_PREVIEW_SEED, version:GRAYBOX_VERSION};
export const PRACTICE_START = {x:-24, y:0, z:-19};
export const PRACTICE_APPEARANCE = {hatType:'fedora' as const, coatColor:0x275c46, hatColor:0x8b4b28, furColor:0xaaa19a};
export const PRACTICE_TARGETS = [
    {id:'dummy-1', name:'01 · FRONT', x:-14, y:0, z:-22, yaw:-Math.PI/2, coatColor:0x3569aa},
    {id:'dummy-2', name:'02 · SIDE', x:-4, y:0, z:-29, yaw:0, coatColor:0xa94d46},
    {id:'dummy-3', name:'03 · BACK', x:11, y:0, z:-23, yaw:Math.PI/2, coatColor:0x9a7437},
    {id:'dummy-4', name:'04 · FAR', x:26, y:0, z:-28, yaw:-Math.PI/2, coatColor:0x7b5593},
] as const;
export const PRACTICE_SUPPLIES:PickupPoint[]=[
 {id:'rack-laser',kind:'laser',p:{x:-24,y:.7,z:-15}},
 {id:'rack-tommy',kind:'tommy-gun',p:{x:-28,y:.7,z:-15}},
 {id:'rack-trap',kind:'mousetrap',p:{x:-32,y:.7,z:-15}},
];
export interface PracticeHit {shotId?:string; target:string; region:'HEAD'|'BODY'; damage:number; remaining:number; killed:boolean; incoming:Vec3Data; point?:Vec3Data}

/** Local fixture only: the real simulation owns every trajectory and hit shape.
 * No bot brain, incident, ragdoll or network session is created here.
 * Optional predictable dummy motion updates the same authoritative player poses. */
export class HitboxPractice {
    readonly players = new Map<string,PlayerData>();
    simulation:ChaosSimulation;
    shots=0;
    hits=0;
    headshots=0;
    kills=0;
    lastHit:PracticeHit|undefined;
    moving=false;
    private motionTime=0;

    constructor(private readonly onHit:(hit:PracticeHit)=>void = ()=>{}) {
        this.players.set('local',createPlayer('local','You',PRACTICE_APPEARANCE,PRACTICE_START));
        for(const target of PRACTICE_TARGETS){
            const data=createPlayer(target.id,target.name,{...PRACTICE_APPEARANCE,coatColor:target.coatColor},target);
            data.meshQy=Math.sin(target.yaw/2);data.meshQw=Math.cos(target.yaw/2);
            this.players.set(target.id,data);
        }
        this.simulation=this.createSimulation();
    }

    private createSimulation(saved?:ReturnType<ChaosSimulation['snapshot']>):ChaosSimulation {
        const initial=saved??new ChaosSimulation(this.players,()=>{},undefined,PRACTICE_WORLD,PRACTICE_SUPPLIES).snapshot(false);
        // Quarantine objectives via the normal saved-state format. Their timers
        // cannot expire during a session; shots keep ordinary live-game tuning.
        initial.dispatch={phase:'cooldown',started:initial.time,until:Number.MAX_SAFE_INTEGER,serial:0};
        initial.case.returningUntil=Number.MAX_SAFE_INTEGER;
        initial.case.pickupAfter=Number.MAX_SAFE_INTEGER;
        initial.case.p={x:0,y:-12,z:0};
        initial.case.v={x:0,y:0,z:0};initial.case.spin={x:0,y:0,z:0};
        const simulation=new ChaosSimulation(this.players,hit=>this.resolveHit(hit),initial,PRACTICE_WORLD,PRACTICE_SUPPLIES);
        simulation.caseBody.type=C.Body.STATIC;
        simulation.caseBody.collisionFilterGroup=0;simulation.caseBody.collisionFilterMask=0;
        // Keep cabinet geometry solid, without enabling launcher controls.
        for(const target of simulation.targets.values())if(target.kind==='pressure'||target.kind==='dispatch')target.kind='world';
        simulation.step(0,initial.time);
        return simulation;
    }

    private resolveHit(hit:ChaosHit):void {
        if(hit.owner!=='local'||hit.victim==='local')return;
        const result=applyHit(this.players,hit.owner,hit.victim,hit.damage,false,null,true);
        if(!result.applied)return;
        const victim=this.players.get(hit.victim)!;
        this.hits++;this.headshots+=Number(hit.headshot===true);this.kills+=Number(result.killed);
        this.lastHit={shotId:hit.shotId,target:hit.victim,region:hit.headshot?'HEAD':'BODY',damage:result.damage,remaining:victim.hp,killed:result.killed,incoming:hit.incoming,point:hit.point};
        // Only health resets. Positions, orientation and visible pose never move.
        // Restoring immediately also keeps the dummy hittable for the next shot.
        if(result.killed)victim.hp=MAX_HP;
        this.onHit(this.lastHit);
    }

    restockRack(id:string):void {
        const saved=this.simulation.snapshot(false),site=saved.pickups?.find(p=>p.id===id),authored=PRACTICE_SUPPLIES.find(p=>p.id===id);
        if(site&&authored){site.kind=authored.kind;site.availableAt=0;this.simulation=this.createSimulation(saved);}
    }
    shoot(shot:ShotDescriptor):boolean {
        if(this.simulation.weapon('local')==='mousetrap')return this.simulation.placeTrap('local',shot.direction);
        this.shots++;this.simulation.shoot('local',shot);return true;
    }
    step(dt:number,now:number):void {
        if(this.moving&&!this.simulation.trapped(PRACTICE_TARGETS[1].id)){this.motionTime+=dt;const target=PRACTICE_TARGETS[1],rat=this.players.get(target.id)!;
            rat.z=target.z+Math.sin(this.motionTime*.9)*2.5;}
        this.simulation.step(dt,now);
    }
    reset():void {
        for(const player of this.players.values()){player.hp=MAX_HP;player.kills=0;player.deaths=0;}
        this.motionTime=0;for(const t of PRACTICE_TARGETS)Object.assign(this.players.get(t.id)!,{x:t.x,y:t.y,z:t.z});
        this.shots=this.hits=this.headshots=this.kills=0;this.lastHit=undefined;
        this.simulation=this.createSimulation();
    }
}
