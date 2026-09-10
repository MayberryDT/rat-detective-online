import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {FoleyWorld} from '../../src/audio/FoleyWorld';
import {MotionFoley} from '../../src/audio/MotionFoley';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {LAUNCH_MACHINES} from '../../src/shared/chaosState';
import type {FoleyAudio} from '../../src/audio/FoleyAudio';
import {emitWorldSound} from '../../src/audio/WorldSoundEvents';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},grayboxBoxes:()=>[]}));
afterEach(()=>vi.restoreAllMocks());
const point={x:0,y:0,z:-10},normal={x:0,y:1,z:0};
function fixture(wall=false){
    const audio={play:vi.fn(),setEnabled:vi.fn(),update:vi.fn()},scene=new THREE.Scene();
    if(wall){const mesh=new THREE.Mesh(new THREE.BoxGeometry(6,8,1),new THREE.MeshBasicMaterial());mesh.position.set(0,2,-5);mesh.userData.aimTarget=true;scene.add(mesh);scene.updateMatrixWorld(true);}
    const foley=new FoleyWorld(audio as unknown as FoleyAudio,scene),camera=new THREE.PerspectiveCamera(70,1,.1,100);
    camera.position.set(0,3,0);camera.lookAt(0,0,-10);foley.listener(camera);foley.setEnabled(true);
    const state=new ChaosSimulation(new Map(),()=>{}).snapshot();state.time=1000;
    vi.spyOn(performance,'now').mockImplementation(()=>state.time);foley.apply(state);
    const advance=(ms=200)=>{state.time+=ms;foley.apply(state);};
    return {audio,foley,state,scene,camera,advance};
}
it('adds one cartoon accent for a visible corpse impact without replaying duplicates or stale snapshots',()=>{
    const {audio,foley,state,advance}=fixture();
    state.impacts=[{p:point,n:normal,surface:true,foley:'corpse-hit',scale:9,energy:175}];
    advance();expect(audio.play.mock.calls.map(c=>c[0])).toEqual(['corpse-hit']);
    foley.apply(state);advance(1000);expect(audio.play).toHaveBeenCalledOnce();
    foley.dispose();
});
it('leaves removed incident accents, ordinary ricochets and autonomous motion silent',()=>{
    const {audio,foley,state,advance}=fixture();
    state.impacts=['bounce','trigger','trigger-busy','burst','grow','charge','split','unstick'].map(foley=>({p:point,n:normal,surface:true,foley:foley as 'bounce',energy:175}));
    state.dispatch={phase:'active',incident:'evidence-tampering',serial:1,started:1200,until:26200};
    state.case.p=point;state.case.v={x:50,y:0,z:0};state.case.spin={x:10,y:10,z:10};
    for(let i=0;i<100;i++)advance(50);
    expect(audio.play).not.toHaveBeenCalled();foley.dispose();
});
it('requires a nearby visible source and a meaningful impact rather than playing across the city',()=>{
    const {audio,foley,state,advance}=fixture();
    for(const [p,energy] of [[{x:0,y:0,z:-100},100],[{x:0,y:0,z:5},100],[point,4]] as const){
        state.impacts=[{p,n:normal,surface:true,foley:'case-bounce',energy}];advance();
    }
    expect(audio.play).not.toHaveBeenCalled();
    state.impacts=[{p:point,n:normal,surface:true,foley:'case-bounce',energy:35}];advance();
    expect(audio.play.mock.calls.map(c=>c[0])).toEqual(['case-floor']);foley.dispose();
});
it('suppresses hidden sources and bounds visibility queries during heavy traffic',()=>{
    const {audio,foley,state,advance}=fixture(true),ray=vi.spyOn(THREE.Raycaster.prototype,'intersectObjects');
    state.impacts=Array.from({length:64},(_,i)=>({p:{...point,x:(i%3-1)*.2},n:normal,surface:true,foley:'corpse-hit' as const,energy:175,scale:4}));
    advance();expect(ray).toHaveBeenCalledTimes(3);expect(audio.play).not.toHaveBeenCalled();
    advance(50);expect(ray).toHaveBeenCalledTimes(3);
    advance(200);expect(ray).toHaveBeenCalledTimes(6);foley.dispose();
});
it('never stacks several impact accents from the same snapshot',()=>{
    const {audio,foley,state,advance}=fixture();
    state.impacts=Array.from({length:64},(_,i)=>({p:{...point,z:-10-i*.01},n:normal,surface:true,foley:'corpse-hit' as const,energy:175,scale:4}));
    advance();expect(audio.play).toHaveBeenCalledOnce();advance(50);expect(audio.play).toHaveBeenCalledOnce();foley.dispose();
});
it('keeps every launcher silent both when it activates and when its cooldown expires',()=>{
    const {audio,foley,state,camera,advance}=fixture();
    for(const machine of LAUNCH_MACHINES){
        camera.position.set(machine.pad.x,machine.pad.y+3,machine.pad.z+8);camera.lookAt(machine.pad.x,machine.pad.y,machine.pad.z);foley.listener(camera);
        state.pressure!.cooldowns={[machine.id]:state.time+200+machine.cooldownMs};advance();
        for(let i=0;i<100;i++)advance(100);
    }
    expect(audio.play).not.toHaveBeenCalled();foley.dispose();
});
it('scopes deliberate input accents to the active scene and removes the listener on disposal',()=>{
    const {audio,foley,scene}=fixture();emitWorldSound(scene,'jump',point);expect(audio.play).toHaveBeenCalledOnce();
    foley.setEnabled(false);emitWorldSound(scene,'jump',point);foley.dispose();emitWorldSound(scene,'jump',point);expect(audio.play).toHaveBeenCalledOnce();
});
it.each([30,60,120])('keeps walking/turning silent and confirms only a heavy local landing at %i Hz',hz=>{
    const play=vi.fn(),motion=new MotionFoley(play),p={x:0,y:0,z:0},dt=1/hz;
    for(let i=0;i<hz;i++){p.x+=Math.sin(i*.1)*18*dt;motion.update(p,dt,true);}
    expect(play).not.toHaveBeenCalled();p.y=100;motion.update(p,dt,false);expect(play).not.toHaveBeenCalled();
    p.y-=24*dt;motion.update(p,dt,false);motion.update(p,dt,true);motion.update(p,dt,true);
    expect(play.mock.calls.map(c=>c[0])).toEqual(['land-heavy']);motion.clear();play.mockClear();motion.update(p,dt,true);expect(play).not.toHaveBeenCalled();
});
