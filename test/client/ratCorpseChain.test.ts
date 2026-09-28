import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import * as C from 'cannon-es';
import {createRatMesh} from '../../src/utils/RatModel';
import {RatAnimator} from '../../src/utils/RatAnimator';
import {batchRigidMeshes} from '../../src/utils/RigidMeshBatch';
import {setRagdollWorld} from '../../src/utils/RatCorpseChain';
import {disposeMeshResources} from '../../src/utils/disposeMeshResources';

afterEach(()=>{setRagdollWorld(undefined);vi.restoreAllMocks();});

it('lays a thrown corpse against a wall and on the ground without sinking through either, and stays whole when shot',()=>{
    // The shared ray budget refills in real time; give each frame a real 60 Hz slice.
    let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const world=new C.World({gravity:new C.Vec3(0,-25,0)});
    const ground=new C.Body({mass:0,type:C.Body.STATIC});ground.addShape(new C.Plane());
    ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
    const wall=new C.Body({mass:0,type:C.Body.STATIC,position:new C.Vec3(5,3,0)});wall.addShape(new C.Box(new C.Vec3(.2,3,5)));world.addBody(wall);
    setRagdollWorld(world);
    // A corpse box as the authority throws it (ChaosSimulation.death), drawn as ChaosView draws it.
    const box=new C.Body({mass:2,shape:new C.Box(new C.Vec3(.48,.92,.38)),position:new C.Vec3(0,.95,0),
        collisionFilterGroup:8,collisionFilterMask:1,linearDamping:.015,angularDamping:.04});
    box.velocity.set(9,14,0);box.angularVelocity.set(0,5,-15);world.addBody(box);
    const root=createRatMesh(),animator=new RatAnimator(root),batch=batchRigidMeshes(root)!;
    // As on a fresh corpse, the fedora (and the ears on it) has popped off as its own object.
    animator.setHatHidden(true);
    const offset=new THREE.Vector3(),vertex=new THREE.Vector3();
    let speed=0,lowest=Infinity,lowestAtRest=Infinity,furthest=-Infinity,reach=0;
    try{
        for(let frame=0;frame<360;frame++){
            now+=1000/60;world.step(1/60);reach=Math.max(reach,box.position.x);
            root.quaternion.set(box.quaternion.x,box.quaternion.y,box.quaternion.z,box.quaternion.w);
            root.position.set(box.position.x,box.position.y,box.position.z).sub(offset.set(0,.95,0).applyQuaternion(root.quaternion));
            const s=box.velocity.length(),impact=Math.max(0,Math.min(1,(speed-s-4)/20));speed=s;
            animator.poseDeath(frame/60,1/60,box.angularVelocity,impact,s<.6);
            if(frame===240)animator.joltDeath(1,{x:box.position.x,y:box.position.y+.3,z:box.position.z},{x:-1,y:.2,z:0});
            if(frame%6)continue;
            root.updateMatrixWorld(true);batch.skeleton.update();
            for(let i=0;i<batch.geometry.getAttribute('position').count;i+=5){
                batch.getVertexPosition(i,vertex).applyMatrix4(batch.matrixWorld);
                expect(Number.isFinite(vertex.x+vertex.y+vertex.z)).toBe(true);
                lowest=Math.min(lowest,vertex.y);furthest=Math.max(furthest,vertex.x);
                if(frame>180)lowestAtRest=Math.min(lowestAtRest,vertex.y);
            }
        }
        // It reached the wall and the ground: the coat may press into them on impact, never pass through.
        expect(reach).toBeGreaterThan(4);
        expect(lowest).toBeGreaterThan(-.25);
        expect(lowestAtRest).toBeGreaterThan(-.15);
        expect(furthest).toBeLessThan(4.8+.15);
    }finally{disposeMeshResources(root);}
});
