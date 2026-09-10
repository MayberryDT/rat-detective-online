import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerBotController } from '../../src/worker/ServerBotController';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { createPlayer } from '../../src/worker/gameState';
import { DEFAULT_APPEARANCE } from '../../src/shared/ratAppearance';
import { createAssignment, destinationPoint, CHAIN_ROUTE } from '../../src/shared/assignments';

afterEach(()=>vi.restoreAllMocks());
describe('assignment navigation in the actual city',()=>{
    it.each(CHAIN_ROUTE)('a server bot enters the whole %s landmark using existing geometry',id=>{
        vi.spyOn(Math,'random').mockReturnValue(.12);
        const now=1_000_000,spec={seed:1,version:2};vi.spyOn(Date,'now').mockReturnValue(now);
        const start=destinationPoint(id);
        const bot=createPlayer('bot','Inspector Brie',DEFAULT_APPEARANCE,start),players=new Map([[bot.id,bot]]);
        const sim=new ChaosSimulation(players,()=>{},undefined,spec);
        const assignment=createAssignment('chain-of-custody',now);assignment.destinations=[...CHAIN_ROUTE];
        const completed=CHAIN_ROUTE.indexOf(id);assignment.deliverySerial=completed;assignment.liveAt=now;assignment.phase='active';sim.setAssignment(assignment);
        sim.caseBody.position.set(start.x,start.y+.8,start.z);sim.caseBody.velocity.setZero();sim.step(0,now);
        expect(sim.caseHolderId).toBe(bot.id);
        const recover=vi.fn();
        const controller=new ServerBotController(spec,[bot.id],{
            move:(playerId,p,facing)=>{Object.assign(players.get(playerId)!,p,{meshQx:0,meshQy:Math.sin(facing/2),meshQz:0,meshQw:Math.cos(facing/2)});},
            shoot:()=>{},recover,
        });
        try{
            for(let frame=1;frame<=1200&&sim.assignmentState!.deliverySerial===completed;frame++){
                const at=now+frame*1000/60;
                controller.step(1/60,at,players,sim.snapshot(false),true);sim.step(1/60,at);
            }
            expect({deliverySerial:sim.assignmentState!.deliverySerial,position:{x:bot.x,y:bot.y,z:bot.z}}).toMatchObject({deliverySerial:completed+1});
            expect(sim.assignmentState!.deliveries[bot.id]).toBe(1);expect(sim.assignmentState!.result).toBeUndefined();
            expect(recover).not.toHaveBeenCalled();
        }finally{controller.dispose();}
    },20_000);
});
