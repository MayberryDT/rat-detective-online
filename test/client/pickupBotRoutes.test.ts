import {expect,it,vi,afterEach} from 'vitest';
import { MAX_HP } from '../../src/shared/networkProtocol';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {PICKUP_ANCHORS} from '../../src/shared/pickups';
afterEach(()=>vi.restoreAllMocks());
/** Where the bot starts, from the site: five units along an open side (south unless listed). */
const FROM:Record<string,readonly [number,number]>={
    'pursuit-gate-mouth':[-5,0],'pursuit-quay-west':[5,0],'pursuit-icebox-mouth':[-5,0],'pursuit-south-avenue':[5,0],
    'fix-south-central':[0,-5],'fix-container-yard':[5,0],'alibi-pump-floor':[0,-5],'alibi-needleworks-floor':[-5,0],
    'alibi-cellblock-gallery':[5,0],'fix-precinct-hall':[5,0],'fix-gate-alley':[-5,0],'fix-needleworks-corner':[5,0],
    'fix-south-lot':[0,-5],'fix-pump-north':[0,-5],'fix-records-corner':[5,0],'fix-icebox-corner':[5,0],'fix-pier9-lane':[0,-5],
};
it.each(PICKUP_ANCHORS.map(a=>[a.id,...(FROM[a.id]??[0,5])] as const))('server bot physically reaches and claims %s in the real city', (id,dx,dz)=>{
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
        if(pickup.kind==='quick-fix')expect(bot.hp).toBe(MAX_HP);
        else expect(sim.snapshot(false).buffs?.[bot.id]).toBeDefined();
    }finally{controller.dispose();}
},15_000);
