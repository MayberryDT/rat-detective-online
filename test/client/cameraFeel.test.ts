import {expect,it} from 'vitest';
import * as THREE from 'three';
import {CameraFeel} from '../../src/feel/CameraFeel';

// Failure modes for the view-only camera layer, written before the code:
// 1. Rendering leaves the camera offset, so the next shot aims somewhere else.
// 2. A quiet layer still touches the camera (drift, projection churn).
// 3. Settling depends on frame rate (30/60/120 Hz feel different).
// 4. An impulse never settles, or a long frame gap explodes the spring.
// 5. Rapid impulses pile up into an unbounded offset.
// 6. Camera shake 0 (or Reduced motion) still moves the view.
// 7. Reset leaves an offset behind after respawn or reconnect.

function camera(){
    const c=new THREE.PerspectiveCamera(60,16/9,.1,600);
    c.position.set(3,4,5);c.lookAt(0,2,0);c.updateMatrixWorld();c.updateProjectionMatrix();
    return c;
}
function pose(c:THREE.PerspectiveCamera){return [...c.position.toArray(),...c.quaternion.toArray(),c.fov,...c.projectionMatrix.elements,...c.matrixWorld.elements];}
function direction(c:THREE.PerspectiveCamera){return c.getWorldDirection(new THREE.Vector3());}
function run(feel:CameraFeel,hz:number,seconds:number){const dt=1/hz;for(let t=0;t<seconds-1e-9;t+=dt)feel.update(dt);}

it('restores the exact aimed pose after every rendered frame',()=>{
    const c=camera(),base=pose(c),feel=new CameraFeel(()=>1);
    feel.kick(.4,-.2);feel.push(new THREE.Vector3(.3,-.2,.1));feel.widen(8);feel.update(1/60);
    feel.apply(c);
    expect(direction(c).angleTo(direction(camera()))).toBeGreaterThan(1e-4);
    expect(c.fov).not.toBe(60);
    feel.restore(c);
    expect(pose(c)).toEqual(base);
});

it('does not touch the camera when nothing is active or shake is zero',()=>{
    const quiet=camera(),base=pose(quiet),feel=new CameraFeel(()=>1);
    feel.apply(quiet);expect(pose(quiet)).toEqual(base);feel.restore(quiet);expect(pose(quiet)).toEqual(base);
    const c=camera(),muted=new CameraFeel(()=>0);
    muted.kick(.5,.5);muted.push(new THREE.Vector3(1,1,1));muted.widen(10);muted.update(1/60);
    muted.apply(c);expect(pose(c)).toEqual(base);muted.restore(c);
});

it('settles the same way at 30, 60 and 120 Hz',()=>{
    const sample=(hz:number)=>{const feel=new CameraFeel(()=>1);feel.kick(.4,.1);run(feel,hz,.1);return feel.offsets();};
    const a=sample(30),b=sample(60),c=sample(120);
    for(const key of ['pitch','yaw'] as const){
        expect(Math.abs(a[key]-c[key])).toBeLessThan(Math.abs(c[key])*.12+1e-4);
        expect(Math.abs(b[key]-c[key])).toBeLessThan(Math.abs(c[key])*.06+1e-4);
    }
});

it('returns to rest and survives a long frame gap',()=>{
    const feel=new CameraFeel(()=>1);
    feel.kick(.5,.5);feel.push(new THREE.Vector3(1,1,1));feel.widen(10);
    run(feel,60,1.5);
    expect(feel.active).toBe(false);
    feel.kick(.5,.5);feel.update(5);
    const o=feel.offsets();
    for(const value of Object.values(o))expect(Number.isFinite(value)).toBe(true);
    expect(feel.active).toBe(false);
});

it('caps rapid repeated impulses',()=>{
    const feel=new CameraFeel(()=>1);let peak=0;
    for(let i=0;i<120;i++){feel.kick(.5,.5);feel.push(new THREE.Vector3(2,2,2));feel.update(1/120);
        const o=feel.offsets();peak=Math.max(peak,Math.abs(o.pitch),Math.abs(o.yaw),Math.hypot(o.x,o.y,o.z));}
    expect(peak).toBeLessThanOrEqual(.35+1e-9);
});

it('reset clears every offset immediately',()=>{
    const c=camera(),base=pose(c),feel=new CameraFeel(()=>1);
    feel.kick(.4,.2);feel.push(new THREE.Vector3(.2,.2,.2));feel.widen(6);feel.update(1/60);
    feel.reset();expect(feel.active).toBe(false);
    feel.apply(c);expect(pose(c)).toEqual(base);feel.restore(c);
});
