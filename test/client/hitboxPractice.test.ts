import {describe,expect,it} from 'vitest';
import * as C from 'cannon-es';
import {HitboxPractice,PRACTICE_START,PRACTICE_TARGETS} from '../visual/HitboxPractice';

function fireAt(practice:HitboxPractice,height:number,zOffset=0){
    const target=PRACTICE_TARGETS[0];
    practice.shoot({shotId:`shot-${practice.shots}`,origin:{x:target.x-2,y:target.y+height,z:target.z+zOffset},direction:{x:1,y:0,z:0}});
    practice.step(1/60,Date.now());
}

describe('stationary hitbox practice',()=>{
    it('uses the actual head/body damage and refills killed targets in place',()=>{
        const practice=new HitboxPractice();
        const target=practice.players.get(PRACTICE_TARGETS[0].id)!;
        const pose={x:target.x,y:target.y,z:target.z,meshQy:target.meshQy,meshQw:target.meshQw};
        fireAt(practice,.6);
        expect(practice.lastHit).toMatchObject({region:'BODY',damage:1,remaining:2,killed:false});
        expect(target.hp).toBe(2);
        fireAt(practice,.6);fireAt(practice,.6);
        expect(practice.kills).toBe(1);expect(target.hp).toBe(3);
        fireAt(practice,1.9);
        expect(practice.lastHit).toMatchObject({region:'HEAD',damage:3,remaining:0,killed:true});
        expect(practice.hits).toBe(4);expect(practice.headshots).toBe(1);expect(practice.kills).toBe(2);
        expect(target).toMatchObject({...pose,hp:3});
        expect(practice.simulation.snapshot(false).corpses).toHaveLength(0);
    });

    it('keeps the real head boundary, including misses just outside it',()=>{
        const practice=new HitboxPractice();
        fireAt(practice,1.9,.27);
        expect(practice.lastHit?.region).toBe('HEAD');
        fireAt(practice,1.9,.29);
        expect(practice.hits).toBe(1);expect(practice.shots).toBe(2);
    });

    it('never moves or fires dummies, and keeps objectives inactive',()=>{
        const practice=new HitboxPractice();
        const before=PRACTICE_TARGETS.map(target=>({...practice.players.get(target.id)!}));
        // Include a long idle jump: the normal incident timer must stay disabled.
        practice.step(1/60,Date.now()+24*60*60*1000);
        for(let i=0;i<120;i++)practice.step(1/60,Date.now()+i*17);
        expect(PRACTICE_TARGETS.map(target=>practice.players.get(target.id))).toEqual(before);
        const state=practice.simulation.snapshot(false);
        expect(state.shots).toHaveLength(0);expect(state.dispatch.phase).toBe('cooldown');
        expect(state.case.owner).toBeNull();expect(state.pressure?.launches).toHaveLength(0);
        expect([...practice.simulation.targets.values()].some(target=>target.kind==='pressure'||target.kind==='dispatch')).toBe(false);
    });

    it('places targets on supported ground with clear head-level sightlines',()=>{
        const practice=new HitboxPractice();
        for(const target of PRACTICE_TARGETS){
            const floor=new C.RaycastResult();
            practice.simulation.world.raycastClosest(new C.Vec3(target.x,target.y+.05,target.z),new C.Vec3(target.x,target.y-.1,target.z),{collisionFilterMask:1},floor);
            expect(floor.hasHit,`${target.name} floor`).toBe(true);
            const sightline=new C.RaycastResult();
            practice.simulation.world.raycastClosest(new C.Vec3(PRACTICE_START.x,1.9,PRACTICE_START.z),new C.Vec3(target.x,target.y+1.9,target.z),{collisionFilterMask:1},sightline);
            expect(sightline.hasHit,`${target.name} clear sightline`).toBe(false);
            const body=[...practice.simulation.targets].find(([,info])=>info.player?.id===target.id)![0];
            expect(body.type).toBe(C.Body.KINEMATIC);
        }
    });

    it('clears projectiles and counters without moving targets or allowing self damage',()=>{
        const practice=new HitboxPractice();
        fireAt(practice,1.9);fireAt(practice,1.9,.29);
        practice.reset();
        expect([practice.shots,practice.hits,practice.headshots,practice.kills]).toEqual([0,0,0,0]);
        expect(practice.lastHit).toBeUndefined();expect(practice.simulation.snapshot(false).shots).toHaveLength(0);
        for(const target of PRACTICE_TARGETS)expect(practice.players.get(target.id)).toMatchObject({x:target.x,y:target.y,z:target.z,hp:3});
        practice.shoot({shotId:'self',origin:{x:PRACTICE_START.x-2,y:.6,z:PRACTICE_START.z},direction:{x:1,y:0,z:0}});
        practice.step(1/60,Date.now());
        expect(practice.players.get('local')?.hp).toBe(3);expect(practice.hits).toBe(0);
    });
});
