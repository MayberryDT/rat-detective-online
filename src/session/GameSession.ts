import * as THREE from 'three';
import { ChaosView } from '../prototype/ChaosView';
import { Neighborhood } from '../prototype/Neighborhood';
import { CITY_BOUNDS, GRAYBOX_VERSION } from '../shared/grayboxLayout';
import { CityGenerator } from '../world/CityGenerator';
import { DEFAULT_CITY_OPTIONS, createWorldSpec, type WorldSpec } from '../shared/worldSpec';
import { RatController } from '../player/RatController';
import { CheeseGun } from '../weapons/CheeseGun';
import { initEntitySounds, disposeEntitySounds } from '../entities/RatEntity';
import { generateRandomAppearance } from '../shared/ratAppearance';
import { generateRandomName } from '../shared/ratNames';
import type { ClientMessage, ServerMessage } from '../shared/networkProtocol';
import { NetworkManager } from '../network/NetworkManager';
import { GameHud } from '../ui/GameHud';
import { createStage } from './createStage';
import { RemotePlayers } from './RemotePlayers';
import { InputState } from './InputState';
import { SessionMusic } from './SessionMusic';
import { PerformanceStats } from './PerformanceStats';
import { SimulationClock } from './SimulationClock';
import { NormalGameBots, normalGameBotCount } from './NormalGameBots';
import { muzzleAtPose } from '../utils/muzzlePose';

/** One owner for the complete local game lifetime, including reconnect reconciliation. */
export class GameSession {
    private readonly stage;
    private readonly transport = new NetworkManager();
    private readonly hud = new GameHud(document, () => this.transport.retry());
    private readonly input = new InputState();
    private readonly events = new AbortController();
    private readonly gun;
    private readonly remotes;
    private readonly music;
    private readonly stats: PerformanceStats | null;
    private diagnosticChaos={receivedAt:0,serverTime:0,shots:0};
    private shotsAttempted=0;
    private shotsSent=0;
    private chaos:ChaosView|null=null;
    private bots:NormalGameBots|null=null;
    private city: CityGenerator | Neighborhood;
    private worldSpec: WorldSpec;
    private rat: RatController | null = null;
    private myId = '';
    private frame = 0;
    private previousTime = 0;
    private disposed = false;
    private serverOffset = 0;
    private lastMovementAt = 0;
    private lastMovement = '';
    private assignedName = '';
    private nameRollTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly simulation = new SimulationClock();
    private readonly direction = new THREE.Vector3();

    constructor(renderer: THREE.WebGLRenderer) {
        this.stage = createStage(renderer);
        const showDiagnostics=new URLSearchParams(window.location.search).has('diagnostics');
        this.stats = showDiagnostics || normalGameBotCount(window.location) ? new PerformanceStats(renderer,showDiagnostics,report=>{
            if(['localhost','127.0.0.1','[::1]'].includes(window.location.hostname)&&this.transport.state==='playing')this.transport.send({type:'diagnostics',report});
        }) : null;
        const { scene, world, listener } = this.stage;
        initEntitySounds(listener);
        this.music = new SessionMusic(listener);
        this.gun = new CheeseGun(scene, world, listener);
        this.remotes = new RemotePlayers(scene, world);
        this.worldSpec = createWorldSpec(1);
        if(new URLSearchParams(window.location.search).get('room')?.startsWith('graybox-')) this.worldSpec.version=GRAYBOX_VERSION;
        this.city = this.worldSpec.version===GRAYBOX_VERSION ? new Neighborhood(scene,world,this.worldSpec) : new CityGenerator(scene, world, DEFAULT_CITY_OPTIONS, this.worldSpec);
        this.city.generate();
        this.transport.onMessage = message => this.receive(message);
        this.transport.onState = (state, message) => {
            this.input.clear();
            this.simulation.reset();
            this.hud.setConnection(state, message);
            if (state === 'playing') { this.hud.enterPlaying(); this.music.start(); }
        };
        this.gun.onHitEntity = (victim, damage) => {
            const victimId = this.remotes.idFor(victim);
            if (victimId && this.transport.state === 'playing') this.transport.send({ type: 'hit', victimId, damage });
        };
        this.bindInput();
        this.rollName();
        this.focusTitleControls();
        this.frame = requestAnimationFrame(time => this.animate(time));
    }

    private enterCity(): void {
        if (this.transport.state !== 'idle' && this.transport.state !== 'disconnected') return;
        this.transport.connect(this.assignedName || generateRandomName(), generateRandomAppearance());
        void this.music.unlock();
        this.requestPointerLock();
    }

    private prefersReducedMotion(): boolean {
        return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    private pickName(exclude = ''): string {
        let next = generateRandomName();
        for (let tries = 0; tries < 8 && next === exclude; tries += 1) next = generateRandomName();
        return next;
    }

    private restartAnimation(el: HTMLElement | null, className: string): void {
        if (!el) return;
        el.classList.remove(className);
        void el.offsetWidth;
        el.classList.add(className);
    }

    private showName(name: string, shuffle = false): void {
        const namePlate = document.getElementById('player-name');
        if (!namePlate) return;
        namePlate.textContent = name;
        if (shuffle) this.restartAnimation(namePlate, 'shuffling');
    }

    private clearNameRoll(): void {
        if (this.nameRollTimer) {
            clearTimeout(this.nameRollTimer);
            this.nameRollTimer = null;
        }
        document.getElementById('player-name')?.classList.remove('shuffling');
        document.getElementById('reroll-name-btn')?.classList.remove('rolling');
    }

    private rollName(animate = false): void {
        this.clearNameRoll();
        this.assignedName = this.pickName(this.assignedName);
        if (!animate || this.prefersReducedMotion()) {
            this.showName(this.assignedName);
            return;
        }

        const dice = document.getElementById('reroll-name-btn');
        this.restartAnimation(dice, 'rolling');
        const flashes = 4;
        const tick = (step: number) => {
            if (this.disposed) return;
            if (step >= flashes) {
                this.showName(this.assignedName, true);
                this.nameRollTimer = setTimeout(() => {
                    this.nameRollTimer = null;
                    document.getElementById('player-name')?.classList.remove('shuffling');
                    dice?.classList.remove('rolling');
                }, 180);
                return;
            }
            this.showName(this.pickName(this.assignedName), true);
            this.nameRollTimer = setTimeout(() => tick(step + 1), 55);
        };
        tick(0);
    }

    private focusTitleControls(): void {
        if (this.transport.state !== 'idle' && this.transport.state !== 'disconnected') return;
        const enter = document.getElementById('enter-city-btn') as HTMLButtonElement | null;
        enter?.focus({ preventScroll: true });
    }

    private bindInput(): void {
        const options = { signal: this.events.signal };
        const enter = document.getElementById('enter-city-btn') as HTMLButtonElement;
        const reroll = document.getElementById('reroll-name-btn') as HTMLButtonElement;
        this.stage.renderer.domElement.tabIndex = -1;
        enter.disabled = false;
        enter.addEventListener('click', event => {
            event.stopPropagation();
            this.enterCity();
        }, options);
        reroll.addEventListener('click', event => {
            event.stopPropagation();
            this.rollName(true);
        }, options);
        document.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.code !== 'Enter') return;
            if (this.transport.state !== 'idle' && this.transport.state !== 'disconnected') return;
            event.preventDefault();
            this.enterCity();
        }, options);
        window.addEventListener('focus', () => this.focusTitleControls(), options);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.focusTitleControls();
        }, options);
        document.addEventListener('click', () => {
            if (this.transport.state === 'playing') this.requestPointerLock();
            void this.music.unlock();
        }, options);
        document.addEventListener('mousemove', event => {
            if (this.transport.state === 'playing' && document.pointerLockElement === this.stage.renderer.domElement) {
                this.rat?.onMouseMove(event.movementX, event.movementY);
            }
        }, options);
        document.addEventListener('mousedown', event => {
            if (event.button !== 0 || this.transport.state !== 'playing' || !this.rat || this.rat.entity.dead || this.rat.entity.hp <= 0) return;
            if (document.pointerLockElement !== this.stage.renderer.domElement) return;
            this.stage.camera.getWorldDirection(this.direction);
            const target = this.stage.camera.position.clone().addScaledVector(this.direction, 200);
            this.shotsAttempted++;
            const shot = this.gun.shoot(this.rat.entity, target);
            if (shot) {
                if(this.transport.send({ type: 'shoot', ...shot })){
                    this.shotsSent++;
                    if(this.gun.authoritative)this.gun.predictShot(this.rat.entity,shot);
                }
            }
        }, options);
        window.addEventListener('resize', () => {
            const { camera, renderer } = this.stage;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }, options);
        window.addEventListener('pagehide', () => this.dispose(), options);
    }

    private requestPointerLock(): void {
        if (document.pointerLockElement === this.stage.renderer.domElement) return;
        try {
            const result = this.stage.renderer.domElement.requestPointerLock();
            result?.catch(() => { /* Keep the game usable when pointer lock is unavailable. */ });
        } catch { /* A later click retries pointer lock. */ }
    }

    private welcome(message: Extract<ServerMessage, { type: 'welcome' }>): void {
        this.serverOffset = message.serverTime - Date.now();
        this.bots?.dispose();this.bots=null;
        this.chaos?.dispose();this.chaos=null;
        this.gun.clearProjectiles();
        this.remotes.clear();
        this.rat?.dispose();
        this.rat = null;
        if (message.world.seed !== this.worldSpec.seed || message.world.version !== this.worldSpec.version) {
            this.city.dispose();
            this.worldSpec = message.world;
            this.city = this.worldSpec.version===GRAYBOX_VERSION ? new Neighborhood(this.stage.scene,this.stage.world,this.worldSpec) : new CityGenerator(this.stage.scene, this.stage.world, DEFAULT_CITY_OPTIONS, this.worldSpec);
            this.city.generate();
        }
        this.myId = message.id;
        const player = message.player;
        this.rat = new RatController(this.stage.scene, this.stage.world, this.stage.camera, player.name, player,
            new THREE.Vector3(player.x, player.y, player.z),this.worldSpec.version===GRAYBOX_VERSION?CITY_BOUNDS:undefined);
        this.rat.entity.isPlayer = true;
        this.rat.entity.applySnapshot(player);
        this.gun.setPlayer(this.stage.camera, this.rat.entity);
        this.remotes.snapshot(message.players, this.myId);
        this.gun.authoritative=this.worldSpec.version===GRAYBOX_VERSION;
        if(this.gun.authoritative)this.chaos=new ChaosView(this.stage.scene,id=>id===this.myId?this.rat?.entity:this.remotes.get(id),this.stage.listener.context as AudioContext);
        this.hud.setScores(Object.values(message.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name)), this.myId);
        this.hud.hideRespawn();
        this.hud.hideVictory();
        if (player.hp <= 0 && player.respawnAt) this.hud.showRespawn(player.respawnAt - this.serverOffset);
        if (message.round.phase === 'won') this.hud.showVictory(message.round.winnerName ?? '', message.round.kills ?? 0);
        this.lastMovement = '';
        this.lastMovementAt = 0;
        if(normalGameBotCount(window.location) && this.worldSpec.version===GRAYBOX_VERSION){
            this.bots=new NormalGameBots(this.worldSpec,message.players,{muzzle:(id,position,facing)=>{
                const entity=this.remotes.get(id);
                return entity?muzzleAtPose(entity.mesh,position,facing):undefined;
            }});
            if(message.round.phase==='won')this.bots.receive({type:'gameWon',winnerId:message.round.winnerId??'',winnerName:message.round.winnerName??'',kills:message.round.kills??0,resetAt:message.round.resetAt??0});
        }
    }

    private receive(message: ServerMessage): void {
        if(message.type==='chaos'){this.diagnosticChaos={receivedAt:Date.now(),serverTime:message.state.time,shots:message.state.shots.length};}

        this.bots?.receive(message);
        switch (message.type) {
            case 'chaos':
                this.gun.reconcilePredictedShots(message.state.shots);
                this.rat?.applyPressureLaunches(message.state,this.myId);this.chaos?.apply(message.state);break;
            case 'welcome': this.welcome(message); break;
            case 'currentPlayers': break; // Atomic welcome already applied the complete state.
            case 'playerJoined': if (message.player.id !== this.myId) this.remotes.add(message.player); break;
            case 'playerMoved': this.remotes.move(message.player, message.at); break;
            case 'playerCorrected': {
                const pose = message.player;
                if (pose.id === this.myId && this.rat) {
                    const body = this.rat.entity.body;
                    body.position.set(pose.x, pose.y, pose.z);
                    body.velocity.set(0, 0, 0);
                    body.aabbNeedsUpdate = true;
                    this.input.clear();
                    this.rat.syncAfterPhysics(0);
                    this.rat.resetGrounding();
                    this.lastMovement = '';
                } else this.remotes.move(pose, message.at);
                break;
            }
            case 'playerShot': {
                const owner = this.remotes.get(message.shooterId);
                if (owner) this.gun.replayShot(owner, message);
                break;
            }
            case 'playerDamaged': {
                const entity = message.id === this.myId ? this.rat?.entity : this.remotes.get(message.id);
                if (entity && !entity.dead) {
                    if (message.hp === 0) {
                        // Apply health immediately; the ordered playerDied event supplies
                        // the killer direction and owns the single death transition.
                        entity.hp = 0;
                        entity.billboard.setHealth(0);
                    } else if (message.hp < entity.hp) {
                        entity.takeDamage(entity.hp - message.hp, new THREE.Vector3());
                    }
                }
                break;
            }
            case 'playerDied': {
                const entity = message.victimId === this.myId ? this.rat?.entity : this.remotes.get(message.victimId);
                const killer = message.killerId === this.myId ? this.rat?.entity : this.remotes.get(message.killerId);
                if (entity && !entity.dead) {
                    if(message.incident){entity.useSharedCorpse();}
                    else {
                    const impact = message.incoming?new THREE.Vector3(message.incoming.x,message.incoming.y,message.incoming.z):killer ? entity.mesh.position.clone().sub(killer.mesh.position) : new THREE.Vector3(0, 0, 1);
                    if(!message.incoming)impact.y = 0;
                    entity.takeDamage(entity.hp, impact.normalize().multiplyScalar(50));
                    }
                }
                if (message.victimId === this.myId) this.hud.showRespawn(message.respawnAt - this.serverOffset);
                this.hud.addKillFeed(`${message.killerName} eliminated ${message.victimName}`);
                break;
            }
            case 'playerRespawn':
                if (message.id === this.myId) { this.rat?.entity.respawn(message); this.rat?.resetGrounding(); this.input.clear(); this.hud.hideRespawn(); }
                else this.remotes.respawn(message.id, message);
                break;
            case 'playerLeft': this.remotes.remove(message.id); break;
            case 'scoreboardUpdate': this.hud.setScores(message.scores, this.myId); break;
            case 'gameWon': this.hud.showVictory(message.winnerName, message.kills); break;
            case 'gameReset': this.gun.clearProjectiles(); this.hud.hideVictory(); this.hud.hideRespawn(); break;
            case 'error': this.hud.setConnection('notice', message.message); break;
            case 'pong': break;
        }
    }

    private sendMovement(now: number): void {
        if (!this.rat || this.rat.entity.dead || this.rat.entity.hp <= 0 || now - this.lastMovementAt < 50) return;
        const { position: p, quaternion: q } = this.rat.entity.body;
        const mq = this.rat.entity.mesh.quaternion;
        const message: ClientMessage = { type: 'updateMovement', position: { x: p.x, y: p.y, z: p.z },
            rotation: { x: q.x, y: q.y, z: q.z, w: q.w }, meshRotation: { x: mq.x, y: mq.y, z: mq.z, w: mq.w } };
        const serialized = JSON.stringify(message);
        if (serialized === this.lastMovement && now - this.lastMovementAt < 1_000) return;
        if (this.transport.send(message)) { this.lastMovement = serialized; this.lastMovementAt = now; }
    }

    private animate(now: number): void {
        if (this.disposed) return;
        const frameMs = this.previousTime ? now - this.previousTime : 0;
        const dt = this.previousTime ? Math.min((now - this.previousTime) / 1000, 0.05) : 1 / 60;
        this.previousTime = now;
        const { scene, camera, renderer, world, flashlight } = this.stage;
        const measure=!!this.stats,start=measure?performance.now():0;let botsMs=0;
        if (this.transport.state === 'playing') {
            this.remotes.prepareFrame();
            this.simulation.advance(dt, step => {
                this.remotes.updateDeaths(step);
                this.rat?.prepareMovement(step, this.input.keys);
                world.step(step);
                this.rat?.syncAfterPhysics(step);
                this.gun.update(step);
                if(this.rat)this.bots?.updateHuman(this.myId,this.rat.entity.body.position,this.rat.entity.hp);
                const botStart=measure?performance.now():0;
                this.bots?.step(step,Date.now());
                if(measure)botsMs+=performance.now()-botStart;
            });
            this.remotes.presentFrame();
            this.rat?.updateView();
            this.sendMovement(now);
            if (this.rat) {
                const position = this.rat.entity.mesh.position;
                camera.getWorldDirection(this.direction);
                flashlight.position.set(position.x, position.y + 2, position.z);
                flashlight.target.position.copy(position).addScaledVector(this.direction, 15);
            }
        }
        const simulationEnd=measure?performance.now():0;
        this.chaos?.update(dt,camera);
        this.city.update(dt, camera);
        const presentationEnd=measure?performance.now():0;
        renderer.render(scene, camera);
        this.stats?.record(frameMs, now, this.worldSpec,{simulationMs:simulationEnd-start,botsMs,presentationMs:presentationEnd-simulationEnd,renderMs:performance.now()-presentationEnd},{network:this.transport.getDiagnostics(),shotsAttempted:this.shotsAttempted,shotsSent:this.shotsSent,chaos:this.diagnosticChaos,snapshotAgeMs:this.diagnosticChaos.receivedAt?Date.now()-this.diagnosticChaos.receivedAt:null,projectiles:{...this.chaos?.getDiagnostics(),predictedBalls:this.gun.predictedBallCount}});
        this.frame = requestAnimationFrame(time => this.animate(time));
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clearNameRoll();
        cancelAnimationFrame(this.frame);
        this.events.abort();
        this.input.dispose();
        this.bots?.dispose();this.bots=null;
        this.transport.destroy();
        this.hud.dispose();
        this.chaos?.dispose();
        this.gun.dispose();
        this.rat?.dispose();
        this.rat = null;
        this.remotes.dispose();
        this.city.dispose();
        this.music.dispose();
        disposeEntitySounds();
        this.stats?.dispose();
        this.stage.dispose();
    }
}
