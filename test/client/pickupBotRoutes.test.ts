import {expect,it,vi,afterEach} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
afterEach(()=>vi.restoreAllMocks());
it.each([
    ['alibi-icebox-upper',-5,0],['alibi-records-upper',0,5],['alibi-records-roof',0,5],['pursuit-gate-mouth',-5,0],['fix-sluice',0,5],
] as const)('server bot physically reaches and claims %s in the real city', (id,dx,dz)=>{
    const now=1_000_000,spec={seed:341283204,version:2};vi.spyOn(Date,'now').mockReturnValue(now);
    const bot=createPlayer('rd-ai-test','Supply Inspector',DEFAULT_APPEARANCE,{x:0,y:0,z:0});bot.hp=2;
    const players=new Map([[bot.id,bot]]),sim=new ChaosSimulation(players,()=>{},undefined,spec);
    const pickup=sim.snapshot(false).pickups!.find(p=>p.id===id)!;
    Object.assign(bot,{x:pickup.x+dx,y:pickup.y-.7,z:pickup.z+dz});
    const controller=new ServerBotController(spec,[bot.id],{move:(_,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{}});
    let claimed=false;
    try{
        for(let i=1;i<=900&&!claimed;i++){
            const at=now+i*1000/60;
            controller.step(1/60,at,players,sim.snapshot(false),true);sim.step(1/60,at);
            claimed=sim.drainPickupEvents().some(e=>e.kind==='collected'&&e.playerId===bot.id&&e.pickupId===id);
        }
        expect(claimed,JSON.stringify({id,position:{x:bot.x,y:bot.y,z:bot.z}})).toBe(true);
        if(pickup.kind==='quick-fix')expect(bot.hp).toBe(3);
        else expect(sim.snapshot(false).buffs?.[bot.id]).toBeDefined();
    }finally{controller.dispose();}
},15_000);
