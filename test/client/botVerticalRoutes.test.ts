import {afterEach,expect,it,vi} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {BOT_LAUNCH_LINKS} from '../../src/shared/BotLaunchRoutes';
import {createAssignment} from '../../src/shared/assignments';

afterEach(()=>vi.restoreAllMocks());
/** Where on each roof the carrier shows itself at the edge, in sight of the bot below (offset from the landing), before
 * stepping back out of sight: a bot knows an unseen carrier only from its own sight (P4), so it has to have seen this one up there. */
const EDGE:Record<string,[number,number]>={dumpster:[0,6],freight:[0,11],mousetrap:[0,10],pressure:[0,7],geyser:[-9,0]};
it.each(BOT_LAUNCH_LINKS)('uses the real $machine.id trigger and flight to contest its rooftop carrier',link=>{
    const now=1_000_000,spec={seed:341283204,version:2};vi.spyOn(Date,'now').mockReturnValue(now);vi.spyOn(Math,'random').mockReturnValue(.5);
    const bot=createPlayer('bot','Roof Inspector',DEFAULT_APPEARANCE,{x:link.machine.pad.x,y:0,z:link.machine.pad.z+6});
    const [ex,ez]=EDGE[link.machine.id]!,human=createPlayer('human','Rooftop Camper',DEFAULT_APPEARANCE,{x:link.landing.x+ex,y:link.landing.y,z:link.landing.z+ez});
    const players=new Map([[bot.id,bot],[human.id,human]]),sim=new ChaosSimulation(players,()=>{},undefined,spec);
    const assignment=createAssignment('excessive-force',now-3000);assignment.phase='active';sim.setAssignment(assignment);
    sim.caseBody.position.set(human.x,human.y+.8,human.z);sim.step(0,now);expect(sim.caseHolderId).toBe(human.id);
    let shots=0,launched=false,landed=false,peak=0;
    const recover=vi.fn(),controller=new ServerBotController(spec,[bot.id],{
        move:(_,p)=>Object.assign(bot,p),shoot:(id,origin,direction)=>{sim.shoot(id,{shotId:`roof-${++shots}`,origin,direction});},recover,
    });
    try{
        for(let frame=1;frame<=2400&&!landed;frame++){
            if(frame===20)Object.assign(human,{x:link.landing.x,y:link.landing.y,z:link.landing.z});
            const at=now+frame*1000/60,state=sim.snapshot(false);
            // Isolate pursuit from incidental supplies, never fake a launch.
            controller.step(1/60,at,players,{...state,pickups:[]},true);sim.step(1/60,at);
            launched ||= sim.snapshot(false).pressure?.launches.some(e=>e.playerId===bot.id&&e.machineId===link.machine.id)??false;
            peak=Math.max(peak,bot.y);
            landed=launched&&Math.abs(bot.y-link.landing.y)<1&&Math.hypot(bot.x-human.x,bot.z-human.z)<8&&
                controller.world.contacts.some(c=>c.bi.mass>0&&-c.ni.y>.5||c.bj.mass>0&&c.ni.y>.5);
        }
        expect({launched,landed},JSON.stringify({shots,peak,x:bot.x,y:bot.y,z:bot.z})).toEqual({launched:true,landed:true});
        expect(recover).not.toHaveBeenCalled();
    }finally{controller.dispose();}
},30_000);
