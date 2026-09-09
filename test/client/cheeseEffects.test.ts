import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCheeseBallGeometry } from '../../src/weapons/CheeseProjectileModel';
import { CheeseImpactEffects } from '../../src/weapons/CheeseImpactEffects';

it('caps impact debris and splats, expires them, and disposes shared resources once', () => {
    const scene = new THREE.Scene();
    const effects = new CheeseImpactEffects(scene);
    const root = scene.getObjectByName('cheese-impact-effects')!;
    const [crumbs, splats] = root.children as THREE.InstancedMesh[];
    const resources = [crumbs.geometry, crumbs.material as THREE.Material, splats.geometry, splats.material as THREE.Material];
    const disposals = resources.map(resource => vi.spyOn(resource, 'dispose'));
    for (let i = 0; i < 100; i++) effects.emit(new THREE.Vector3(i,0,0), new THREE.Vector3(0,1,0), true);
    effects.update(0);
    expect(crumbs.count).toBe(160); expect(splats.count).toBe(40);
    effects.update(0.9); expect(crumbs.count).toBe(0); expect(splats.count).toBe(40);
    effects.update(2.2); expect(splats.count).toBe(0);
    effects.emit(new THREE.Vector3(),new THREE.Vector3(1,0,0),false);
    effects.update(0);
    expect(crumbs.count).toBe(7); expect(splats.count).toBe(0);
    effects.clear(); expect(crumbs.count).toBe(0);
    effects.dispose(); effects.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
});


it('keeps the projectile spherical and within the original ball radius', () => {
    const geometry = createCheeseBallGeometry();
    expect(geometry).toBeInstanceOf(THREE.SphereGeometry);
    const positions = geometry.getAttribute('position');
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        const radius = point.fromBufferAttribute(positions,i).length();
        expect(radius).toBeLessThanOrEqual(0.150001);
        expect(radius).toBeGreaterThan(0.14);
    }
    geometry.dispose();
});

it('flushes a burst once per frame instead of rebuilding instance buffers per impact',()=>{
    const scene=new THREE.Scene(),effects=new CheeseImpactEffects(scene);
    const [crumbs,splats]=scene.getObjectByName('cheese-impact-effects')!.children as THREE.InstancedMesh[];
    const crumbWrites=vi.spyOn(crumbs,'setMatrixAt'),splatWrites=vi.spyOn(splats,'setMatrixAt');
    const point=new THREE.Vector3(0,1,0),normal=new THREE.Vector3(0,1,0);
    for(let i=0;i<64;i++)effects.emit(point,normal,true);
    expect(crumbWrites).not.toHaveBeenCalled();expect(splatWrites).not.toHaveBeenCalled();
    effects.update(1/60);
    expect(crumbWrites).toHaveBeenCalledTimes(160);expect(splatWrites).toHaveBeenCalledTimes(40);
    effects.update(4);expect(crumbs.count+splats.count).toBe(0);
    crumbWrites.mockClear();splatWrites.mockClear();effects.update(1/60);
    expect(crumbWrites).not.toHaveBeenCalled();expect(splatWrites).not.toHaveBeenCalled();
    effects.dispose();
});
