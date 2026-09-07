import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../../src/entities/RatEntity';
import * as audio from '../../src/audio/EntityAudio';
import type { HatTypeName, PlayerData } from '../../src/shared/networkProtocol';

const hats: HatTypeName[] = ['fedora', 'trilby', 'porkpie'];
it.each(hats)('restores the %s outline and colors after complete death/respawn', hatType => {
    const scene = new THREE.Scene();
    const entity = new RatEntity(scene, new CANNON.World(), new THREE.Vector3(15, 2, 15), 'Rat', { hatType });
    const glow = scene.children.find(child => child !== entity.mesh && child instanceof THREE.Group)!;
    const opacity = () => {
        const values: number[] = [];
        glow.traverse(child => { if (child instanceof THREE.Mesh) values.push((child.material as THREE.Material).opacity); });
        return values;
    };
    const originalColors: number[] = [];
    entity.mesh.traverse(child => { if (child instanceof THREE.Mesh) originalColors.push((child.material as THREE.MeshStandardMaterial).color.getHex()); });
    for (let cycle = 0; cycle < 2; cycle++) {
        entity.takeDamage(3, new THREE.Vector3(0, 0, 50));
        for (let frame = 0; frame < 180; frame++) entity.update(1 / 60);
        expect(opacity().every(value => value === 0)).toBe(true);
        entity.respawn({ x: 15, y: 2, z: 15, hp: 3 });
        expect(opacity().every(value => value === .10)).toBe(true);
        expect(entity.billboard.sprite.position.toArray()).toEqual([15, 4.2, 15]);
        const colors: number[] = [];
        entity.mesh.traverse(child => { if (child instanceof THREE.Mesh) colors.push((child.material as THREE.MeshStandardMaterial).color.getHex()); });
        expect(colors).toEqual(originalColors);
    }
    entity.dispose();
});

it('applies historical dead state silently and preserves initial alive physics settings', () => {
    const play = vi.spyOn(audio, 'playEntitySound');
    const entity = new RatEntity(new THREE.Scene(), new CANNON.World(), new THREE.Vector3(15, 2, 15), 'Rat', { hatType: 'fedora' });
    const data: PlayerData = { id: 'one', name: 'Rat', hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3,
        x: 15, y: 2, z: 15, qx: 0, qy: 0, qz: 0, qw: 1,
        meshQx: 0, meshQy: 0, meshQz: 0, meshQw: 1, hp: 1, kills: 0, deaths: 0 };
    entity.applySnapshot(data);
    expect(entity.hp).toBe(1);
    expect(entity.body.linearDamping).toBe(.1);
    expect(entity.body.angularDamping).toBe(1);
    entity.applySnapshot({ ...data, hp: 0 });
    expect(entity.dead).toBe(true);
    expect(entity.body.position.toArray()).toEqual(entity.mesh.position.toArray());
    expect(entity.body.quaternion.toArray()).toEqual(entity.mesh.quaternion.toArray());
    expect(play).not.toHaveBeenCalled();
    entity.dispose();
    play.mockRestore();
});
