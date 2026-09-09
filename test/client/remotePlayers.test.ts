import { expect, it } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RemotePlayers } from '../../src/session/RemotePlayers';
import type { PlayerData } from '../../src/shared/networkProtocol';

const player = (id: string, hp: number): PlayerData => ({ id, name: id, hatType: 'fedora', hatColor: 1, coatColor: 2,
    furColor: 3, x: 15, y: 2, z: 15, qx: 0, qy: 0, qz: 0, qw: 1,
    meshQx: 0, meshQy: 0, meshQz: 0, meshQw: 1, hp, kills: 0, deaths: 0 });

it('applies injured/dead late joins and replaces the complete scene state on reconnect', () => {
    const scene = new THREE.Scene();
    const world = new CANNON.World();
    const remotes = new RemotePlayers(scene, world);
    remotes.snapshot({ me: player('me', 3), injured: player('injured', 1), dead: player('dead', 0) }, 'me');
    expect(remotes.get('me')).toBeUndefined();
    expect(remotes.get('injured')?.hp).toBe(1);
    expect(remotes.get('dead')?.dead).toBe(true);
    const previous = remotes.get('injured')!;
    remotes.snapshot({ me: player('me', 3), injured: player('injured', 2) }, 'me');
    expect(previous.mesh.parent).toBeNull();
    expect(remotes.get('dead')).toBeUndefined();
    expect(remotes.get('injured')?.hp).toBe(2);
    expect(world.bodies).toHaveLength(1);
    remotes.dispose();
    expect(scene.children).toHaveLength(0);
    expect(world.bodies).toHaveLength(0);
});

it('updates remote collision and visible positions together before projectile queries', () => {
    const scene = new THREE.Scene();
    const world = new CANNON.World();
    let now = 0;
    const remotes = new RemotePlayers(scene, world, () => now);
    remotes.add(player('other', 3));
    now = 100;
    remotes.move({ ...player('other', 3), x: 30 });
    now = remotes.rats.get('other')!.snapshots.delayMs + 50;
    remotes.prepareFrame();
    remotes.presentFrame();
    const entity = remotes.get('other')!;
    const delay = remotes.rats.get('other')!.snapshots.delayMs;
    expect(entity.mesh.position.x).toBeCloseTo(15 + 15 * (now - delay) / 100);
    expect(entity.body.position.x).toBe(entity.mesh.position.x);
    expect(entity.body.aabbNeedsUpdate).toBe(true);
    remotes.dispose();
});


it('clears interpolation history on respawn and leaves no stale pose after removal', () => {
    let now = 0;
    const remotes = new RemotePlayers(new THREE.Scene(), new CANNON.World(), () => now);
    remotes.add(player('other', 3));
    now = 100;
    remotes.move({ ...player('other', 3), x: 25 });
    remotes.respawn('other', { x: -100, y: 2, z: 50, hp: 3 });
    remotes.prepareFrame();
    remotes.presentFrame();
    expect(remotes.get('other')!.mesh.position.x).toBe(-100);
    const history = remotes.rats.get('other')!.snapshots;
    expect(history.size).toBe(1);
    remotes.remove('other');
    expect(history.size).toBe(0);
    expect(remotes.get('other')).toBeUndefined();
});

it('forwards server timestamps so batched remote movements remain distinct', () => {
    let now = 0;
    const remotes = new RemotePlayers(new THREE.Scene(), new CANNON.World(), () => now);
    remotes.add(player('other', 3));
    remotes.move({ ...player('other', 3), x: 15 }, 5000);
    now = 250;
    remotes.move({ ...player('other', 3), x: 25 }, 5100);
    remotes.move({ ...player('other', 3), x: 35 }, 5200);
    expect(remotes.rats.get('other')!.snapshots.size).toBe(3);
    now = remotes.rats.get('other')!.snapshots.delayMs + 100;
    remotes.prepareFrame();
    remotes.presentFrame();
    const x = remotes.get('other')!.mesh.position.x;
    expect(x).toBeGreaterThan(15);
    expect(x).toBeLessThan(35);
    remotes.dispose();
});
