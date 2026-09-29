import {afterEach,expect,it,vi} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createAssignment} from '../../src/shared/assignments';
import {GRAYBOX_SPAWNS,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {CRANES} from '../../src/shared/city/kit/parts/docks';
import type {PlayerData} from '../../src/shared/networkProtocol';

afterEach(()=>vi.restoreAllMocks());
const NOW=1_000_000,spec={seed:341283204,version:GRAYBOX_VERSION};

/** A deterministic room: seeded Math.random, a frame clock for Date.now and performance.now (count-bounded planner work). */
function room(seed:number,placed:Record<string,{x:number;y:number;z:number}>,roamers:number,mode:'jurisdiction'|'closing-time'){
    let s=seed*2654435761>>>0;
    vi.spyOn(Math,'random').mockImplementation(()=>{s=s+0x6D2B79F5>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;});
    let clock=NOW;vi.spyOn(Date,'now').mockImplementation(()=>clock);vi.spyOn(performance,'now').mockImplementation(()=>clock);
    const players=new Map<string,PlayerData>();
    for(const [id,p] of Object.entries(placed))players.set(id,createPlayer(id,id,DEFAULT_APPEARANCE,p));
    for(let i=1;i<=roamers;i++){const p=GRAYBOX_SPAWNS[(i*7+seed)%GRAYBOX_SPAWNS.length];players.set(`b${i}`,createPlayer(`b${i}`,`Bot ${i}`,DEFAULT_APPEARANCE,{x:p.x,y:.3,z:p.z}));}
    const sim=new ChaosSimulation(players,()=>{},undefined,spec);
    const assignment=createAssignment(mode,NOW-3000);assignment.phase='active';sim.setAssignment(assignment);
    const recovered:string[]=[];
    const controller=new ServerBotController(spec,[...players.keys()],{move:(id,p)=>Object.assign(players.get(id)!,p),shoot:()=>{},recover:id=>recovered.push(id)},'combined');
    const run=(seconds:number,each:(t:number)=>boolean|void=()=>{})=>{
        for(let frame=1;frame<=seconds*60;frame++){
            clock=NOW+frame*1000/60;
            controller.step(1/60,clock,players,sim.snapshot(false),true);sim.step(1/60,clock);
            if(each(frame/60))return;
        }
    };
    return{players,sim,controller,recovered,run};
}

it('rescues a bot pacing a crane stair landing, where escape hops and local jitter are not progress',()=>{
    // Crane No. 2's first landing: railed on three sides, a flight up and a flight down, no local step toward a far goal.
    const landing={x:CRANES[1].x+8.2,y:6.5,z:-159.2};
    const {players,controller,recovered,run}=room(1,{bot:landing},8,'jurisdiction');
    let left=0;
    try{
        run(100,t=>{
            const bot=players.get('bot')!,away=Math.hypot(bot.x-landing.x,bot.z-landing.z);
            // Down on the quay, or well clear of the tower (a hop up the next flight is not leaving).
            if(!left&&(bot.y<2.5&&away>4||away>30))left=t;
            return recovered.includes('bot')||left>0;
        });
        expect(recovered.includes('bot')||left>0,JSON.stringify({bot:players.get('bot'),recovered})).toBe(true);
    }finally{controller.dispose();}
},240_000);

it('never rescues a bot that keeps reaching route waypoints across the city',()=>{
    // A long foot journey from the docks to a case in the south-west, with no rivals to distract it.
    const {players,sim,controller,recovered,run}=room(2,{bot:{x:100,y:.3,z:-140}},0,'closing-time');
    sim.caseBody.position.set(-110,1,118);sim.caseBody.velocity.setZero();
    let travelled=0,last={x:100,z:-140};
    try{
        run(60,()=>{const bot=players.get('bot')!;travelled+=Math.hypot(bot.x-last.x,bot.z-last.z);last={x:bot.x,z:bot.z};return !!sim.caseHolderId;});
        expect(recovered).toEqual([]);
        expect(travelled).toBeGreaterThan(150);
    }finally{controller.dispose();}
},120_000);
