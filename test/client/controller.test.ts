import { expect, it } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatController } from '../../src/player/RatController';
import { SimulationClock } from '../../src/session/SimulationClock';

function simulate(fps: number, jump = false) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) });
    world.defaultContactMaterial.friction = 0;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    const rat = new RatController(new THREE.Scene(), world, new THREE.PerspectiveCamera());
    const clock = new SimulationClock();
    let ticks = 0;
    let maxHeight = 0;
    for (let frame = 0; frame < fps * 3; frame++) {
        clock.advance(1 / fps, dt => {
            const keys: Record<string, boolean> = ticks < 90 ? { KeyW: true } : {};
            if (jump && ticks === 60) keys.Space = true;
            rat.prepareMovement(dt, keys);
            world.step(dt);
            rat.syncAfterPhysics(dt);
            maxHeight = Math.max(maxHeight, rat.entity.body.position.y);
            ticks++;
        });
    }
    const result = { ticks, maxHeight, position: rat.entity.body.position.toArray(), velocity: rat.entity.body.velocity.toArray(),
        rotation: rat.entity.mesh.quaternion.toArray() };
    rat.dispose();
    return result;
}

it('runs the same movement/braking/turn simulation at30,60,144 rendered FPS', () => {
    const baseline = simulate(60);
    expect(baseline.ticks).toBe(180);
    expect(simulate(30)).toEqual(baseline);
    expect(simulate(144)).toEqual(baseline);
});

it('preserves the60Hz acceleration and braking constants', () => {
    const rat = new RatController(new THREE.Scene(), new CANNON.World(), new THREE.PerspectiveCamera());
    rat.prepareMovement(1 / 60, { KeyW: true });
    expect(rat.entity.body.velocity.z).toBeCloseTo(18 * .28);
    rat.prepareMovement(1 / 60, {});
    expect(rat.entity.body.velocity.z).toBeCloseTo(18 * .28 * .88);
    rat.dispose();
});

it('expires edge-jump grace and resets grounded state on respawn', () => {
    const world = new CANNON.World();
    const rat = new RatController(new THREE.Scene(), world, new THREE.PerspectiveCamera());
    const floor = new CANNON.Body({ mass: 0 });
    const contact = new CANNON.ContactEquation(floor, rat.entity.body);
    contact.ni.set(0, 1, 0);
    world.contacts.push(contact);
    rat.entity.body.velocity.y = 0;
    rat.syncAfterPhysics(1 / 60);
    rat.prepareMovement(1 / 60, { Space: true });
    expect(rat.entity.body.velocity.y).toBe(16);
    rat.entity.body.velocity.y = 0;
    world.contacts.length = 0;
    for (let i = 0; i < 10; i++) rat.prepareMovement(1 / 60, {});
    rat.prepareMovement(1 / 60, { Space: true });
    expect(rat.entity.body.velocity.y).toBe(0);
    world.contacts.push(contact);
    rat.syncAfterPhysics(1 / 60);
    rat.resetGrounding();
    rat.prepareMovement(1 / 60, { Space: true });
    expect(rat.entity.body.velocity.y).toBe(0);
    rat.dispose();
});

it('preserves a grounded jump trajectory across render rates', () => {
    const baseline = simulate(60, true);
    expect(baseline.maxHeight).toBeGreaterThan(3);
    expect(simulate(30, true)).toEqual(baseline);
    expect(simulate(144, true)).toEqual(baseline);
});
