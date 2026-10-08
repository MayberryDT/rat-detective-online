import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import type { PlayerData, Vec3Data } from '../shared/networkProtocol';
import { SnapshotBuffer, BotSnapshotBuffer, type SnapshotPose } from '../shared/SnapshotBuffer';

interface RemoteRat {
    entity: RatEntity;
    snapshots: SnapshotBuffer;
    generation: number;
}

/** Scene representation of remote state. It never reads or sends a socket. */
export class RemotePlayers {
    /** Dedicated presentation group lets a walking observer pass through rats. */
    observing = false;
    readonly rats = new Map<string, RemoteRat>();
    private previousFrameAt: number | undefined;
    private frameDt = 1 / 60;
    private readonly ids = new Map<RatEntity, string>();
    constructor(private readonly scene: THREE.Scene, private readonly world: CANNON.World,
        private readonly now: () => number = () => performance.now(),
        private readonly batchRigs = true) {}

    snapshot(players: Record<string, PlayerData>, myId: string): void {
        this.clear();
        for (const [id, player] of Object.entries(players)) if (id !== myId) this.add(player);
    }
    add(player: PlayerData): void {
        if (this.rats.has(player.id)) return;
        const position = new THREE.Vector3(player.x, player.y, player.z);
        const entity = new RatEntity(this.scene, this.world, position, player.name, player, true);
        entity.applySnapshot(player);
        if(this.observing)entity.body.collisionFilterGroup=4;
        if(this.batchRigs)entity.enableRigidBatching();
        const snapshots = player.id.startsWith('rd-ai-') ? new BotSnapshotBuffer() : new SnapshotBuffer();
        snapshots.reset({ ...player, qx: player.meshQx, qy: player.meshQy, qz: player.meshQz, qw: player.meshQw }, this.now());
        this.rats.set(player.id, { entity, snapshots, generation: snapshots.generation });
        this.ids.set(entity, player.id);
    }
    /** An exhibit replay starting its clip again: an existing rat takes `player`'s state as on a respawn (its powerups,
     * stains, hat, death and colours reset) instead of being rebuilt. False when there is no such rat. */
    restart(player: PlayerData): boolean {
        const remote = this.rats.get(player.id);
        if (!remote) return false;
        this.previousFrameAt = undefined;
        remote.entity.setDeathStyle('default');remote.entity.applySnapshot(player);
        remote.snapshots.reset({ ...player, qx: player.meshQx, qy: player.meshQy, qz: player.meshQz, qw: player.meshQw }, this.now());
        return true;
    }
    move(player: Pick<PlayerData, 'id' | 'x' | 'y' | 'z' | 'meshQx' | 'meshQy' | 'meshQz' | 'meshQw'>, serverAt?: number): void {
        const remote = this.rats.get(player.id);
        if (!remote) return;
        remote.snapshots.push({ x: player.x, y: player.y, z: player.z,
            qx: player.meshQx, qy: player.meshQy, qz: player.meshQz, qw: player.meshQw }, this.now(), serverAt);
    }
    respawn(id: string, data: { x: number; y: number; z: number; hp: number }): void {
        const remote = this.rats.get(id);
        if (!remote) return;
        remote.entity.respawn(data);
        remote.snapshots.reset({ ...data, qx: 0, qy: 0, qz: 0, qw: 1 }, this.now());
    }
    get(id: string): RatEntity | undefined { return this.rats.get(id)?.entity; }
    idFor(entity: RatEntity): string | undefined { return this.ids.get(entity); }
    /** Server time represented by the rat under the crosshair. This is evidence
     * for bounded authority rewind, never a client-selected hit target. */
    viewAt(origin:Vec3Data,direction:Vec3Data):number|undefined {
        const magnitude=Math.hypot(direction.x,direction.y,direction.z)||1;
        const dx=direction.x/magnitude,dy=direction.y/magnitude,dz=direction.z/magnitude;
        let best=Infinity,viewAt:number|undefined;
        for(const {entity,snapshots} of this.rats.values()){
            if(entity.dead||snapshots.presentedSourceTime===undefined)continue;
            const p=entity.body.position,x=p.x-origin.x,y=p.y+.95-origin.y,z=p.z-origin.z;
            const along=x*dx+y*dy+z*dz;if(along<=0||along>=best)continue;
            const lateral=Math.hypot(x-dx*along,y-dy*along,z-dz*along);
            if(lateral<=1.25){best=along;viewAt=snapshots.presentedSourceTime;}
        }
        return viewAt;
    }
    timingDiagnostics():unknown {
        const delays=[...this.rats.values()].map(({snapshots})=>({delayMs:snapshots.delayMs,viewAt:snapshots.presentedSourceTime??null}));
        return{rats:delays.length,minimumDelayMs:delays.length?Math.min(...delays.map(d=>d.delayMs)):0,maximumDelayMs:delays.length?Math.max(...delays.map(d=>d.delayMs)):0};
    }
    /** The median playback delay of remote humans and of bots, ms (the perf report reads it every 30 s). */
    viewDelays():{viewHuman?:number;viewBot?:number}{
        const human:number[]=[],bot:number[]=[];
        for(const [id,{snapshots}] of this.rats)(id.startsWith('rd-ai-')?bot:human).push(snapshots.delayMs);
        const median=(a:number[])=>a.sort((x,y)=>x-y)[a.length>>1];
        return{...(human.length?{viewHuman:Math.round(median(human)!)}:{}),...(bot.length?{viewBot:Math.round(median(bot)!)}:{})};
    }

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
    /** An exhibit replay: place every living rat at `pose(id)` (its recorded track, not snapshot playback) for a
     * frame of `dt` seconds; `cut` (a seek or loop) clears motion history. */
    placeFrame(dt: number, pose: (id: string) => SnapshotPose | undefined, cut: boolean): void {
        this.frameDt = dt;
        for (const [id, { entity }] of this.rats) {
            if (entity.dead) continue;
            const p = pose(id);
            if (!p) continue;
            if (cut) entity.resetMotionHistory();
            entity.mesh.position.set(p.x, p.y, p.z);
            entity.mesh.quaternion.set(p.qx, p.qy, p.qz, p.qw);
            entity.body.position.set(p.x, p.y, p.z);
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
