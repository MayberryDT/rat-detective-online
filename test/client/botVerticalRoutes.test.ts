import {afterEach,expect,it,vi} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {BOT_LAUNCH_LINKS} from '../../src/shared/BotLaunchRoutes';
import {createAssignment} from '../../src/shared/assignments';

afterEach(()=>vi.restoreAllMocks());
it.each(BOT_LAUNCH_LINKS)('uses the real $machine.id trigger and flight to contest its rooftop carrier',link=>{
    const now=1_000_000,spec={seed:341283204,version:2};vi.spyOn(Date,'now').mockReturnValue(now);vi.spyOn(Math,'random').mockReturnValue(.5);
    const bot=createPlayer('bot','Roof Inspector',DEFAULT_APPEARANCE,{x:link.machine.pad.x,y:0,z:link.machine.pad.z+6});
    const human=createPlayer('human','Rooftop Camper',DEFAULT_APPEARANCE,link.landing);
    const players=new Map([[bot.id,bot],[human.id,human]]),sim=new ChaosSimulation(players,()=>{},undefined,spec);
    const assignment=createAssignment('closing-time',now-3000);assignment.phase='active';sim.setAssignment(assignment);
    sim.caseBody.position.set(human.x,human.y+.8,human.z);sim.step(0,now);expect(sim.caseHolderId).toBe(human.id);
    let shots=0,launched=false,landed=false,peak=0;
    const recover=vi.fn(),controller=new ServerBotController(spec,[bot.id],{
        move:(_,p)=>Object.assign(bot,p),shoot:(id,origin,direction)=>{sim.shoot(id,{shotId:`roof-${++shots}`,origin,direction});},recover,
    });
    try{
        for(let frame=1;frame<=2400&&!landed;frame++){
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

it.each([
    ['alibi-records-upper',-16,-30],['alibi-icebox-upper',130,-25],
    ['alibi-needleworks-upper',-105,116],['alibi-pump-upper',144,145],
] as const)('plans from street level and climbs to %s', (id,x,z)=>{
    const now=1_000_000,spec={seed:341283204,version:2};vi.spyOn(Date,'now').mockReturnValue(now);vi.spyOn(Math,'random').mockReturnValue(.5);
    const bot=createPlayer('bot','Stair Inspector',DEFAULT_APPEARANCE,{x,y:0,z}),players=new Map([[bot.id,bot]]);
    const sim=new ChaosSimulation(players,()=>{},undefined,spec);let claimed=false;
    const recover=vi.fn(),controller=new ServerBotController(spec,[bot.id],{move:(_,p)=>Object.assign(bot,p),shoot:()=>{},recover});
    try{
        for(let frame=1;frame<=3600&&!claimed;frame++){
            const at=now+frame*1000/60,state=sim.snapshot(false);
            controller.step(1/60,at,players,{...state,pickups:state.pickups?.filter(p=>p.id===id)},true);sim.step(1/60,at);
            claimed=sim.drainPickupEvents().some(e=>e.kind==='collected'&&e.playerId===bot.id&&e.pickupId===id);
        }
        expect(claimed,JSON.stringify({x:bot.x,y:bot.y,z:bot.z})).toBe(true);expect(recover).not.toHaveBeenCalled();
    }finally{controller.dispose();}
},30_000);

it.each(BOT_LAUNCH_LINKS)('seeks $machine.id roof armor from the street and returns to street objectives',link=>{
    const now=1_000_000,spec={seed:341283204,version:2};vi.spyOn(Date,'now').mockReturnValue(now);vi.spyOn(Math,'random').mockReturnValue(.5);
    const bot=createPlayer('bot','Supply Inspector',DEFAULT_APPEARANCE,{x:link.machine.pad.x,y:0,z:link.machine.pad.z+6});
    const players=new Map([[bot.id,bot]]),sim=new ChaosSimulation(players,()=>{},undefined,spec);
    const id=sim.snapshot(false).pickups!.find(p=>p.kind==='ironclad'&&p.x===link.landing.x&&p.z===link.landing.z&&Math.abs(p.y-link.landing.y-.7)<.01)!.id;
    let shots=0,claimed=false,returned=false;
    const recover=vi.fn(),controller=new ServerBotController(spec,[bot.id],{
        move:(_,p)=>Object.assign(bot,p),shoot:(owner,origin,direction)=>sim.shoot(owner,{shotId:`supply-${++shots}`,origin,direction}),recover,
    });
    try{
        for(let frame=1;frame<=2400&&!returned;frame++){
            const at=now+frame*1000/60,state=sim.snapshot(false);
            controller.step(1/60,at,players,{...state,pickups:state.pickups?.filter(p=>p.id===id)},true);sim.step(1/60,at);
            claimed ||= sim.drainPickupEvents().some(e=>e.kind==='collected'&&e.playerId===bot.id&&e.pickupId===id);
            returned=claimed&&Math.abs(bot.y)<1;
        }
        expect({claimed,returned},JSON.stringify({id,x:bot.x,y:bot.y,z:bot.z,shots})).toEqual({claimed:true,returned:true});
        expect(recover).not.toHaveBeenCalled();
    }finally{controller.dispose();}
},30_000);
