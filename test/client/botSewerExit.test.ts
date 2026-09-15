import {afterEach,expect,it,vi} from 'vitest';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createAssignment} from '../../src/shared/assignments';
import type {ChaosState} from '../../src/shared/chaosState';
import {combatRandom} from '../../src/shared/BotCombat';

import {SEWER_PIPE_ENTRANCES,sewerPipePoint,sewerRampOpening,sewerRampAt,sewerRampTravelPoint} from '../../src/shared/sewerLayout';

import {ObjectiveBotBrain} from '../../src/shared/ObjectiveBotBrain';
afterEach(()=>vi.restoreAllMocks());

const exits=SEWER_PIPE_ENTRANCES.flatMap(entry=>[12,22,29].flatMap(depth=>(['jurisdiction','chain-of-custody'] as const).flatMap(mode=>[false,true].map(descending=>({entry,depth,mode,descending})))));
it.each(exits)('$mode carrier crosses $entry.name from $depth, descending=$descending',({entry,depth,mode,descending})=>{
    vi.spyOn(Math,'random').mockImplementation(combatRandom(81));
    const steering=vi.spyOn(ObjectiveBotBrain.prototype,'step');
    const p=sewerPipePoint(entry,depth),start={x:p.x,y:p.floorY+.1,z:p.z};
    const now=1_000_000,bot=createPlayer('carrier','Carrier',DEFAULT_APPEARANCE,start);
    const players=new Map([[bot.id,bot]]);
    const assignment=createAssignment(mode,now,'exit',()=>.3);
    assignment.phase='active';assignment.liveAt=now;
    if(assignment.jurisdiction){
        assignment.jurisdiction.index=assignment.jurisdiction.order.indexOf(descending?'sewer-junction':'central-crossroads');
        assignment.jurisdiction.serial=1;
    }else assignment.destinations=descending?['maintenance']:['records'];
    const state:ChaosState={
        time:now,case:{owner:bot.id,previousOwner:null,pickupAfter:0,returningUntil:0,
            p:{x:bot.x,y:bot.y+1,z:bot.z},v:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1},spin:{x:0,y:0,z:0}},
        dispatch:{phase:'cooldown',started:0,until:now+60000,serial:1},possession:{},
        corpses:[],shots:[],impacts:[],notice:{serial:0,text:''},assignment,
    };
    let recoveries=0,exitAt=0,rampJumps=0,progressAt=0,maxPause=0,progress={...bot};
    const trace:unknown[]=[];
    const controller=new ServerBotController({seed:341283204,version:2},[bot.id],{
        move:(_id,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{recoveries++;},
    },'combined');
    try{
        for(let frame=0;frame<2400;frame++){
            const at=now+frame*1000/60;state.time=at;state.case.p={x:bot.x,y:bot.y+1,z:bot.z};
            const onRamp=sewerRampAt(bot);
            controller.step(1/60,at,players,state,true);
            if(onRamp&&steering.mock.results.at(-1)?.value.jump)rampJumps++;
            steering.mockClear();
            if(frame%120===0)trace.push({t:frame/60,x:bot.x,y:bot.y,z:bot.z});
            if(frame<90||Math.hypot(bot.x-progress.x,bot.z-progress.z)>=.25){progress={...bot};progressAt=frame;}
            maxPause=Math.max(maxPause,(frame-progressAt)/60);
            if(descending?bot.y < -6.5&&!sewerRampOpening(bot.x,bot.z):bot.y>-.3&&bot.y<.4&&!sewerRampOpening(bot.x,bot.z)){exitAt=frame/60;break;}
        }
        const evidence=JSON.stringify({entry:entry.name,depth,end:{x:bot.x,y:bot.y,z:bot.z},exitAt,maxPause,trace});
        expect(exitAt,evidence).toBeGreaterThan(0);
        expect(recoveries,evidence).toBe(0);
        expect(rampJumps,evidence).toBe(0);
        expect(maxPause,evidence).toBeLessThan(2);
    }finally{controller.dispose();}
},30000);

// A target physically on the slope remains approachable; neither the roof above
// it nor an unrelated street beside it is a tunnel traversal.
it.each(SEWER_PIPE_ENTRANCES)('$name ramp preserves local targets and ignores scenery above',entry=>{
    const p=sewerPipePoint(entry,22),from={x:p.x,y:p.floorY+.1,z:p.z};
    const q=sewerPipePoint(entry,16),goal={x:q.x,y:q.floorY+.8,z:q.z};
    expect(sewerRampTravelPoint(from,goal)).toEqual(goal);
    expect(sewerRampTravelPoint({...from,y:0},goal)).toBeUndefined();
    expect(sewerRampTravelPoint({...from,y:p.floorY+6},goal)).toBeUndefined();
});
