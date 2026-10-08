import {afterEach,expect,it,vi} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createAssignment} from '../../src/shared/assignments';
import {GRAYBOX_SPAWNS,GRAYBOX_VERSION,grayboxBoxes} from '../../src/shared/grayboxLayout';
import {CRANES} from '../../src/shared/city/kit/parts/docks';
import {MEZZANINE_Y,PIER9} from '../../src/shared/city/kit/parts/docksWarehouse';
import type {PlayerData} from '../../src/shared/networkProtocol';

afterEach(()=>vi.restoreAllMocks());
const NOW=1_000_000,PRODUCTION=341283204,STAGING=2383011301;

/** A deterministic room: seeded Math.random, a frame clock for Date.now and performance.now (count-bounded planner work).
 * Moves turn the rat as GameRoom does, so a bot's view cone (case papers) faces where it looks. */
function room(seed:number,placed:Record<string,{x:number;y:number;z:number}>,roamers:number,mode:'jurisdiction'|'excessive-force',world=PRODUCTION){
    const spec={seed:world,version:GRAYBOX_VERSION};
    let s=seed*2654435761>>>0;
    vi.spyOn(Math,'random').mockImplementation(()=>{s=s+0x6D2B79F5>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;});
    let clock=NOW;vi.spyOn(Date,'now').mockImplementation(()=>clock);vi.spyOn(performance,'now').mockImplementation(()=>clock);
    const players=new Map<string,PlayerData>();
    for(const [id,p] of Object.entries(placed))players.set(id,createPlayer(id,id,DEFAULT_APPEARANCE,p));
    for(let i=1;i<=roamers;i++){const p=GRAYBOX_SPAWNS[(i*7+seed)%GRAYBOX_SPAWNS.length];players.set(`b${i}`,createPlayer(`b${i}`,`Bot ${i}`,DEFAULT_APPEARANCE,{x:p.x,y:.3,z:p.z}));}
    const sim=new ChaosSimulation(players,()=>{},undefined,spec);
    const assignment=createAssignment(mode,NOW-3000);assignment.phase='active';sim.setAssignment(assignment);
    const recovered:string[]=[];
    const controller=new ServerBotController(spec,[...players.keys()],{move:(id,p,facing)=>Object.assign(players.get(id)!,p,{meshQy:Math.sin(facing/2),meshQw:Math.cos(facing/2)}),shoot:()=>{},recover:id=>recovered.push(id)});
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
    const {players,sim,controller,recovered,run}=room(2,{bot:{x:100,y:.3,z:-140}},0,'excessive-force');
    sim.caseBody.position.set(-110,1,118);sim.caseBody.velocity.setZero();
    let travelled=0,last={x:100,z:-140};
    try{
        run(60,()=>{const bot=players.get('bot')!;travelled+=Math.hypot(bot.x-last.x,bot.z-last.z);last={x:bot.x,z:bot.z};return !!sim.caseHolderId;});
        expect(recovered).toEqual([]);
        expect(travelled).toBeGreaterThan(150);
    }finally{controller.dispose();}
},120_000);

it.each([
    ["the mezzanine's south-west corner",{x:84,y:MEZZANINE_Y,z:-116}],
    ["the harbour master's office",{x:128,y:0,z:-117}],
])('leaves Pier 9 from %s for rivals across the city',(_,start)=>{
    // Staging's worst pocket (11 rescues) and the office below the mezzanine: chasing rats that keep moving far
    // away, straight-line steps end against walls whose ways out (the stairs, the office door) lie behind the bot.
    const {players,controller,recovered,run}=room(3,{bot:start},8,'excessive-force');
    let out=0,travelled=0,last={x:start.x,z:start.z};
    try{
        run(60,t=>{
            const bot=players.get('bot')!;
            if(!out&&(bot.x<PIER9.x0-1||bot.x>PIER9.x1+1||bot.z<PIER9.z0-1||bot.z>PIER9.z1+1))out=t;
            if(out)travelled+=Math.hypot(bot.x-last.x,bot.z-last.z);
            last={x:bot.x,z:bot.z};
        });
        expect({out:out>0&&out<20,recovered},JSON.stringify({out,bot:players.get('bot')})).toEqual({out:true,recovered:[]});
        expect(travelled).toBeGreaterThan(40);
    }finally{controller.dispose();}
},240_000);

it.each([[-79,2],[-111,-36]])('walks off the building roof a launcher threw it onto at (%d, %d)',(x,z)=>{
    // Staging's roof:west:2 and roof:west:6: solid building masses the walk graph has no floor on.
    const roof=grayboxBoxes({seed:STAGING,version:GRAYBOX_VERSION}).find(b=>b.h>4&&Math.abs(b.x-x)<b.w/2&&Math.abs(b.z-z)<b.d/2)!;
    const top=roof.y+roof.h/2;
    const {players,controller,recovered,run}=room(4,{bot:{x,y:top,z}},8,'jurisdiction',STAGING);
    let down=0;
    try{
        run(40,t=>{if(!down&&players.get('bot')!.y<top-2)down=t;});
        expect({down:down>0&&down<10,recovered},JSON.stringify({down,top,bot:players.get('bot')})).toEqual({down:true,recovered:[]});
    }finally{controller.dispose();}
},240_000);
