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
    const remotes = new RemotePlayers(scene, world);
    remotes.add(player('other', 3));
    remotes.move({ ...player('other', 3), x: 30 });
    remotes.update(1 / 60);
    const entity = remotes.get('other')!;
    expect(entity.mesh.position.x).toBeCloseTo(18);
    expect(entity.body.position.x).toBe(entity.mesh.position.x);
    expect(entity.body.aabbNeedsUpdate).toBe(true);
    remotes.dispose();
});
