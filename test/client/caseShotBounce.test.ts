import {expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T} from '../../src/shared/chaosState';
import {createPlayer} from '../../src/worker/gameState';

vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
function fixture(){
    const shooter=createPlayer('shooter','Shooter',appearance,{x:-20,y:0,z:20});
    const players=new Map([[shooter.id,shooter]]),hits=vi.fn();
    const sim=new ChaosSimulation(players,hits);
    const ground=new C.Body({mass:0,shape:new C.Box(new C.Vec3(80,.5,80)),position:new C.Vec3(0,-.5,0)});
    const wall=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.05,8,30)),position:new C.Vec3(12,8,0)});
    for(const body of [ground,wall]){sim.world.addBody(body);sim.targets.set(body,{kind:'world'});}
    sim.caseBody.position.set(0,.7,0);sim.caseBody.velocity.setZero();sim.step(0,1000);
    return {sim,players,hits};
}
it('launches an ordinary case into a visible tumble and bounces it off real walls and floor',()=>{
    const {sim,hits}=fixture();
    sim.shoot('shooter',{shotId:'kick',origin:{x:-2,y:.7,z:0},direction:{x:1,y:0,z:0}});
    sim.step(.01,1010);
    const start=sim.caseBody.position.clone();let peak=start.y,travel=0,wallBounce=false,floorBounce=false;
    for(let tick=1;tick<=150;tick++){
        const before=sim.caseBody.velocity.clone();
        sim.step(1/60,1010+tick*1000/60);
        const b=sim.caseBody;peak=Math.max(peak,b.position.y);travel=Math.max(travel,b.position.distanceTo(start));
        if(before.x>5&&b.velocity.x< -1)wallBounce=true;
        if(before.y< -2&&b.velocity.y>1)floorBounce=true;
        expect(b.position.x).toBeLessThan(12.1);
    }
    expect(peak).toBeGreaterThan(2);expect(travel).toBeGreaterThan(8);
    expect(wallBounce).toBe(true);expect(floorBounce).toBe(true);
    expect(sim.caseHolderId).toBeNull();expect(hits).not.toHaveBeenCalled();
});
it('disarms a carrier and gives the airborne case time to move before a nearby rat can collect it',()=>{
    const {sim,players}=fixture();
    const carry=createPlayer('carry','Carry',appearance,{x:0,y:0,z:0});players.set(carry.id,carry);
    sim.step(0,1001);expect(sim.caseHolderId).toBe(carry.id);
    const nearby=createPlayer('nearby','Nearby',appearance,{x:.7,y:0,z:1});players.set(nearby.id,nearby);
    sim.shoot('shooter',{shotId:'disarm',origin:{x:3,y:.55,z:.02},direction:{x:-1,y:0,z:0}});
    sim.step(.02,1021);
    expect(sim.caseHolderId).toBeNull();
    expect(sim.caseBody.velocity.x).toBeLessThan(-25);expect(sim.caseBody.velocity.y).toBeGreaterThanOrEqual(10);
    // A slow case is still collectible; this does not add a fixed pickup delay for everyone.
    sim.caseBody.position.set(nearby.x,nearby.y+.8,nearby.z);sim.caseBody.velocity.setZero();
    sim.step(0,1040);expect(sim.caseHolderId).toBe(nearby.id);
});
it('bounds ordinary repeated-shot speed while keeping a useful lift',()=>{
    const {sim}=fixture();sim.caseBody.position.y=8;sim.caseBody.velocity.set(40,-30,0);
    sim.shoot('shooter',{shotId:'repeat',origin:{x:-2,y:8,z:0},direction:{x:1,y:0,z:0}});
    sim.step(.001,1001);
    // The shot catches the moving case; stacked momentum is capped at impact.
    sim.step(.01,1011);
    expect(sim.caseBody.velocity.length()).toBeLessThanOrEqual(T.caseShotMaxSpeed+.01);
    expect(sim.caseBody.velocity.y).toBeGreaterThan(5);
});
