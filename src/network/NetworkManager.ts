import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import { RatOptions, HatType } from '../utils/RatModel';
import { CheeseGun } from '../weapons/CheeseGun';
import type { ClientMessage, PlayerData, ScoreEntry, ServerMessage } from '../shared/networkProtocol';

const SEND_RATE_HZ = 25;
const SEND_INTERVAL = 1000 / SEND_RATE_HZ;

interface RemoteRat {
    entity: RatEntity;
    targetPos: THREE.Vector3;
    targetMeshQuat: THREE.Quaternion;
}

function resolveWebSocketUrl(serverUrl?: string): string {
    const configured = serverUrl
        || (import.meta as any).env?.VITE_WS_URL;
    const roomName = new URLSearchParams(window.location.search).get('room');

    if (configured) {
        const url = new URL(configured, window.location.href);
        if (url.protocol === 'http:') url.protocol = 'ws:';
        if (url.protocol === 'https:') url.protocol = 'wss:';
        if (url.pathname === '/' || url.pathname === '') url.pathname = '/ws';
        if (roomName && !url.searchParams.has('room')) url.searchParams.set('room', roomName);
        return url.toString();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/ws`);
    if (roomName) url.searchParams.set('room', roomName);
    return url.toString();
}

export class NetworkManager {
    private socket: WebSocket | null = null;
    private scene: THREE.Scene;
    private world: CANNON.World;
    private cheeseGun: CheeseGun;
    private url: string;
    private localPlayerEntity: RatEntity | null = null;

    public remoteRats: Map<string, RemoteRat> = new Map();
    public myId: string = '';

    private lastSendTime: number = 0;

    public onWelcome: ((player: PlayerData) => void) | null = null;
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
        this.url = resolveWebSocketUrl(serverUrl);
    }

    connect(name: string, options: RatOptions): void {
        if (this.socket && this.socket.readyState !== WebSocket.CLOSED) return;

        const socket = new WebSocket(this.url);
        this.socket = socket;

        socket.addEventListener('open', () => {
            console.log(`[Network] Connected to ${this.url}`);
            this.send({
                type: 'join',
                name,
                appearance: {
                    hatType: (options.hatType as HatType) || 'fedora',
                    hatColor: options.hatColor ?? 0xDC4A3C,
                    furColor: options.furColor ?? 0xE8B84D,
                    coatColor: options.coatColor ?? 0xBE4545,
                },
            });
        });

        socket.addEventListener('message', (event) => {
            this.handleMessage(event.data);
        });

        socket.addEventListener('close', () => {
            console.log('[Network] Disconnected from server');
        });

        socket.addEventListener('error', () => {
            console.warn('[Network] WebSocket error');
        });
    }

    setLocalPlayer(entity: RatEntity): void {
        this.localPlayerEntity = entity;
    }

    private handleMessage(raw: unknown): void {
        if (typeof raw !== 'string') return;

        let message: ServerMessage;
        try {
            message = JSON.parse(raw) as ServerMessage;
        } catch {
            console.warn('[Network] Ignoring invalid server message');
            return;
        }

        switch (message.type) {
            case 'welcome':
                this.myId = message.id;
                console.log(`[Network] Joined as ${this.myId}`);
                this.onWelcome?.(message.player);
                break;

            case 'currentPlayers':
                console.log(`[Network] Received ${Object.keys(message.players).length} existing players`);
                for (const [id, data] of Object.entries(message.players)) {
                    if (id === this.myId) continue;
                    this.spawnRemoteRat(id, data);
                }
                break;

            case 'playerJoined':
                if (message.player.id === this.myId) return;
                console.log(`[Network] Player joined: ${message.player.name}`);
                this.spawnRemoteRat(message.player.id, message.player);
                break;

            case 'playerMoved': {
                const data = message.player;
                const remote = this.remoteRats.get(data.id);
                if (!remote) return;

                remote.targetPos.set(data.x, data.y, data.z);
                remote.targetMeshQuat.set(data.meshQx, data.meshQy, data.meshQz, data.meshQw);
                break;
            }

            case 'playerShot': {
                const remote = this.remoteRats.get(message.shooterId);
                if (!remote) return;

                const target = new THREE.Vector3(message.target.x, message.target.y, message.target.z);
                this.cheeseGun.shoot(remote.entity, target);
                break;
            }

            case 'playerDamaged':
                this.handlePlayerDamaged(message);
                break;

            case 'playerDied':
                this.handlePlayerDied(message);
                break;

            case 'scoreboardUpdate':
                this.onScoreboardUpdate?.(message.scores);
                break;

            case 'playerRespawn':
                if (message.id === this.myId) {
                    this.onLocalRespawn?.(message);
                } else {
                    const remote = this.remoteRats.get(message.id);
                    if (remote) this.respawnRemoteRat(remote, message);
                }
                break;

            case 'playerLeft':
                console.log(`[Network] Player left: ${message.id}`);
                this.removeRemoteRat(message.id);
                break;

            case 'gameWon':
                console.log(`[Network] ${message.winnerName} wins with ${message.kills} kills!`);
                this.onGameWon?.(message);
                break;

            case 'gameReset':
                console.log('[Network] Game reset - new round starting');
                this.onGameReset?.();
                break;

            case 'pong':
                break;

            case 'error':
                console.warn(`[Network] ${message.message}`);
                break;
        }
    }

    private handlePlayerDamaged(data: Extract<ServerMessage, { type: 'playerDamaged' }>): void {
        const remote = this.remoteRats.get(data.id);
        if (remote) {
            remote.entity.hp = data.hp;
            remote.entity.billboard.setHealth(data.hp);
            if (data.hp > 0) {
                remote.entity.flashColor(0xff0000);
            }
        }

        this.onPlayerDamaged?.(data);
    }

    private handlePlayerDied(data: Extract<ServerMessage, { type: 'playerDied' }>): void {
        console.log(`[Network] ${data.killerName} killed ${data.victimName}`);

        const remote = this.remoteRats.get(data.victimId);
        if (remote && !remote.entity.dead) {
            let impactDir: THREE.Vector3;
            const killer = this.remoteRats.get(data.killerId);
            if (killer) {
                impactDir = new THREE.Vector3().subVectors(
                    remote.entity.mesh.position,
                    killer.entity.mesh.position
                );
                impactDir.y = 0;
                impactDir.normalize().multiplyScalar(50);
            } else if (data.killerId === this.myId && this.localPlayerEntity) {
                impactDir = new THREE.Vector3().subVectors(
                    remote.entity.mesh.position,
                    this.localPlayerEntity.mesh.position
                );
                impactDir.y = 0;
                impactDir.normalize().multiplyScalar(50);
            } else {
                impactDir = new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    0,
                    (Math.random() - 0.5) * 2
                ).normalize().multiplyScalar(50);
            }
            remote.entity.takeDamage(999, impactDir);
        }

        this.onPlayerDied?.(data);
        this.onKillFeedMessage?.(`${data.killerName} eliminated ${data.victimName}`);
    }

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
            targetMeshQuat: new THREE.Quaternion(data.meshQx, data.meshQy, data.meshQz, data.meshQw)
        });

        console.log(`[Network] Spawned remote rat: ${data.name} (${id})`);
    }

    private respawnRemoteRat(remote: RemoteRat, data: { x: number; y: number; z: number; hp: number }): void {
        const entity = remote.entity;

        entity.dead = false;
        entity.hp = data.hp;
        entity.billboard.setHealth(data.hp);
        entity.mesh.visible = true;
        entity.billboard.sprite.visible = true;
        this.scene.add(entity.billboard.sprite);
        entity.mesh.userData.deathLogged = false;

        const body = entity.body;
        body.mass = 0;
        body.type = CANNON.Body.KINEMATIC;
        body.fixedRotation = true;
        body.linearDamping = 0;
        body.angularDamping = 0;
        body.updateMassProperties();

        const newPos = new THREE.Vector3(data.x, data.y, data.z);
        body.position.set(data.x, data.y, data.z);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.quaternion.set(0, 0, 0, 1);
        body.wakeUp();

        entity.mesh.position.copy(newPos);
        entity.mesh.quaternion.set(0, 0, 0, 1);

        remote.targetPos.copy(newPos);
        remote.targetMeshQuat.set(0, 0, 0, 1);
    }

    private removeRemoteRat(id: string): void {
        const remote = this.remoteRats.get(id);
        if (remote) {
            remote.entity.dispose();
            this.remoteRats.delete(id);
        }
    }

    sendMovement(entity: RatEntity): void {
        const now = performance.now();
        if (now - this.lastSendTime < SEND_INTERVAL) return;
        this.lastSendTime = now;

        const p = entity.body.position;
        const q = entity.body.quaternion;

        this.send({
            type: 'updateMovement',
            position: { x: p.x, y: p.y, z: p.z },
            rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
            meshRotation: {
                x: entity.mesh.quaternion.x,
                y: entity.mesh.quaternion.y,
                z: entity.mesh.quaternion.z,
                w: entity.mesh.quaternion.w
            }
        });
    }

    sendShoot(origin: THREE.Vector3, target: THREE.Vector3): void {
        this.send({
            type: 'shoot',
            origin: { x: origin.x, y: origin.y, z: origin.z },
            target: { x: target.x, y: target.y, z: target.z }
        });
    }

    sendHit(victimId: string, damage: number): void {
        this.send({ type: 'hit', victimId, damage });
    }

    getSocketIdForEntity(entity: RatEntity): string | null {
        for (const [id, remote] of this.remoteRats) {
            if (remote.entity === entity) return id;
        }
        return null;
    }

    updateRemoteRats(dt: number): void {
        const lerpFactor = Math.min(dt * 12, 1);

        for (const [_id, remote] of this.remoteRats) {
            if (remote.entity.dead) {
                remote.entity.update(dt);
                continue;
            }

            remote.entity.mesh.position.lerp(remote.targetPos, lerpFactor);
            remote.entity.mesh.quaternion.slerp(remote.targetMeshQuat, lerpFactor);
            remote.entity.body.position.set(
                remote.entity.mesh.position.x,
                remote.entity.mesh.position.y,
                remote.entity.mesh.position.z
            );
            remote.entity.update(dt);
        }
    }

    destroy(): void {
        for (const [id] of this.remoteRats) {
            this.removeRemoteRat(id);
        }
        this.socket?.close();
        this.socket = null;
    }

    private send(message: ClientMessage): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify(message));
    }
}
