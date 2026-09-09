import {describe,it,expect} from 'vitest';
import * as C from 'cannon-es';
import {grayboxBoxes,isRampOpening} from '../../src/shared/grayboxLayout';
import {SEWER_MANHOLE,SEWER_PIPE_ENTRANCES,sewerPipePoint,sewerBoxes,sewerPipeBoxes,type SewerPipeEntrance} from '../../src/shared/sewerLayout';

function physicalMap(entry?:SewerPipeEntrance){
    const world=new C.World({gravity:new C.Vec3(0,-30,0)});
    world.broadphase=new C.SAPBroadphase(world);world.defaultContactMaterial.friction=0;world.defaultContactMaterial.restitution=.05;
    const mouth=entry?sewerPipePoint(entry,-10):null,end=entry?sewerPipePoint(entry,40):null;
    for(const b of grayboxBoxes()){
        // Keep all actual map colliders overlapping this traversal corridor; distant city blocks
        // cannot affect a fixed-rotation walker and only make the CPU physics fixture slower.
        if(mouth&&end){
            const reach=Math.max(b.w,b.h,b.d)/2;
            if(b.x+reach<Math.min(mouth.x,end.x)-8||b.x-reach>Math.max(mouth.x,end.x)+8
                ||b.z+reach<Math.min(mouth.z,end.z)-8||b.z-reach>Math.max(mouth.z,end.z)+8)continue;
        }
        const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(b.w/2,b.h/2,b.d/2))});
        body.position.set(b.x,b.y,b.z);body.quaternion.setFromEuler(b.rx,0,b.rz);body.updateAABB();world.addBody(body);
    }
    const rat=new C.Body({mass:1,fixedRotation:true,linearDamping:0});
    rat.addShape(new C.Sphere(.6),new C.Vec3(0,.6,0));
    rat.addShape(new C.Sphere(.45),new C.Vec3(0,1.3,0));
    rat.addShape(new C.Sphere(.28),new C.Vec3(0,1.9,0));world.addBody(rat);
    return {world,rat};
}

describe('physical sewer portals',()=>{
    it('keeps the four pipe shells within the shared static-body budget',()=>{
        expect(sewerPipeBoxes().length).toBeLessThanOrEqual(300);
    });
    it('falls through both street and sewer ceiling, then walks out of the shaft',()=>{
        const {world,rat}=physicalMap(),m=SEWER_MANHOLE;
        rat.position.set(m.x,2,m.z);rat.aabbNeedsUpdate=true;
        for(let i=0;i<180;i++)world.step(1/60);
        expect(rat.position.y).toBeCloseTo(-7,1);
        for(let i=0;i<180;i++){rat.velocity.x=6;world.step(1/60);}
        expect(rat.position.x).toBeGreaterThan(m.x+15);
        expect(rat.position.y).toBeCloseTo(-7,1);
        // The surface hole lies exactly on the two-unit tile boundaries.
        expect(isRampOpening(m.x-1,m.z-1)).toBe(true);
        expect(isRampOpening(m.x+1,m.z+1)).toBe(true);
        expect(isRampOpening(m.x+3,m.z)).toBe(false);
    });
    it.each(SEWER_PIPE_ENTRANCES)('walks into and out of the $name pipe using the actual rat collider',entry=>{
        const {world,rat}=physicalMap(entry);
        const start=sewerPipePoint(entry,-3);
        rat.position.set(start.x,.1,start.z);rat.aabbNeedsUpdate=true;
        const axis=entry.axis;
        for(let i=0;i<420;i++){rat.velocity[axis]=-entry.direction*6;world.step(1/60);}
        const mouth=sewerPipePoint(entry,0);
        expect((mouth[axis]-rat.position[axis])*entry.direction).toBeGreaterThan(32);
        expect(rat.position.y).toBeCloseTo(-7,1);
        // The same continuous incline remains usable back to street; no sealed rear parapet.
        for(let i=0;i<470;i++){rat.velocity[axis]=entry.direction*6;world.step(1/60);}
        expect((mouth[axis]-rat.position[axis])*entry.direction).toBeLessThan(-2);
        expect(rat.position.y).toBeCloseTo(0,1);
    });
    it('keeps the manhole landing floor intact and the shaft exit below its cladding open',()=>{
        const m=SEWER_MANHOLE;
        const pieces=sewerBoxes().filter(b=>!b.rx&&!b.rz&&Math.abs(b.x-m.x)<b.w/2&&Math.abs(b.z-m.z)<b.d/2);
        expect(pieces.some(b=>b.y+b.h/2===-7)).toBe(true);
        expect(pieces.some(b=>b.y-b.h/2<=-.5&&b.y+b.h/2>=-.5)).toBe(false);
    });
});
