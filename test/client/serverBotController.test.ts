import {describe,it,expect,vi} from 'vitest';
import * as C from 'cannon-es';
import {ServerBotController,serverBotMuzzle} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createWorldSpec} from '../../src/shared/worldSpec';
import {DISPATCH_STATIONS,type ChaosState} from '../../src/shared/chaosState';
import type {Vec3Data} from '../../src/shared/networkProtocol';

const navigation=vi.hoisted(()=>({route:vi.fn((_from:Vec3Data,to:Vec3Data)=>[to]),update:vi.fn()}));
vi.mock('../../src/shared/BotNavigation',()=>({BotNavigation:class{
    explorationTargets(){return[{x:50,y:0,z:50},{x:-50,y:0,z:-50}];}
    route=navigation.route;update=navigation.update;localStep(){return undefined;}
}}));
vi.mock('../../src/shared/grayboxLayout',async original=>{
    const actual=await original<typeof import('../../src/shared/grayboxLayout')>();
    return{...actual,grayboxBoxes:()=>[{x:0,y:-.25,z:0,w:1000,h:.5,d:1000,rx:0,rz:0}]};
});
function state(time=1000):ChaosState {
    return{time,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:40,y:0,z:0},v:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1},spin:{x:0,y:0,z:0}},dispatch:{phase:'cooldown',started:0,until:5000,serial:1},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''}};
}
function fixture(){
    navigation.route.mockImplementation((_from,to)=>[to]);
    const bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,{x:0,y:0,z:0});
    const human=createPlayer('human','Human',DEFAULT_APPEARANCE,{x:10,y:0,z:0});
    const players=new Map([[bot.id,bot],[human.id,human]]),events:string[]=[];
    const move=vi.fn((id:string,p:Vec3Data)=>{events.push('move');Object.assign(players.get(id)!,p);});
    const shoot=vi.fn(()=>{events.push('shoot');});
    const recover=vi.fn(),recoverCase=vi.fn();
    const controller=new ServerBotController({...createWorldSpec(42),version:2},['bot'],{move,shoot,recover,recoverCase});
    return{controller,players,bot,human,move,shoot,events,recover,recoverCase};
}
describe('hosted server bot controller',()=>{
    it('publishes normal-speed movement at twenty Hz plus pre-shot poses with source timestamps',()=>{
        const {controller,players,bot,move}=fixture();players.delete('human');
        for(let i=0;i<=120;i++)controller.step(1/60,1000+i*1000/60,players,state(1000+i*1000/60),true);
        expect(bot.x).toBeGreaterThan(11);expect(bot.x).toBeLessThan(14);
        expect(move.mock.calls.length).toBeGreaterThanOrEqual(39);
        expect(move.mock.calls.length).toBeLessThanOrEqual(50);
        const times=(move.mock.calls as unknown as [string,Vec3Data,number,number][]).map(c=>c[3]);
        for(let i=1;i<times.length;i++){expect(times[i]-times[i-1]).toBeGreaterThanOrEqual(0);expect(times[i]-times[i-1]).toBeLessThanOrEqual(50.0001);}
        controller.dispose();
    });
    it('rescues a genuinely trapped bot even when the planner claims a usable route',()=>{
        const {controller,players,bot,recover}=fixture();players.delete('human');
        for(const [x,z,w,d] of [[1.2,0,.2,4],[-1.2,0,.2,4],[0,1.2,4,.2],[0,-1.2,4,.2]]){
            controller.world.addBody(new C.Body({mass:0,shape:new C.Box(new C.Vec3(w/2,15,d/2)),position:new C.Vec3(x,15,z)}));
        }
        for(let i=0;i<2400;i++)controller.step(1/60,1000+i*1000/60,players,state(1000+i*1000/60),true);
        expect(recover).toHaveBeenCalledWith(bot.id);
        controller.dispose();
    });
    it('recovers stationary loose evidence after multiple failed approaches, but respects a nearby human',()=>{
        navigation.route.mockReturnValue([]);
        const bots=[0,1,2].map(i=>createPlayer(`bot-${i}`,'Bot',DEFAULT_APPEARANCE,{x:-80+i*10,y:0,z:-80}));
        const players=new Map(bots.map(p=>[p.id,p])),recoverCase=vi.fn();
        const controller=new ServerBotController({...createWorldSpec(42),version:2},bots.map(p=>p.id),{
            move:(id,p)=>Object.assign(players.get(id)!,p),shoot:()=>{},recoverCase,
        });
        for(let t=1000;t<=35000;t+=100)controller.step(1/60,t,players,state(t),true);
        expect(recoverCase).toHaveBeenCalledTimes(1);recoverCase.mockClear();
        players.set('human',createPlayer('human','Human',DEFAULT_APPEARANCE,{x:40,y:0,z:0}));
        for(let t=35100;t<=71000;t+=100)controller.step(1/60,t,players,state(t),true);
        expect(recoverCase).not.toHaveBeenCalled();controller.dispose();
    });
    it('does not relocate a bot that is physically escaping an unsupported roof',()=>{
        const {controller,players,bot,human,move,recover}=fixture();
        navigation.route.mockReturnValue([]);
        controller.world.addBody(new C.Body({mass:0,shape:new C.Box(new C.Vec3(100,.5,100)),position:new C.Vec3(0,29.5,0)}));
        bot.y=30;
        const original={...human};
        for(let t=1000;t<38000;t+=100)controller.step(1/60,t,players,state(t),true);
        expect(move.mock.calls.some(([,p])=>Math.hypot(p.x,p.z)>1)).toBe(true);
        expect(recover).not.toHaveBeenCalled();
        for(let t=38000;t<51000;t+=100)controller.step(1/60,t,players,state(t),true);
        expect(recover).not.toHaveBeenCalled();
        expect(human).toEqual(original);controller.dispose();
    });
    it('steers physically toward the case, sends pose before a muzzle shot and never moves humans',()=>{
        const {controller,players,bot,human,move,shoot,events}=fixture(),humanBefore={...human};
        controller.step(1/60,1000,players,state(),true);
        expect(shoot).not.toHaveBeenCalled();
        let now=1017;
        for(;now<1600&&!shoot.mock.calls.length;now+=17)controller.step(1/60,now,players,state(now),true);
        const shotIndex=events.indexOf('shoot');expect(shotIndex).toBeGreaterThan(0);
        expect(events[shotIndex-1]).toBe('move');expect(shoot).toHaveBeenCalledTimes(1);
        const call=shoot.mock.calls[0] as unknown as [string,Vec3Data,Vec3Data];
        expect(call[0]).toBe('bot');expect(Math.hypot(call[2].x,call[2].y,call[2].z)).toBeCloseTo(1);
        expect(Math.hypot(call[1].x-bot.x,call[1].y-bot.y,call[1].z-bot.z)).toBeLessThan(2);
        for(let i=1;i<=12;i++)controller.step(1/60,now+i*17,players,state(now+i*17),true);
        expect(bot.x).toBeGreaterThan(0);expect(human).toEqual(humanBefore);
        expect(move.mock.calls.every(([id])=>id==='bot')).toBe(true);
        expect(navigation.update).toHaveBeenCalledWith(2,96);controller.dispose();
    });
    it('waits for authoritative death and respawn state, with reset clearing old momentum',()=>{
        const {controller,players,bot,move,shoot}=fixture();controller.step(1/60,1000,players,state(),true);
        bot.hp=0;move.mockClear();shoot.mockClear();controller.step(1/60,10000,players,state(10000),true);
        expect(move).not.toHaveBeenCalled();expect(shoot).not.toHaveBeenCalled();expect(controller.world.bodies.filter(body=>body.mass>0)).toHaveLength(0);
        Object.assign(bot,{hp:3,x:70,y:0,z:70});controller.reset('bot',bot);
        const body=controller.world.bodies.find(body=>body.mass>0)!;
        expect(body.position.x).toBe(70);expect(body.velocity.length()).toBe(0);
        controller.step(1/60,10020,players,state(10020),true);expect(move).toHaveBeenCalled();controller.dispose();
    });
    it('freezes on victory and resumes at server round-reset positions',()=>{
        const {controller,players,bot,move,shoot}=fixture();controller.step(1/60,1000,players,state(),true);
        move.mockClear();shoot.mockClear();controller.step(1/60,1020,players,state(),false);
        expect(move).not.toHaveBeenCalled();expect(shoot).not.toHaveBeenCalled();
        Object.assign(bot,{x:-80,y:0,z:80});controller.step(1/60,8000,players,state(8000),true);
        expect(move.mock.calls[0][1].x).toBeCloseTo(-80,1);expect(move.mock.calls[0][1].z).toBeCloseTo(80,1);controller.dispose();
    });
    it('applies pressure launches once, preserves their force, and ignores stale launch history after reset',()=>{
        const {controller,players,bot}=fixture();controller.step(1/60,1000,players,state(),true);
        const launch=state(1017);launch.pressure={serial:1,until:3000,launches:[
            {id:'launch-old',playerId:'bot',at:1016,velocity:{x:12,y:20,z:0}},
            {id:'launch-new',playerId:'bot',at:1017,velocity:{x:30,y:40,z:0}},
        ]};
        controller.step(1/60,1017,players,launch,true);
        const body=controller.world.bodies.find(body=>body.mass>0)!;
        expect(body.velocity.x).toBeGreaterThan(29);expect(body.velocity.y).toBeGreaterThan(39);
        controller.step(1/60,1034,players,launch,true);expect(body.velocity.y).toBeLessThan(39.5);
        controller.reset('bot',bot);controller.step(1/60,1051,players,launch,true);expect(body.velocity.y).toBeLessThan(5);
        controller.dispose();
    });
    it('shoots a visible Dispatch red face without routing away from the case',()=>{
        const {controller,players,bot,shoot}=fixture(),target=DISPATCH_STATIONS[0].target;
        Object.assign(bot,{x:target.x,y:0,z:target.z+12});const ready=state();ready.dispatch.phase='ready';ready.case.p={x:100,y:0,z:100};players.delete('human');
        controller.step(1/60,1000,players,ready,true);expect(shoot).toHaveBeenCalledTimes(1);
        const [,origin,direction]=shoot.mock.calls[0] as unknown as [string,Vec3Data,Vec3Data];
        const distance=(target.z-origin.z)/direction.z;
        expect(Math.abs(origin.x+direction.x*distance-target.x)).toBeLessThan(.1);
        expect(Math.abs(origin.y+direction.y*distance-target.y)).toBeLessThan(.1);controller.dispose();
    });
    it('uses real ground contacts for its jump and keeps the normal physical jump impulse',()=>{
        const {controller,players}=fixture();
        for(let i=0;i<10;i++)controller.step(1/60,1000+i*17,players,state(1000+i*17),true);
        const body=controller.world.bodies.find(body=>body.mass>0)!;
        body.velocity.x=0;body.velocity.z=0; // A grounded obstruction triggers the recovery jump.
        controller.step(1/60,1170,players,state(1170),true);
        expect(body.velocity.y).toBeGreaterThan(15);expect(body.position.y).toBeGreaterThan(0);controller.dispose();
    });
    it('derives a compact yaw-relative gun origin and disposes idempotently',()=>{
        const origin=serverBotMuzzle({x:5,y:2,z:3},0);expect(origin.x).toBeCloseTo(4.51);expect(origin.y).toBeCloseTo(3.376);expect(origin.z).toBeCloseTo(3.47);
        const rotated=serverBotMuzzle({x:0,y:0,z:0},Math.PI/2);expect(rotated.x).toBeCloseTo(.47);expect(rotated.z).toBeCloseTo(.49);
        const {controller,players,move}=fixture();controller.dispose();controller.dispose();controller.step(1/60,1000,players,state(),true);
        expect(move).not.toHaveBeenCalled();expect(controller.world.bodies).toHaveLength(0);
    });
});
