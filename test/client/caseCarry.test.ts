import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ChaosView } from '../../src/prototype/ChaosView';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { CASE_HOME, CASE_SIZE } from '../../src/shared/chaosState';
import type { PlayerData } from '../../src/shared/networkProtocol';
import type { RatEntity } from '../../src/entities/RatEntity';
import { createRatMesh } from '../../src/utils/RatModel';
import { RatAnimator } from '../../src/utils/RatAnimator';
import { createAssignment, destinationPoint, activeDestination } from '../../src/shared/assignments';
import { ChaosEncoder, ChaosDecoder } from '../../src/shared/chaosWire';

vi.mock('../../src/prototype/DispatchHud',()=>({DispatchHud:class{update(){} setScores(){} dispose(){}}}));

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
            const element={style:{},dataset:{},width:0,height:0,label:'',remove(){},appendChild(){},
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
    it('shows both non-winning relocations immediately through compact snapshots with the accepted delivery animation, and wins only at three',()=>{
        const carrier=player('carrier'),simulation=new ChaosSimulation(new Map([[carrier.id,carrier]]),()=>{});
        let now=Date.now();const assignment=createAssignment('chain-of-custody',now-3000);assignment.phase='active';simulation.setAssignment(assignment);
        const mesh=createRatMesh(),animator=new RatAnimator(mesh),playReaction=vi.fn(animator.playReaction.bind(animator));
        const entity={mesh,hp:3,isPlayer:true,dead:false,name:'You',playReaction} as unknown as RatEntity;
        const scene=new THREE.Scene(),view=new ChaosView(scene,()=>entity),camera=new THREE.PerspectiveCamera();
        const encoder=new ChaosEncoder('deliveries',true),decoder=new ChaosDecoder();
        const deliverSnapshot=()=>{
            const snapshot=simulation.snapshot(false),message=decoder.read(encoder.encode(snapshot).payload)?.message;
            expect(message?.type).toBe('chaos');if(message?.type!=='chaos')throw new Error('Undecodable case state');
            view.apply(message.state);animator.update(1/60);view.update(1/60,camera);
            return snapshot;
        };
        try{
            view.setScores([],carrier.id);deliverSnapshot();
            for(let points=1;points<=3;points++){
                const p=simulation.caseBody.position;Object.assign(carrier,{x:p.x,y:p.y-.8,z:p.z});
                mesh.position.set(carrier.x,carrier.y,carrier.z);simulation.step(0,++now);deliverSnapshot();
                expect(simulation.caseHolderId).toBe(carrier.id);expect(mesh.getObjectByName('hot-case-off-hand')).toBeDefined();
                Object.assign(carrier,destinationPoint(activeDestination(simulation.assignmentState!)!,false));
                mesh.position.set(carrier.x,carrier.y,carrier.z);simulation.step(0,++now);
                const snapshot=deliverSnapshot();
                expect(snapshot.assignment!.deliveries).toEqual({carrier:points});
                if(points<3){
                    expect(snapshot.assignment!.result).toBeUndefined();expect(snapshot.case.owner).toBeNull();
                    expect(mesh.getObjectByName('hot-case-off-hand')).toBeUndefined();
                    expect(scene.getObjectByName('hot-case')!.position.distanceTo(new THREE.Vector3(snapshot.case.p.x,snapshot.case.p.y,snapshot.case.p.z))).toBeLessThan(.002);
                }else expect(snapshot.assignment!.result?.winnerId).toBe(carrier.id);
                simulation.step(0,++now);deliverSnapshot();expect(simulation.assignmentState!.deliveries.carrier).toBe(points);
            }
            expect(playReaction.mock.calls.filter(([event])=>event==='delivery')).toHaveLength(3);
        }finally{view.dispose();}
    });
    it.each(['delivery','round','epoch','reset'] as const)('clears an outstanding carried-case prediction on %s and ignores its late acknowledgement',transition=>{
        const state=new ChaosSimulation(new Map(),()=>{}).snapshot(false);
        state.epoch='before';state.tick=10;
        state.assignment=createAssignment('chain-of-custody',state.time-5000,'round-before');
        state.assignment.phase='active';
        const mesh=createRatMesh(),entity={mesh,isPlayer:true,dead:false,name:'You'} as RatEntity;
        const scene=new THREE.Scene(),view=new ChaosView(scene,()=>entity,undefined,false),camera=new THREE.PerspectiveCamera();
        try{
            view.setScores([],'local');view.apply(state);
            view.anticipateInteraction('old',{target:'case',targetId:'primary',generation:0});
            if(transition==='epoch'||transition==='reset')view.resolveInteraction({type:'pickupResult',interactionId:'old',
                target:'case',targetId:'primary',accepted:true,at:state.time,tick:12,epoch:'before',playerId:'local'});
            view.update(1/60,camera);expect(mesh.getObjectByName('hot-case-off-hand')).toBeDefined();
            const next=structuredClone(state);next.time++;next.tick=11;next.case.p={x:50,y:1,z:50};
            if(transition==='epoch')next.epoch='after';
            else if(transition==='reset')view.resetProjectiles();
            else {
                if(transition==='round')next.assignment!.roundId='round-after';
                else {next.assignment!.deliverySerial=1;next.assignment!.deliveries.local=1;next.assignment!.lastDelivery={playerId:'local',playerName:'You',at:next.time};}
            }
            view.apply(next);view.update(1/60,camera);
            expect(mesh.getObjectByName('hot-case-off-hand')).toBeUndefined();
            expect(scene.getObjectByName('hot-case')!.position.toArray()).toEqual([50,1,50]);
            // A result that belonged to the discarded prediction must not attach
            // a phantom case for the rest of this round.
            view.resolveInteraction({type:'pickupResult',interactionId:'old',target:'case',targetId:'primary',accepted:true,
                at:state.time,tick:12,epoch:'before',playerId:'local'});
            view.update(1/60,camera);
            expect(mesh.getObjectByName('hot-case-off-hand')).toBeUndefined();
        }finally{view.dispose();}
    });
    it('keeps the accepted sleeve attached during anticipated pickup and removes it on rejection or timeout',()=>{
        const state=new ChaosSimulation(new Map(),()=>{}).snapshot(false);
        const carrier=player('local'),mesh=createRatMesh();mesh.position.set(carrier.x,0,carrier.z);
        const entity={mesh,isPlayer:true,dead:false,name:'You'} as RatEntity;
        const scene=new THREE.Scene(),view=new ChaosView(scene,id=>id===carrier.id?entity:undefined,undefined,false);
        const camera=new THREE.PerspectiveCamera();
        try{
            view.setScores([],carrier.id);view.apply(state);view.update(1/60,camera);
            expect(mesh.getObjectByName('hot-case-off-hand')).toBeUndefined();
            for(const outcome of ['rejected','timeout'] as const){
                view.anticipateInteraction(outcome,{target:'case',targetId:'primary',generation:state.case.pickupAfter});
                view.update(1/60,camera);
                expect(mesh.getObjectByName('rat-case-cuff')).toBeDefined();
                const handle=scene.getObjectByName('case-handle-grip')!.getWorldPosition(new THREE.Vector3());
                const grip=mesh.getObjectByName('case-sleeve-grip')!.getWorldPosition(new THREE.Vector3());
                expect(handle.distanceTo(grip)).toBeLessThan(1e-6);
                expect(state.case.owner).toBeNull();
                if(outcome==='timeout')view.cancelInteraction(outcome);
                else view.resolveInteraction({type:'pickupResult',interactionId:outcome,target:'case',targetId:'primary',
                    accepted:false,at:state.time,tick:state.tick??0,epoch:state.epoch??'test',playerId:carrier.id});
                view.update(1/60,camera);
                expect(mesh.getObjectByName('hot-case-off-hand')).toBeUndefined();
            }
        }finally{view.dispose();}
    });
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
