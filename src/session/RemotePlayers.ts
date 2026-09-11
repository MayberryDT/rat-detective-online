import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import type { PlayerData } from '../shared/networkProtocol';
import { SnapshotBuffer, BotSnapshotBuffer } from '../shared/SnapshotBuffer';
import {WorldSnapshotBuffer,type WorldPresentationClock} from '../shared/WorldPresentationClock';

interface RemoteRat {
    entity: RatEntity;
    snapshots: SnapshotBuffer;
    generation: number;
}

/** Scene representation of remote state. It never reads or sends a socket. */
export class RemotePlayers {
    readonly rats = new Map<string, RemoteRat>();
    private previousFrameAt: number | undefined;
    private frameDt = 1 / 60;
    private readonly ids = new Map<RatEntity, string>();
    private sharedClockEnabled=true;
    constructor(private readonly scene: THREE.Scene, private readonly world: CANNON.World,
        private readonly now: () => number = () => performance.now(),
        private readonly batchRigs = true,private readonly worldClock?:WorldPresentationClock) {}

    useSharedClock(enabled:boolean):void{this.sharedClockEnabled=enabled;}

    snapshot(players: Record<string, PlayerData>, myId: string): void {
        this.clear();
        for (const [id, player] of Object.entries(players)) if (id !== myId) this.add(player);
    }
    add(player: PlayerData): void {
        if (this.rats.has(player.id)) return;
        const position = new THREE.Vector3(player.x, player.y, player.z);
        const entity = new RatEntity(this.scene, this.world, position, player.name, player, true);
        entity.applySnapshot(player);
        if(this.batchRigs)entity.enableRigidBatching();
        const snapshots = this.worldClock&&this.sharedClockEnabled?new WorldSnapshotBuffer(this.worldClock):player.id.startsWith('rd-ai-') ? new BotSnapshotBuffer() : new SnapshotBuffer();
        snapshots.reset({ ...player, qx: player.meshQx, qy: player.meshQy, qz: player.meshQz, qw: player.meshQw }, this.now());
        this.rats.set(player.id, { entity, snapshots, generation: snapshots.generation });
        this.ids.set(entity, player.id);
    }
    move(player: Pick<PlayerData, 'id' | 'x' | 'y' | 'z' | 'meshQx' | 'meshQy' | 'meshQz' | 'meshQw'>, serverAt?: number): void {
        const remote = this.rats.get(player.id);
        if (!remote) return;
        remote.snapshots.push({ x: player.x, y: player.y, z: player.z,
            qx: player.meshQx, qy: player.meshQy, qz: player.meshQz, qw: player.meshQw }, this.now(), serverAt);
    }
    respawn(id: string, data: { x: number; y: number; z: number; hp: number },sourceAt?:number): void {
        const remote = this.rats.get(id);
        if (!remote) return;
        remote.entity.respawn(data);
        const pose={...data,qx:0,qy:0,qz:0,qw:1};
        if(remote.snapshots instanceof WorldSnapshotBuffer)remote.snapshots.reset(pose,this.now(),sourceAt);
        else remote.snapshots.reset(pose,this.now());
    }
    get(id: string): RatEntity | undefined { return this.rats.get(id)?.entity; }
    idFor(entity: RatEntity): string | undefined { return this.ids.get(entity); }

    /** Sample once per display frame, before fixed-step collision queries. */
    prepareFrame(now = this.now()): void {
        const elapsed = this.previousFrameAt === undefined ? 1 / 60 : (now - this.previousFrameAt) / 1000;
        const discontinuity = !Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 0.25;
        this.frameDt = discontinuity ? 1 / 60 : elapsed;
        this.previousFrameAt = now;
        for (const remote of this.rats.values()) {
            const { entity, snapshots } = remote;
            if (entity.dead) continue;
            const pose = snapshots.sample(now);
            if (!pose) continue;
            if (discontinuity || remote.generation !== snapshots.generation) entity.resetMotionHistory();
            remote.generation = snapshots.generation;
            entity.mesh.position.set(pose.x, pose.y, pose.z);
            entity.mesh.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);
            entity.body.position.set(pose.x, pose.y, pose.z);
            entity.body.aabbNeedsUpdate = true;
        }
    }
    /** Legacy ragdolls retain the existing fixed-step order and timestep. */
    updateDeaths(dt: number): void {
        for (const { entity } of this.rats.values()) if (entity.dead) entity.update(dt);
    }
    /** Must run once per display frame, before carried-case attachment updates. */
    presentFrame(): void {
        for (const { entity } of this.rats.values()) if (!entity.dead) entity.presentAlive(this.frameDt);
    }
    remove(id: string): void {
        const remote = this.rats.get(id);
        if (!remote) return;
        this.ids.delete(remote.entity);
        remote.snapshots.clear();
        remote.entity.dispose();
        this.rats.delete(id);
    }
    clear(): void { this.previousFrameAt = undefined; for (const id of this.rats.keys()) this.remove(id); }
    dispose(): void { this.clear(); }
}
