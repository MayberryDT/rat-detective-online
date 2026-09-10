import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../../src/entities/RatEntity';
import { CheeseGun } from '../../src/weapons/CheeseGun';

it('animates motion and recoil with a matching outline without moving physics, and resets on respawn', () => {
    const scene = new THREE.Scene();
    const rat = new RatEntity(scene, new CANNON.World(), new THREE.Vector3(), 'Rat', {});
    const shell = scene.children.find(child => child instanceof THREE.Group && child !== rat.mesh)!;
    const body = rat.mesh.getObjectByName('rat-body')!;
    rat.update(1 / 60);
    for (let frame = 0; frame < 30; frame++) {
        rat.body.position.x += 0.1;
        rat.update(1 / 60);
    }
    expect(body.position.y).toBeGreaterThan(0);
    const position = rat.body.position.clone();
    const shapes = rat.body.shapes.slice();
    rat.playShootAnimation();
    rat.update(1 / 60);
    expect(body.position.z).toBeLessThan(-0.01);
    expect(rat.body.position).toEqual(position);
    expect(rat.body.shapes).toEqual(shapes);
    expect(rat.mesh.position.toArray()).toEqual(position.toArray());
    for (const name of ['rat-body', 'rat-head', 'rat-hat', 'rat-tail', 'rat-eye-left', 'rat-ear-right', 'rat-arm', 'rat-pistol']) {
        const part = rat.mesh.getObjectByName(name)!;
        const glow = shell.getObjectByName(name)!;
        expect(glow.position.toArray()).toEqual(part.position.toArray());
        expect(glow.quaternion.toArray()).toEqual(part.quaternion.toArray());
        expect(glow.scale.toArray()).toEqual(part.scale.toArray());
    }
    for (let frame = 0; frame < 120; frame++) rat.update(1 / 60);
    expect(Math.abs(body.position.z)).toBeLessThan(0.0001);
    rat.respawn({ x: 100, y: 0, z: 0, hp: 3 });
    expect(body.position.toArray()).toEqual([0, 0, 0]);
    rat.update(1 / 60);
    expect(body.position.y).toBe(0);
    rat.dispose();
});

it('blinks during idle and triggers recoil for both local and replayed shots', () => {
    const scene = new THREE.Scene();
    const world = new CANNON.World();
    const rat = new RatEntity(scene, world, new THREE.Vector3(), 'Rat', {});
    const rootPosition = rat.mesh.position.clone();
    let minimumEyeScale = 1;
    for (let frame = 0; frame < 300; frame++) {
        rat.update(1 / 60);
        minimumEyeScale = Math.min(minimumEyeScale, rat.mesh.getObjectByName('rat-eye-left')!.scale.y);
    }
    expect(minimumEyeScale).toBeLessThan(0.15);
    expect(rat.mesh.position).toEqual(rootPosition);
    const recoil = vi.spyOn(rat, 'playShootAnimation');
    const gun = new CheeseGun(scene, world, {} as THREE.AudioListener);
    const shot = gun.shoot(rat, new THREE.Vector3(0, 1.45, 20))!;
    gun.replayShot(rat, shot);
    expect(recoil).toHaveBeenCalledTimes(2);
    gun.dispose(); rat.dispose();
});


it('keeps the aimed pistol and outline together while moving, and lowers the paw after firing', () => {
    const scene = new THREE.Scene();
    const rat = new RatEntity(scene, new CANNON.World(), new THREE.Vector3(8, 0, 3), 'Rat', {});
    const shell = scene.children.find(child => child instanceof THREE.Group && child !== rat.mesh)!;
    const arm = rat.mesh.getObjectByName('rat-arm')!;
    const carryY = arm.position.y;
    rat.mesh.rotation.y = 0.7;
    rat.playShootAnimation(new THREE.Vector3(10, 4, 30));
    expect(arm.position.y).toBeGreaterThan(carryY + 0.3);
    for (let frame = 0; frame < 30; frame++) {
        rat.body.position.x += 0.08;
        rat.update(1 / 60);
        const outlineMuzzle = shell.getObjectByName('rat-muzzle')!.getWorldPosition(new THREE.Vector3());
        expect(outlineMuzzle.distanceTo(rat.getMuzzlePosition())).toBeLessThan(1e-10);
    }
    for (let frame = 0; frame < 180; frame++) rat.update(1 / 60);
    expect(arm.position.y).toBeCloseTo(carryY, 5);
    rat.respawn({ x: 8, y: 0, z: 3, hp: 3 });
    expect(arm.position.y).toBe(carryY);
    expect(arm.rotation.x).toBeCloseTo(1.28);
    rat.dispose();
});


it('flexes the tail without detaching its root or tip, matches the outline and resets geometry', () => {
    const scene = new THREE.Scene();
    const rat = new RatEntity(scene, new CANNON.World(), new THREE.Vector3(), 'Rat', {});
    const shell = scene.children.find(child => child instanceof THREE.Group && child !== rat.mesh)!;
    const tail = rat.mesh.getObjectByName('rat-tail') as THREE.Mesh;
    const glow = shell.getObjectByName('rat-tail') as THREE.Mesh;
    const positions = tail.geometry.getAttribute('position');
    const outlinePositions = glow.geometry.getAttribute('position');
    const rest = Array.from(positions.array);
    const outlineRest = Array.from(outlinePositions.array);
    const tipRest = tail.children[0].position.clone();
    const geometry = tail.geometry;
    rat.update(1 / 60);
    for (let frame = 0; frame < 60; frame++) {
        rat.body.position.z += 0.1;
        rat.update(1 / 60);
        const groundBounds = new THREE.Box3().setFromObject(tail);
        expect(groundBounds.min.y).toBeGreaterThanOrEqual(0);
        expect(groundBounds.min.y).toBeLessThan(0.02);
    }
    let maxBend = 0;
    for (let i = 0; i < positions.count; i++) {
        const u = tail.geometry.getAttribute('uv').getX(i);
        const dx = positions.getX(i) - rest[i * 3];
        maxBend = Math.max(maxBend, Math.abs(dx));
        expect(outlinePositions.getX(i) - outlineRest[i * 3]).toBeCloseTo(dx, 6);
        if (u === 0) expect(dx).toBe(0);
        if (u === 1) {
            expect(tail.children[0].position.x - tipRest.x).toBeCloseTo(dx, 6);
            expect(tail.children[0].position.y - tipRest.y).toBeCloseTo(positions.getY(i) - rest[i * 3 + 1], 6);
        }
    }
    expect(maxBend).toBeGreaterThan(0.03);
    expect(tail.geometry).toBe(geometry);
    rat.respawn({ x: 0, y: 0, z: 0, hp: 3 });
    expect(Array.from(positions.array)).toEqual(rest);
    expect(tail.children[0].position).toEqual(tipRest);
    rat.dispose();
});

it('keeps the hit readable and recovers the original colors and pose', () => {
    const rat = new RatEntity(new THREE.Scene(), new CANNON.World(), new THREE.Vector3(), 'Rat', {});
    const body = rat.mesh.getObjectByName('rat-body')!;
    const meshes: THREE.Mesh[] = [];
    rat.mesh.traverse(part => { if (part instanceof THREE.Mesh) meshes.push(part); });
    const colors = meshes.map(mesh => (mesh.material as THREE.MeshStandardMaterial).color.clone());
    rat.takeDamage(1, new THREE.Vector3(0, 0, -10));
    expect(body.scale.y).toBeLessThan(0.97);
    expect(rat.body.velocity.length()).toBe(0);
    const changedColors = meshes.map(mesh => (mesh.material as THREE.MeshStandardMaterial).color.getHex());
    expect(new Set(changedColors).size).toBeGreaterThan(4);
    for (const mesh of meshes) expect((mesh.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeLessThanOrEqual(0.5);
    for (let i = 0; i < 60; i++) rat.update(1 / 60);
    expect(body.scale.y).toBeGreaterThan(0.99);
    meshes.forEach((mesh, i) => expect((mesh.material as THREE.MeshStandardMaterial).color).toEqual(colors[i]));
    rat.dispose();
});

it('tumbles, rebounds on real contact and rests without a timed teleport, then resets', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) });
    world.defaultContactMaterial.friction = 0;
    world.defaultContactMaterial.restitution = 0.05;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(ground);
    const rat = new RatEntity(new THREE.Scene(), world, new THREE.Vector3(), 'Rat', {});
    const hat = rat.mesh.getObjectByName('rat-hat')!;
    const hatRest = hat.rotation.x;
    let peak = 0, bounce = false, lastVelocity = 0;
    rat.takeDamage(3, new THREE.Vector3(0, 0, -10));
    expect(rat.body.velocity.y).toBeGreaterThan(30);
    for (let i = 0; i < 900; i++) {
        world.step(1 / 60); rat.update(1 / 60);
        peak = Math.max(peak, rat.mesh.position.y);
        if (lastVelocity < -2 && rat.body.velocity.y > 1) bounce = true;
        lastVelocity = rat.body.velocity.y;
        const center = new THREE.Vector3(0, 0.95, 0).applyQuaternion(rat.mesh.quaternion).add(rat.mesh.position);
        expect(center.distanceTo(new THREE.Vector3().copy(rat.body.position))).toBeLessThan(1e-10);
        expect(rat.mesh.quaternion.toArray()).toEqual(rat.body.quaternion.toArray());
    }
    expect(peak).toBeGreaterThan(12);
    expect(peak).toBeLessThan(25);
    expect(bounce).toBe(true);
    expect(rat.body.velocity.length()).toBeLessThan(0.5);
    expect(rat.body.angularVelocity.length()).toBeLessThan(0.5);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rat.mesh.quaternion);
    expect(Math.abs(up.y)).toBeLessThan(0.6);
    rat.respawn({ x: 0, y: 0, z: 0, hp: 3 });
    expect(hat.rotation.x).toBe(hatRest);
    expect(rat.mesh.getObjectByName('rat-body')!.scale.y).toBe(1);
    expect(rat.dead).toBe(false);
    rat.dispose(); vi.restoreAllMocks();
});

it('settles respawn and turn follow-through without altering the body or ground-dragging tail', () => {
    const scene = new THREE.Scene();
    const rat = new RatEntity(scene, new CANNON.World(), new THREE.Vector3(), 'Rat', {});
    const coat = rat.mesh.getObjectByName('rat-body')!;
    const hat = rat.mesh.getObjectByName('rat-hat')!;
    const hatY = hat.position.y;
    rat.respawn({ x: 0, y: 0, z: 0, hp: 3 });
    for (let i = 0; i < 8; i++) rat.update(1 / 60);
    expect(coat.scale.y).toBeLessThan(0.95);
    expect(hat.position.y).toBeGreaterThan(hatY);
    for (let i = 0; i < 120; i++) rat.update(1 / 60);
    expect(hat.position.y).toBe(hatY);
    rat.mesh.rotation.y = 0.3;
    rat.update(1 / 60);
    expect(rat.mesh.getObjectByName('rat-head')!.rotation.y).toBeGreaterThan(0);
    expect(coat.rotation.y).toBeLessThan(0);
    for (let i = 0; i < 180; i++) rat.update(1 / 60);
    expect(Math.abs(coat.rotation.y)).toBeLessThan(0.00001);
    expect(rat.body.position.toArray()).toEqual([0, 0, 0]);
    rat.dispose();
});


it('keeps the brief firing flash attached to the moving barrel instead of parking a ball behind it', () => {
    const scene = new THREE.Scene(), world = new CANNON.World();
    const rat = new RatEntity(scene, world, new THREE.Vector3(), 'Rat', {});
    const gun = new CheeseGun(scene, world, {} as THREE.AudioListener);
    gun.authoritative = true;
    const shot = gun.shoot(rat, new THREE.Vector3(8, 3, 20))!;
    const flash = rat.mesh.getObjectByName('rat-muzzle-flash')!;
    expect(flash.visible).toBe(true);
    expect(flash.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([shot.origin.x, shot.origin.y, shot.origin.z]);
    rat.body.position.x += .3;
    rat.mesh.rotation.y = .2;
    rat.update(1 / 60);
    expect(flash.visible).toBe(true);
    expect(flash.getWorldPosition(new THREE.Vector3()).distanceTo(rat.getMuzzlePosition())).toBeLessThan(1e-12);
    expect(flash.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(shot.origin.x, shot.origin.y, shot.origin.z))).toBeGreaterThan(.2);
    for (let frame = 0; frame < 4; frame++) rat.update(1 / 60);
    expect(flash.visible).toBe(false);
    gun.replayShot(rat, shot);
    expect(flash.visible).toBe(true);
    rat.respawn({ x: 0, y: 0, z: 0, hp: 3 });
    expect(flash.visible).toBe(false);
    gun.dispose(); rat.dispose();
});


it('adds small airborne follow-through and a landing settle without moving physics or changing aim', () => {
    const rat = new RatEntity(new THREE.Scene(), new CANNON.World(), new THREE.Vector3(), 'Rat', {});
    const body = rat.mesh.getObjectByName('rat-body')!;
    const hat = rat.mesh.getObjectByName('rat-hat')!;
    const hatRest = hat.position.y;
    rat.update(1 / 60);
    for (let frame = 0; frame < 12; frame++) {
        rat.body.position.y += .12;
        rat.update(1 / 60);
    }
    expect(body.rotation.x).toBeLessThan(-.02);
    expect(hat.position.y).toBeGreaterThan(hatRest);
    expect(hat.position.y - hatRest).toBeLessThan(.04);
    for (let frame = 0; frame < 12; frame++) {
        rat.body.position.y -= .12;
        rat.update(1 / 60);
    }
    const landed = rat.body.position.clone();
    rat.update(1 / 60);
    expect(body.scale.y).toBeLessThan(.98);
    expect(rat.body.position).toEqual(landed);
    for (let frame = 0; frame < 120; frame++) rat.update(1 / 60);
    expect(Math.abs(body.rotation.x)).toBeLessThan(.00001);
    expect(hat.position.y).toBeCloseTo(hatRest, 6);
    rat.respawn({x:0,y:20,z:0,hp:3});
    rat.update(1 / 60);
    expect(body.rotation.x).toBeCloseTo(0, 10);
    rat.dispose();
});

it('releases the upward jump pose at the apex and follows descent without a suspended hat or tail', () => {
    const rat = new RatEntity(new THREE.Scene(), new CANNON.World(), new THREE.Vector3(), 'Rat', {});
    const body = rat.mesh.getObjectByName('rat-body')!;
    const hat = rat.mesh.getObjectByName('rat-hat')!;
    const hatRest = hat.position.y;
    rat.update(1 / 60);
    for (let frame=0;frame<12;frame++) { rat.body.position.y+=.12;rat.update(1/60); }
    expect(body.rotation.x).toBeLessThan(-.03);
    for (let frame=0;frame<5;frame++) rat.update(1/60);
    expect(Math.abs(body.rotation.x)).toBeLessThan(.007);
    expect(hat.position.y-hatRest).toBeLessThan(.001);
    for (let frame=0;frame<5;frame++) { rat.body.position.y-=.1;rat.update(1/60); }
    expect(body.rotation.x).toBeGreaterThan(.015);
    const position=rat.body.position.clone();
    for (let frame=0;frame<12;frame++) rat.update(1/60);
    expect(Math.abs(body.rotation.x)).toBeLessThan(.001);
    expect(rat.body.position).toEqual(position);
    rat.dispose();
});
