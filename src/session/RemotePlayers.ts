import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import type { PlayerData } from '../shared/networkProtocol';

interface RemoteRat {
    entity: RatEntity;
    targetPos: THREE.Vector3;
    targetQuat: THREE.Quaternion;
}

/** Scene representation of remote state. It never reads or sends a socket. */
export class RemotePlayers {
    readonly rats = new Map<string, RemoteRat>();
    private readonly ids = new Map<RatEntity, string>();
    constructor(private readonly scene: THREE.Scene, private readonly world: CANNON.World) {}

    snapshot(players: Record<string, PlayerData>, myId: string): void {
        this.clear();
        for (const [id, player] of Object.entries(players)) if (id !== myId) this.add(player);
    }
    add(player: PlayerData): void {
        if (this.rats.has(player.id)) return;
        const position = new THREE.Vector3(player.x, player.y, player.z);
        const entity = new RatEntity(this.scene, this.world, position, player.name, player, true);
        entity.applySnapshot(player);
        this.rats.set(player.id, {
            entity, targetPos: position,
            targetQuat: new THREE.Quaternion(player.meshQx, player.meshQy, player.meshQz, player.meshQw),
        });
        this.ids.set(entity, player.id);
    }
    move(player: Pick<PlayerData, 'id' | 'x' | 'y' | 'z' | 'meshQx' | 'meshQy' | 'meshQz' | 'meshQw'>): void {
        const remote = this.rats.get(player.id);
        if (!remote) return;
        remote.targetPos.set(player.x, player.y, player.z);
        remote.targetQuat.set(player.meshQx, player.meshQy, player.meshQz, player.meshQw);
    }
    respawn(id: string, data: { x: number; y: number; z: number; hp: number }): void {
        const remote = this.rats.get(id);
        if (!remote) return;
        remote.entity.respawn(data);
        remote.targetPos.set(data.x, data.y, data.z);
        remote.targetQuat.identity();
    }
    get(id: string): RatEntity | undefined { return this.rats.get(id)?.entity; }
    idFor(entity: RatEntity): string | undefined { return this.ids.get(entity); }

    /** Sync remote colliders before local physics/projectile collision queries. */
    update(dt: number): void {
        const factor = 1 - Math.pow(1 - 12 / 60, dt * 60);
        for (const { entity, targetPos, targetQuat } of this.rats.values()) {
            if (!entity.dead) {
                entity.mesh.position.lerp(targetPos, factor);
                entity.mesh.quaternion.slerp(targetQuat, factor);
                entity.body.position.set(entity.mesh.position.x, entity.mesh.position.y, entity.mesh.position.z);
                entity.body.aabbNeedsUpdate = true;
            }
            entity.update(dt);
        }
    }
    remove(id: string): void {
        const remote = this.rats.get(id);
        if (!remote) return;
        this.ids.delete(remote.entity);
        remote.entity.dispose();
        this.rats.delete(id);
    }
    clear(): void { for (const id of this.rats.keys()) this.remove(id); }
    dispose(): void { this.clear(); }
}
