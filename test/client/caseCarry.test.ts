import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ChaosView } from '../../src/prototype/ChaosView';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { CASE_HOME, CASE_SIZE } from '../../src/shared/chaosState';
import type { PlayerData } from '../../src/shared/networkProtocol';
import type { RatEntity } from '../../src/entities/RatEntity';
import { createRatMesh } from '../../src/utils/RatModel';
import { RatAnimator } from '../../src/utils/RatAnimator';

vi.mock('../../src/prototype/DispatchHud',()=>({DispatchHud:class{update(){} dispose(){}}}));

// This is a held-case transform/deflection check, not a city geometry test.
vi.mock('../../src/shared/grayboxLayout', () => ({
    CITY_BOUNDS:{min:-196,max:166},grayboxBoxes:()=>[],
}));
const elements:Array<{style:Record<string,string>;label?:string}>=[];
const originalDocument=globalThis.document,originalWindow=globalThis.window;
beforeAll(()=>{
    vi.stubGlobal('window',{innerWidth:1280,innerHeight:720});
    vi.stubGlobal('document',{
        createElement:()=>{
            const element={style:{},width:0,height:0,label:'',remove(){},appendChild(){},
                setAttribute(_name:string,value:string){this.label=value;},
                getContext:()=>({fillRect(){},fillText(){}})};
            elements.push(element);return element;
        },body:{appendChild(){}},
    });
});
afterAll(()=>{vi.stubGlobal('document',originalDocument);vi.stubGlobal('window',originalWindow);});

function player(id:string,yaw=0):PlayerData{
    return {id,name:id,x:CASE_HOME.x,y:0,z:CASE_HOME.z,qx:0,qy:0,qz:0,qw:1,
        meshQx:0,meshQy:Math.sin(yaw/2),meshQz:0,meshQw:Math.cos(yaw/2),
        hatType:'fedora',hatColor:0x343434,coatColor:0x555555,furColor:0xbe9767,hp:3,kills:0,deaths:0};
}
describe('natural briefcase carry',()=>{
    it('renders three temporary cases, anchors an extra to its carrier, and removes all extra visuals on expiry',()=>{
        const simulation=new ChaosSimulation(new Map(),()=>{}),state=simulation.snapshot(false);
        const carrier=player('extra-carrier'),mesh=createRatMesh();mesh.position.set(carrier.x,0,carrier.z);
        const entity={mesh,isPlayer:true,dead:false,name:'You'} as RatEntity;
        state.extraCases=[1,2,3].map(i=>({...state.case,id:`evidence-${i}`,p:{x:40+i*10,y:1,z:0},owner:i===1?carrier.id:null}));
        const scene=new THREE.Scene(),view=new ChaosView(scene,id=>id===carrier.id?entity:undefined,undefined,false);
        view.apply(state);view.update(1/60,new THREE.PerspectiveCamera());
        expect(scene.getObjectByName('hot-case-evidence-1')?.scale.x).toBe(1);
        expect(scene.getObjectByName('hot-case-evidence-2')?.scale.x).toBe(2);
        expect(mesh.getObjectByName('hot-case-off-hand')).toBeDefined();
        const initialChildren=scene.children.length;
        state.extraCases=[];view.apply(state);view.update(1/60,new THREE.PerspectiveCamera());
        for(let i=1;i<=3;i++)expect(scene.getObjectByName(`hot-case-evidence-${i}`)).toBeUndefined();
        expect(mesh.getObjectByName('hot-case-off-hand')).toBeUndefined();
        expect(scene.getObjectByName('hot-case')).toBeDefined();
        expect(scene.children.length).toBe(initialChildren-6);view.dispose();
    });
    it('keeps the visible case and authoritative deflection body aligned through turns',()=>{
        for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.6]){
            const carrier=player('carrier',yaw),players=new Map([[carrier.id,carrier]]);
            const simulation=new ChaosSimulation(players,()=>{});
            simulation.step(1/60,1000);
            expect(simulation.snapshot().case.owner).toBe(carrier.id);
            const mesh=createRatMesh();mesh.position.set(carrier.x,carrier.y,carrier.z);
            mesh.quaternion.set(carrier.meshQx,carrier.meshQy,carrier.meshQz,carrier.meshQw);
            const entity={mesh,isPlayer:true,dead:false,name:'You'} as RatEntity;
            const scene=new THREE.Scene(),view=new ChaosView(scene,()=>entity,undefined,false);
            view.apply(simulation.snapshot());view.update(1/60,new THREE.PerspectiveCamera());
            const visual=scene.getObjectByName('hot-case')!;
            expect(visual.position.distanceTo(new THREE.Vector3(...simulation.caseBody.position.toArray()))).toBeLessThan(1e-6);
            const physical=simulation.caseBody.quaternion;
            expect(visual.quaternion.angleTo(new THREE.Quaternion(physical.x,physical.y,physical.z,physical.w))).toBeLessThan(1e-6);
            // Broad face follows the side, and the sleeve grip meets the physical handle.
            const broadAxis=new THREE.Vector3(1,0,0).applyQuaternion(visual.quaternion);
            const forward=new THREE.Vector3(0,0,1).applyQuaternion(mesh.quaternion);
            expect(Math.abs(broadAxis.dot(forward))).toBeCloseTo(1);
            const handle=visual.getObjectByName('case-handle-grip')!.getWorldPosition(new THREE.Vector3());
            const hand=mesh.getObjectByName('case-sleeve-grip')!.getWorldPosition(new THREE.Vector3());
            expect(handle.distanceTo(hand)).toBeLessThan(1e-6);
            expect(visual.position.y-CASE_SIZE.y/2).toBeGreaterThan(.15);
            view.dispose();
        }
    });

    it('swings with the walking rat while keeping a rigid handle grip and resets on stop',()=>{
        const carrier=player('carrier');
        const simulation=new ChaosSimulation(new Map([[carrier.id,carrier]]),()=>{});
        simulation.step(1/60,1000);
        const mesh=createRatMesh(),outline=createRatMesh();
        mesh.position.set(carrier.x,0,carrier.z);
        const animator=new RatAnimator(mesh,outline);
        const entity={mesh,isPlayer:true,dead:false,name:'You'} as RatEntity;
        const scene=new THREE.Scene(),view=new ChaosView(scene,()=>entity,undefined,false);
        const camera=new THREE.PerspectiveCamera();
        view.apply(simulation.snapshot());
        animator.update(1/60);view.update(1/60,camera);
        const visual=scene.getObjectByName('hot-case')!;
        let min=Infinity,max=-Infinity;
        for(let frame=0;frame<80;frame++){
            mesh.position.z+=.1;
            animator.update(1/60);view.update(1/60,camera);
            const handle=visual.getObjectByName('case-handle-grip')!.getWorldPosition(new THREE.Vector3());
            const hand=mesh.getObjectByName('case-sleeve-grip')!.getWorldPosition(new THREE.Vector3());
            expect(handle.distanceTo(hand)).toBeLessThan(1e-6);
            const offset=visual.position.z-mesh.position.z;
            min=Math.min(min,offset);max=Math.max(max,offset);
        }
        expect(max-min).toBeGreaterThan(.2);
        for(let frame=0;frame<150;frame++){animator.update(1/60);view.update(1/60,camera);}
        expect(Math.abs(mesh.getObjectByName('rat-carry-anchor')!.rotation.x)).toBeLessThan(.0001);
        animator.reset();view.update(1/60,camera);
        expect(mesh.getObjectByName('rat-carry-anchor')!.rotation.x).toBe(0);
        entity.dead=true;view.update(1/60,camera);
        expect(mesh.getObjectByName('hot-case-off-hand')).toBeUndefined();
        view.dispose();
    });

    it('hides only the local carrier badge and restores it after a disarm',()=>{
        const carrier=player('carrier'),attacker=player('attacker');attacker.x-=8;
        const simulation=new ChaosSimulation(new Map([[carrier.id,carrier],[attacker.id,attacker]]),()=>{});
        simulation.step(1/60,1000);
        const mesh=createRatMesh();mesh.position.set(carrier.x,0,carrier.z);
        const entity={mesh,isPlayer:true,dead:false,name:'You'} as RatEntity;
        const view=new ChaosView(new THREE.Scene(),()=>entity,undefined,false),camera=new THREE.PerspectiveCamera();
        view.apply(simulation.snapshot());view.update(1/60,camera);
        const badge=elements.filter(element=>element.label==='Hot Case location').at(-1)!;
        expect(badge.style.display).toBe('none');
        entity.isPlayer=false;view.update(1/60,camera);
        expect(badge.style.display).toBe('block');
        entity.isPlayer=true;
        const p=simulation.caseBody.position;
        simulation.shoot(attacker.id,{shotId:'disarm',origin:{x:p.x+2,y:p.y,z:p.z},direction:{x:-1,y:0,z:0}});
        simulation.step(1/60,1017);
        expect(simulation.snapshot().case.owner).toBeNull();
        expect(simulation.snapshot().shots[0].v.x).toBeGreaterThan(0);
        view.apply(simulation.snapshot());view.update(1/60,camera);
        expect(badge.style.display).toBe('block');
        view.dispose();
    });
});
