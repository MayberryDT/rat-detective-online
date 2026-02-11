import { io, Socket } from 'socket.io-client';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import { RatOptions, HatType } from '../utils/RatModel';
import { CheeseGun } from '../weapons/CheeseGun';

// ─── SEND RATE ───────────────────────────────────────────────────────
const SEND_RATE_HZ = 25; // ~25 updates/sec (40ms interval)
const SEND_INTERVAL = 1000 / SEND_RATE_HZ;

// ─── INTERFACES ──────────────────────────────────────────────────────
interface RemoteRat {
    entity: RatEntity;
    targetPos: THREE.Vector3;
    targetMeshQuat: THREE.Quaternion;
    lastUpdate: number;
}

interface PlayerData {
    id: string;
    x: number; y: number; z: number;
    qx: number; qy: number; qz: number; qw: number;
    name: string;
    hp: number;
    kills: number;
    deaths: number;
    hatType: string;
    hatColor: number;
    furColor: number;
    coatColor: number;
}

interface ScoreEntry {
    id: string;
    name: string;
    kills: number;
    deaths: number;
}

export class NetworkManager {
    private socket: Socket;
    private scene: THREE.Scene;
    private world: CANNON.World;
    private cheeseGun: CheeseGun;

    public remoteRats: Map<string, RemoteRat> = new Map();
    public myId: string = '';

    // Send throttle
    private lastSendTime: number = 0;

    // Callbacks for UI updates
    public onScoreboardUpdate: ((scores: ScoreEntry[]) => void) | null = null;
    public onPlayerDied: ((data: { victimId: string; killerId: string; killerName: string; victimName: string }) => void) | null = null;
    public onPlayerDamaged: ((data: { id: string; hp: number; attackerId: string }) => void) | null = null;
    public onLocalRespawn: ((data: { x: number; y: number; z: number; hp: number }) => void) | null = null;
    public onKillFeedMessage: ((msg: string) => void) | null = null;
    public onGameWon: ((data: { winnerName: string; kills: number }) => void) | null = null;
    public onGameReset: (() => void) | null = null;

    constructor(
        scene: THREE.Scene,
        world: CANNON.World,
        cheeseGun: CheeseGun,
        serverUrl?: string
    ) {
        this.scene = scene;
        this.world = world;
        this.cheeseGun = cheeseGun;

        const url = serverUrl || (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3000';
        this.socket = io(url, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        this.setupListeners();
    }

    // ─── CONNECT / JOIN ──────────────────────────────────────────────
    connect(name: string, options: RatOptions): void {
        this.socket.emit('join', {
            name,
            hatType: options.hatType || 'fedora',
            hatColor: options.hatColor ?? 0xDC4A3C,
            furColor: options.furColor ?? 0xE8B84D,
            coatColor: options.coatColor ?? 0xBE4545,
        });
    }

    // ─── LISTENER SETUP ──────────────────────────────────────────────
    private setupListeners(): void {
        this.socket.on('connect', () => {
            this.myId = this.socket.id!;
            console.log(`[Network] Connected as ${this.myId}`);
        });

        // ── Receive all current players on join ──
        this.socket.on('currentPlayers', (players: Record<string, PlayerData>) => {
            console.log(`[Network] Received ${Object.keys(players).length} existing players`);
            for (const [id, data] of Object.entries(players)) {
                if (id === this.myId) continue; // Skip self
                this.spawnRemoteRat(id, data);
            }
        });

        // ── New player joins ──
        this.socket.on('playerJoined', (data: PlayerData & { id: string }) => {
            if (data.id === this.myId) return;
            console.log(`[Network] Player joined: ${data.name}`);
            this.spawnRemoteRat(data.id, data);
        });

        // ── Remote player moved ──
        this.socket.on('playerMoved', (data: {
            id: string;
            x: number; y: number; z: number;
            qx: number; qy: number; qz: number; qw: number;
            meshQx: number; meshQy: number; meshQz: number; meshQw: number;
        }) => {
            const remote = this.remoteRats.get(data.id);
            if (!remote) return;

            remote.targetPos.set(data.x, data.y, data.z);
            remote.targetMeshQuat.set(data.meshQx, data.meshQy, data.meshQz, data.meshQw);
            remote.lastUpdate = performance.now();
        });

        // ── Remote player shot ──
        this.socket.on('playerShot', (data: {
            shooterId: string;
            origin: { x: number; y: number; z: number };
            target: { x: number; y: number; z: number };
        }) => {
            const remote = this.remoteRats.get(data.shooterId);
            if (!remote) return;

            // Visual-only shot from remote player
            const target = new THREE.Vector3(data.target.x, data.target.y, data.target.z);
            this.cheeseGun.shoot(remote.entity, target);
        });

        // ── Player damaged ──
        this.socket.on('playerDamaged', (data: { id: string; hp: number; attackerId: string }) => {
            // Update remote rat HP
            const remote = this.remoteRats.get(data.id);
            if (remote) {
                remote.entity.hp = data.hp;
                remote.entity.billboard.setHealth(data.hp);
                if (data.hp > 0) {
                    // Flash red
                    (remote.entity as any).flashColor?.(0xff0000);
                }
            }

            // Notify main (for local player damage)
            this.onPlayerDamaged?.(data);
        });

        // ── Player died ──
        this.socket.on('playerDied', (data: {
            victimId: string;
            killerId: string;
            killerName: string;
            victimName: string;
        }) => {
            console.log(`[Network] ${data.killerName} killed ${data.victimName}`);

            // Trigger death on remote rat
            const remote = this.remoteRats.get(data.victimId);
            if (remote && !remote.entity.dead) {
                // Simulate an impact direction for death ragdoll
                const impactDir = new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    0,
                    (Math.random() - 0.5) * 2
                ).normalize().multiplyScalar(50);
                remote.entity.takeDamage(999, false, impactDir);
            }

            this.onPlayerDied?.(data);
            this.onKillFeedMessage?.(`${data.killerName} eliminated ${data.victimName}`);
        });

        // ── Scoreboard update ──
        this.socket.on('scoreboardUpdate', (scores: ScoreEntry[]) => {
            this.onScoreboardUpdate?.(scores);
        });

        // ── Player respawn ──
        this.socket.on('playerRespawn', (data: {
            id: string;
            x: number; y: number; z: number;
            hp: number;
        }) => {
            if (data.id === this.myId) {
                // Local respawn
                this.onLocalRespawn?.(data);
            } else {
                // Remote respawn — reset their entity
                const remote = this.remoteRats.get(data.id);
                if (remote) {
                    this.respawnRemoteRat(remote, data);
                }
            }
        });

        // ── Player left ──
        this.socket.on('playerLeft', (data: { id: string }) => {
            console.log(`[Network] Player left: ${data.id}`);
            this.removeRemoteRat(data.id);
        });

        this.socket.on('disconnect', () => {
            console.log('[Network] Disconnected from server');
        });

        // ── Game Won ──
        this.socket.on('gameWon', (data: { winnerName: string; kills: number }) => {
            console.log(`[Network] ${data.winnerName} wins with ${data.kills} kills!`);
            this.onGameWon?.(data);
        });

        // ── Game Reset ──
        this.socket.on('gameReset', () => {
            console.log('[Network] Game reset — new round starting');
            this.onGameReset?.();
        });
    }

    // ─── SPAWN REMOTE RAT ──────────────────────────────────────────────
    private spawnRemoteRat(id: string, data: PlayerData): void {
        if (this.remoteRats.has(id)) return;

        const pos = new THREE.Vector3(data.x, data.y, data.z);
        const opts: RatOptions = {
            hatType: (data.hatType as HatType) || 'fedora',
            hatColor: data.hatColor,
            furColor: data.furColor,
            coatColor: data.coatColor
        };

        const entity = new RatEntity(this.scene, this.world, pos, data.name, opts, true);

        this.remoteRats.set(id, {
            entity,
            targetPos: pos.clone(),
            targetMeshQuat: new THREE.Quaternion(0, 0, 0, 1),
            lastUpdate: performance.now()
        });

        console.log(`[Network] Spawned remote rat: ${data.name} (${id})`);
    }

    // ─── RESPAWN REMOTE RAT ────────────────────────────────────────────
    private respawnRemoteRat(remote: RemoteRat, data: { x: number; y: number; z: number; hp: number }): void {
        const entity = remote.entity;

        // Reset entity state
        entity.dead = false;
        entity.hp = data.hp;
        entity.billboard.setHealth(data.hp);
        entity.mesh.visible = true;
        entity.billboard.sprite.visible = true;
        this.scene.add(entity.billboard.sprite);
        entity.mesh.userData.deathLogged = false;

        // ── Restore physics body to pre-death state ──
        // die() modifies: mass→2, fixedRotation→false, damping→low, body.sleep()
        // Remote rats are KINEMATIC (mass 0), so we must restore that:
        const body = entity.body;
        body.mass = 0;
        body.type = CANNON.Body.KINEMATIC;
        body.fixedRotation = true;
        body.linearDamping = 0;
        body.angularDamping = 0;
        body.updateMassProperties();

        // Reset position & motion
        const newPos = new THREE.Vector3(data.x, data.y, data.z);
        body.position.set(data.x, data.y, data.z);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.quaternion.set(0, 0, 0, 1);
        body.wakeUp();

        // Sync visuals
        entity.mesh.position.copy(newPos);
        entity.mesh.quaternion.set(0, 0, 0, 1);

        remote.targetPos.copy(newPos);
        remote.targetMeshQuat.set(0, 0, 0, 1);
    }

    // ─── REMOVE REMOTE RAT ────────────────────────────────────────────
    private removeRemoteRat(id: string): void {
        const remote = this.remoteRats.get(id);
        if (remote) {
            remote.entity.dispose();
            this.remoteRats.delete(id);
        }
    }

    // ─── SEND LOCAL STATE ─────────────────────────────────────────────
    sendMovement(entity: RatEntity): void {
        const now = performance.now();
        if (now - this.lastSendTime < SEND_INTERVAL) return;
        this.lastSendTime = now;

        const p = entity.body.position;
        const q = entity.body.quaternion;

        this.socket.emit('updateMovement', {
            x: p.x, y: p.y, z: p.z,
            qx: q.x, qy: q.y, qz: q.z, qw: q.w,
            meshQx: entity.mesh.quaternion.x,
            meshQy: entity.mesh.quaternion.y,
            meshQz: entity.mesh.quaternion.z,
            meshQw: entity.mesh.quaternion.w
        });
    }

    sendShoot(origin: THREE.Vector3, target: THREE.Vector3): void {
        this.socket.emit('shoot', {
            origin: { x: origin.x, y: origin.y, z: origin.z },
            target: { x: target.x, y: target.y, z: target.z }
        });
    }

    sendHit(victimId: string, damage: number): void {
        this.socket.emit('hit', { victimId, damage });
    }

    // ─── FIND ENTITY BY SOCKET ID ──────────────────────────────────────
    getSocketIdForEntity(entity: RatEntity): string | null {
        for (const [id, remote] of this.remoteRats) {
            if (remote.entity === entity) return id;
        }
        return null;
    }

    // ─── UPDATE REMOTE RATS (Interpolation) ───────────────────────────
    updateRemoteRats(dt: number): void {
        const lerpFactor = Math.min(dt * 12, 1); // Smooth interpolation

        for (const [_id, remote] of this.remoteRats) {
            if (remote.entity.dead) {
                remote.entity.update(dt);
                continue;
            }

            // Lerp mesh position
            remote.entity.mesh.position.lerp(remote.targetPos, lerpFactor);

            // Lerp mesh rotation (visual facing)
            remote.entity.mesh.quaternion.slerp(remote.targetMeshQuat, lerpFactor);

            // Sync physics body (kinematic — no gravity for remotes)
            remote.entity.body.position.set(
                remote.entity.mesh.position.x,
                remote.entity.mesh.position.y,
                remote.entity.mesh.position.z
            );

            // Update billboard + glow
            remote.entity.update(dt);
        }
    }

    // ─── CLEANUP ──────────────────────────────────────────────────────
    destroy(): void {
        for (const [id] of this.remoteRats) {
            this.removeRemoteRat(id);
        }
        this.socket.disconnect();
    }
}
