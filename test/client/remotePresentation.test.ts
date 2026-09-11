import {PresentationEvents} from '../../src/shared/PresentationEvents';
import {WorldPresentationClock} from '../../src/shared/WorldPresentationClock';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RemotePlayers } from '../../src/session/RemotePlayers';
import { GameSession } from '../../src/session/GameSession';
import { createCaseGrip } from '../../src/prototype/CaseGrip';
import { SimulationClock } from '../../src/session/SimulationClock';
import { MotionFoley } from '../../src/audio/MotionFoley';
import type { PlayerData } from '../../src/shared/networkProtocol';

const player: PlayerData = { id: 'remote', name: 'Remote', hatType: 'fedora', hatColor: 1,
    coatColor: 2, furColor: 3, x: 0, y: 2, z: 0, qx: 0, qy: 0, qz: 0, qw: 1,
    meshQx: 0, meshQy: 0, meshQz: 0, meshQw: 1, hp: 3, kills: 0, deaths: 0 };

const canvasDocument = document;
beforeEach(() => vi.stubGlobal('document', canvasDocument));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function replay(fps: number, speed: number) {
    let now = 0, packetAt = 0;
    const world = new CANNON.World();
    const remotes = new RemotePlayers(new THREE.Scene(), world, () => now);
    // Run the production frame orchestration with real remotes/physics; only
    // replace the GPU, transport and unrelated city work. No constructor UI.
    const session = Object.assign(Object.create(GameSession.prototype), {
        disposed: false, previousTime: 0, stats: null, remoteEvents:new PresentationEvents(),worldPresentation:new WorldPresentationClock(), rat: null, bots: null, chaos: null,
        stage: { scene: new THREE.Scene(), world, camera: new THREE.PerspectiveCamera(), renderer: { render() {} } },
        transport: { state: 'playing' }, simulation: new SimulationClock(), remotes,
        gun: { update() {} }, city: { update() {} },
        foleyWorld:{listener(){},motion:new MotionFoley(()=>{})},
    });
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    remotes.add(player);
    const entity = remotes.get(player.id)!;
    const body = entity.mesh.getObjectByName('rat-body')!;
    const samples: { x: number; bob: number }[] = [];
    for (let frame = 0; frame < fps * 3; frame++) {
        now = frame * 1000 / fps;
        while (packetAt <= now + 1e-7) {
            remotes.move({ ...player, x: packetAt * speed / 1000 }, 10000 + packetAt);
            packetAt += 50;
        }
        Reflect.get(GameSession.prototype, 'animate').call(session, now);
        if (frame > fps) samples.push({ x: entity.mesh.position.x, bob: body.position.y });
        expect(entity.mesh.position.x).toBe(entity.body.position.x);
    }
    remotes.dispose();
    return samples;
}

it.each([120, 144])('presents moving remote roots on every %s Hz display frame', fps => {
    const samples = replay(fps, 6.5);
    expect(samples.slice(1).every((p, i) => p.x > samples[i].x)).toBe(true);
});

it.each([6.5, 18])('keeps actual remote gait readable at 30 and 60 Hz at speed %s', speed => {
    const meanBob = (fps: number) => { const a = replay(fps, speed); return a.reduce((sum, p) => sum + p.bob, 0) / a.length; };
    expect(meanBob(30) / meanBob(60)).toBeGreaterThan(0.8);
});

it('keeps moving remote glow, muzzle, tail and case grip attached across a pause and respawn', () => {
    let now = 0;
    const scene = new THREE.Scene(), world = new CANNON.World();
    const remotes = new RemotePlayers(scene, world, () => now);
    remotes.add(player);
    const entity = remotes.get(player.id)!;
    const shell = scene.children.find(o => o instanceof THREE.Group && o !== entity.mesh)!;
    const grip = createCaseGrip(entity);
    const tail = entity.mesh.getObjectByName('rat-tail') as THREE.Mesh;
    const restTail = Array.from(tail.geometry.getAttribute('position').array);
    const shape = entity.body.shapes[0];
    const tick = () => { remotes.prepareFrame(); world.step(1 / 60); remotes.presentFrame(); };
    tick();
    for (let i = 1; i <= 90; i++) {
        now = i * 1000 / 60;
        if (i % 3 === 0) remotes.move({ ...player, x: i * .1 }, 10000 + now);
        tick();
        expect(entity.body.shapes[0]).toBe(shape);
        expect(entity.body.type).toBe(CANNON.Body.KINEMATIC);
        expect(entity.body.position.x).toBe(entity.mesh.position.x);
        expect(shell.position.toArray()).toEqual(entity.mesh.position.toArray());
        expect(shell.getObjectByName('rat-body')!.position.toArray()).toEqual(entity.mesh.getObjectByName('rat-body')!.position.toArray());
        expect(shell.getObjectByName('rat-muzzle')!.getWorldPosition(new THREE.Vector3()).distanceTo(entity.getMuzzlePosition())).toBeLessThan(1e-9);
    }
    expect(Array.from(tail.geometry.getAttribute('position').array)).not.toEqual(restTail);
    const paw = grip.getObjectByName('case-gripping-paw')!;
    const pawLocal = paw.position.clone();
    const expectedPaw = grip.localToWorld(pawLocal);
    expect(paw.getWorldPosition(new THREE.Vector3()).distanceTo(expectedPaw)).toBeLessThan(1e-9);
    now += 1500;
    remotes.move({ ...player, x: 100 }, 10000 + now);
    entity.playShootAnimation();
    tick();
    expect(entity.mesh.position.x).toBe(100);
    expect(entity.mesh.getObjectByName('rat-muzzle-flash')!.visible).toBe(true);
    expect(entity.mesh.getObjectByName('rat-body')!.position.y).toBe(0);
    remotes.respawn(player.id, { x: -10, y: 2, z: 0, hp: 3 });
    now += 16;
    tick();
    expect(entity.mesh.position.x).toBe(-10);
    expect(entity.mesh.getObjectByName('rat-muzzle-flash')!.visible).toBe(false);
    expect(entity.mesh.getObjectByName('rat-body')!.position.y).toBe(0);
    remotes.dispose();
    expect(world.bodies).toHaveLength(0);
});

it('advances legacy death only on fixed steps and keeps shared corpses hidden', () => {
    const remotes = new RemotePlayers(new THREE.Scene(), new CANNON.World(), () => 100);
    remotes.add(player);
    const entity = remotes.get(player.id)!;
    entity.takeDamage(3, new THREE.Vector3(0, 0, -1));
    const update = vi.spyOn(entity, 'update');
    remotes.prepareFrame(); remotes.presentFrame();
    expect(update).not.toHaveBeenCalled();
    remotes.updateDeaths(1 / 60);
    expect(update).toHaveBeenCalledExactlyOnceWith(1 / 60);
    entity.useSharedCorpse();
    remotes.prepareFrame(); remotes.presentFrame();
    expect(entity.mesh.visible).toBe(false);
    expect(entity.body.collisionFilterMask).toBe(0);
    remotes.dispose();
});

it('lets locomotion settle when the remote stream stops at its newest pose', () => {
    let now = 0;
    const remotes = new RemotePlayers(new THREE.Scene(), new CANNON.World(), () => now);
    remotes.add(player);
    for (let i = 0; i < 240; i++) {
        now = i * 1000 / 60;
        if (i < 60 && i % 3 === 0) remotes.move({ ...player, x: i * .1 }, 10000 + now);
        remotes.prepareFrame(); remotes.presentFrame();
    }
    const entity = remotes.get(player.id)!;
    expect(entity.mesh.position.x).toBeCloseTo(5.7);
    expect(entity.mesh.getObjectByName('rat-body')!.position.y).toBeLessThan(.001);
    remotes.dispose();
});
