import * as C from 'cannon-es';
import {ChaosSimulation, type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CITY_PREVIEW_SEED, GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {MAX_HP, type PlayerData, type ShotDescriptor} from '../../src/shared/networkProtocol';
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
export interface PracticeHit {target:string; region:'HEAD'|'BODY'; damage:number; remaining:number; killed:boolean}

/** Local fixture only: the real simulation owns every trajectory and hit shape.
 * No bot brain, movement, incident, ragdoll or network session is created here. */
export class HitboxPractice {
    readonly players = new Map<string,PlayerData>();
    simulation:ChaosSimulation;
    shots=0;
    hits=0;
    headshots=0;
    kills=0;
    lastHit:PracticeHit|undefined;

    constructor(private readonly onHit:(hit:PracticeHit)=>void = ()=>{}) {
        this.players.set('local',createPlayer('local','You',PRACTICE_APPEARANCE,PRACTICE_START));
        for(const target of PRACTICE_TARGETS){
            const data=createPlayer(target.id,target.name,{...PRACTICE_APPEARANCE,coatColor:target.coatColor},target);
            data.meshQy=Math.sin(target.yaw/2);data.meshQw=Math.cos(target.yaw/2);
            this.players.set(target.id,data);
        }
        this.simulation=this.createSimulation();
    }

    private createSimulation():ChaosSimulation {
        const initial=new ChaosSimulation(this.players,()=>{},undefined,PRACTICE_WORLD).snapshot(false);
        // Quarantine objectives via the normal saved-state format. Their timers
        // cannot expire during a session; shots keep ordinary live-game tuning.
        initial.dispatch={phase:'cooldown',started:initial.time,until:Number.MAX_SAFE_INTEGER,serial:0};
        initial.case.returningUntil=Number.MAX_SAFE_INTEGER;
        initial.case.pickupAfter=Number.MAX_SAFE_INTEGER;
        initial.case.p={x:0,y:-12,z:0};
        initial.case.v={x:0,y:0,z:0};initial.case.spin={x:0,y:0,z:0};
        const simulation=new ChaosSimulation(this.players,hit=>this.resolveHit(hit),initial,PRACTICE_WORLD);
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
        this.hits++;this.headshots+=Number(hit.damage===3);this.kills+=Number(result.killed);
        this.lastHit={target:hit.victim,region:hit.damage===3?'HEAD':'BODY',damage:result.damage,remaining:victim.hp,killed:result.killed};
        // Only health resets. Positions, orientation and visible pose never move.
        // Restoring immediately also keeps the dummy hittable for the next shot.
        if(result.killed)victim.hp=MAX_HP;
        this.onHit(this.lastHit);
    }

    shoot(shot:ShotDescriptor):void {this.shots++;this.simulation.shoot('local',shot);}
    step(dt:number,now:number):void {this.simulation.step(dt,now);}
    reset():void {
        for(const player of this.players.values()){player.hp=MAX_HP;player.kills=0;player.deaths=0;}
        this.shots=this.hits=this.headshots=this.kills=0;this.lastHit=undefined;
        this.simulation=this.createSimulation();
    }
}
