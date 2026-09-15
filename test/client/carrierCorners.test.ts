import {afterEach,expect,it,vi} from 'vitest';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createAssignment} from '../../src/shared/assignments';
import {LANDMARK_INTERIORS} from '../../src/shared/landmarkLayout';
import type {ChaosState} from '../../src/shared/chaosState';
import {combatRandom} from '../../src/shared/BotCombat';
import {PICKUP_ANCHORS} from '../../src/shared/pickups';

afterEach(()=>vi.restoreAllMocks());
const corners=LANDMARK_INTERIORS.flatMap(h=>[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>({
    ...h,start:{x:h.cx+x*(h.w/2-4),y:.3,z:h.cz+z*(h.d/2-4)},maxPause:2,
})));
const upstairs=LANDMARK_INTERIORS.map(h=>{
    const p=PICKUP_ANCHORS.find(p=>p.id===`alibi-${h.id}-upper`)!;
    return {...h,start:{x:p.x,y:p.y!-.7,z:p.z},maxPause:6};
});

// Cold shared flow fields, actual city colliders and ordinary server movement.
// A carrier must leave through a doorway without requiring a recovery teleport.
// Checking only eventual exit missed the several-second corner death traps.
it.each([...corners,...upstairs])('carrier exits $id from $start toward the next Jurisdiction zone',h=>{
    vi.spyOn(Math,'random').mockImplementation(combatRandom(81));
    const now=1_000_000,bot=createPlayer('carrier','Carrier',DEFAULT_APPEARANCE,h.start);
    const players=new Map([[bot.id,bot]]);
    const assignment=createAssignment('jurisdiction',now,'exit',()=>.3);
    assignment.phase='active';assignment.liveAt=now;
    assignment.jurisdiction!.index=assignment.jurisdiction!.order.indexOf('central-crossroads');
    assignment.jurisdiction!.serial=1;
    const state:ChaosState={
        time:now,case:{owner:bot.id,previousOwner:null,pickupAfter:0,returningUntil:0,
            p:{x:bot.x,y:1,z:bot.z},v:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1},spin:{x:0,y:0,z:0}},
        dispatch:{phase:'cooldown',started:0,until:now+60000,serial:1},possession:{},
        corpses:[],shots:[],impacts:[],notice:{serial:0,text:''},assignment,
    };
    let recoveries=0,exitAt=0,progressAt=0,maxPause=0,progress={...bot};
    const controller=new ServerBotController({seed:341283204,version:2},[bot.id],{
        move:(_id,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{recoveries++;},
    },'combined');
    try{
        for(let frame=0;frame<2400;frame++){
            const at=now+frame*1000/60;state.time=at;state.case.p={x:bot.x,y:bot.y+1,z:bot.z};
            controller.step(1/60,at,players,state,true);
            // Jumping in place is not route progress. Use authoritative movement
            // callbacks, not private brain state or a mocked navigation graph.
            if(frame<90||Math.hypot(bot.x-progress.x,bot.z-progress.z)>=.25){progress={...bot};progressAt=frame;}
            maxPause=Math.max(maxPause,(frame-progressAt)/60);
            if(Math.abs(bot.x-h.cx)>h.w/2+1||Math.abs(bot.z-h.cz)>h.d/2+1){exitAt=frame/60;break;}
        }
        const evidence=JSON.stringify({building:h.id,start:h.start,end:{x:bot.x,y:bot.y,z:bot.z},exitAt,maxPause});
        expect(exitAt,evidence).toBeGreaterThan(0);
        expect(recoveries,evidence).toBe(0);
        expect(maxPause,evidence).toBeLessThan(h.maxPause);
    }finally{controller.dispose();}
},30000);
