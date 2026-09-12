import {FoleyAudio} from '../audio/FoleyAudio';
import { unlockEffectsAudio } from '../audio/effectsAudio';
import {FoleyWorld} from '../audio/FoleyWorld';
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
import type { ClientMessage, ServerMessage } from '../shared/networkProtocol';
import { NetworkManager } from '../network/NetworkManager';
import { GameHud } from '../ui/GameHud';
import { TitleScreen } from '../ui/TitleScreen';
import { MunicipalQuips } from '../ui/municipalQuips';
import { createStage } from './createStage';
import { RemotePlayers } from './RemotePlayers';
import { InputState } from './InputState';
import { SessionMusic } from './SessionMusic';
import { PerformanceStats } from './PerformanceStats';
import { SimulationClock } from './SimulationClock';
import { NormalGameBots, normalGameBotCount } from './NormalGameBots';
import { muzzleAtPose } from '../utils/muzzlePose';
import { incidentInfo } from '../shared/incidentCatalog';
import type { ChaosState } from '../shared/chaosState';
import { PICKUP_COPY, PICKUP_TUNING } from '../shared/pickups';
import type { RatEntity } from '../entities/RatEntity';
import { bindGamePointerLock } from './GamePointerLock';
import { FeedbackAudio } from '../audio/FeedbackAudio';
import { MatchScoreboard } from '../ui/MatchScoreboard';
import { bindScoreboardHold } from './ScoreboardHold';
import {TouchControls, touchControlsAvailable} from '../ui/TouchControls';

/** One owner for the complete local game lifetime, including reconnect reconciliation. */
export class GameSession {
    private readonly stage;
    private readonly transport: NetworkManager;
    private readonly title: TitleScreen;
    private readonly hud = new GameHud(document, () => this.transport.retry(), cue => this.feedback?.play(cue),(...args)=>this.foley?.play(...args));
    private readonly deathQuips = new MunicipalQuips();
    private readonly scoreboard = new MatchScoreboard();
    private readonly input = new InputState();
    private readonly events = new AbortController();
    private readonly gun;
    private readonly remotes;
    private readonly music;
    private readonly feedback: FeedbackAudio;
    private readonly foley:FoleyAudio;
    private foleyWorld!:FoleyWorld;
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
    private lastMovement: number[] = [];
    private readonly simulation = new SimulationClock();
    private readonly direction = new THREE.Vector3();
    private touch?: TouchControls;
    private roundWon = false;
    private releasePreparedModels?:()=>void;

    constructor(renderer: THREE.WebGLRenderer, initialWorld?: WorldSpec, prepared: {
        title?: TitleScreen; transport?: NetworkManager; music?: Pick<SessionMusic, 'start' | 'unlock' | 'dispose'>;
        stage?: ReturnType<typeof createStage>; city?: CityGenerator | Neighborhood;
        releasePreparedModels?:()=>void;
    } = {}) {
        this.transport = prepared.transport ?? new NetworkManager();
        this.title = prepared.title ?? new TitleScreen();
        this.stage = prepared.stage ?? createStage(renderer);
        this.releasePreparedModels=prepared.releasePreparedModels;
        const diagnostics=new URLSearchParams(window.location.search).get('diagnostics');
        const showDiagnostics=diagnostics!==null && diagnostics!=='quiet';
        this.stats = diagnostics!==null || normalGameBotCount(window.location) ? new PerformanceStats(renderer,showDiagnostics,report=>{
            if(['localhost','127.0.0.1','[::1]'].includes(window.location.hostname)&&this.transport.state==='playing')this.transport.send({type:'diagnostics',report});
        }) : null;
        const { scene, world, listener } = this.stage;
        initEntitySounds(listener);
        this.music = prepared.music ?? new SessionMusic(listener);
        this.music.start();
        this.feedback = new FeedbackAudio(listener);
        this.foley=new FoleyAudio(listener);
        this.foley.setEnabled(false);
        this.gun = new CheeseGun(scene, world, listener);
        this.remotes = new RemotePlayers(scene, world);
        this.worldSpec = initialWorld ? { ...initialWorld } : createWorldSpec(1);
        if(!initialWorld && new URLSearchParams(window.location.search).get('room')?.startsWith('graybox-')) this.worldSpec.version=GRAYBOX_VERSION;
        this.city = prepared.city ?? (this.worldSpec.version===GRAYBOX_VERSION ? new Neighborhood(scene,world,this.worldSpec) : new CityGenerator(scene, world, DEFAULT_CITY_OPTIONS, this.worldSpec));
        if (!prepared.city) this.city.generate();
        this.foleyWorld?.dispose();this.foleyWorld=new FoleyWorld(this.foley,this.stage.scene);
        this.transport.onMessage = message => this.receive(message);
        this.transport.onState = (state, message) => {
            this.clearInput();
            this.foleyWorld.setEnabled(state==='playing'&&!document.hidden);
            this.simulation.reset();
            this.hud.setConnection(state, message);
            this.scoreboard.setAvailable(state === 'playing');
            this.touch?.setPlaying(state === 'playing');
            if (state === 'playing') this.hud.enterPlaying();
        };
        this.gun.onHitEntity = (victim, damage) => {
            const victimId = this.remotes.idFor(victim);
            if (victimId && this.transport.state === 'playing') this.transport.send({ type: 'hit', victimId, damage });
        };
        this.bindInput();
        this.title.focus();
        this.frame = requestAnimationFrame(time => this.animate(time));
    }

    enterCity(): void {
        if (this.transport.state !== 'idle' && this.transport.state !== 'disconnected') return;
        this.transport.connect(this.title.name, generateRandomAppearance());
        this.title.onGesture();
        this.requestPointerLock();
    }

    private pointerLock!: ReturnType<typeof bindGamePointerLock>;
    private bindInput(): void {
        const options = { signal: this.events.signal };
        const credits = this.title.credits;
        this.stage.renderer.domElement.tabIndex = -1;
        this.title.available = () => ['idle', 'disconnected'].includes(this.transport.state);
        this.title.onEnter = () => this.enterCity();
        this.title.onGesture = () => {
            this.transport.prepare();
            void this.music.unlock();
            unlockEffectsAudio();
        };
        this.title.onCue = cue => { this.foley.setEnabled(!document.hidden); this.foley.play(cue); };
        if (touchControlsAvailable()) this.touch = new TouchControls({canvas:this.stage.renderer.domElement,
            look:(dx,dy)=>this.rat?.onMouseMove(dx,dy),shoot:()=>this.shoot(),
            scores:visible=>this.scoreboard.setVisible(visible),clearKeys:()=>this.input.clear()});
        this.pointerLock=bindGamePointerLock({canvas:this.stage.renderer.domElement,
            playing:()=>this.transport.state==='playing',enabled:()=>!this.touch?.active,signal:this.events.signal,
            allowUnlockedClick:credits.allowUnlockedClick,
            record:(type,detail)=>this.stats?.event(type,detail)});
        bindScoreboardHold({available:()=>this.transport.state==='playing',
            show:visible=>this.scoreboard.setVisible(visible),scroll:(dy,dx)=>this.scoreboard.scroll(dy,dx),signal:this.events.signal});
        document.addEventListener('visibilitychange', () => {
            this.foleyWorld.setEnabled(!document.hidden&&this.transport.state==='playing');
        }, options);
        document.addEventListener('mousemove', event => {
            if (!this.touch?.active && this.transport.state === 'playing' && document.pointerLockElement === this.stage.renderer.domElement) {
                this.rat?.onMouseMove(event.movementX, event.movementY);
            }
        }, options);
        document.addEventListener('mousedown', event => {
            if (this.touch?.active || event.button !== 0 || document.pointerLockElement !== this.stage.renderer.domElement) return;
            this.shoot();
        }, options);
        window.addEventListener('resize', () => {
            const { camera, renderer } = this.stage;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }, options);
        window.addEventListener('pagehide', () => this.dispose(), options);
    }

    private clearInput(): void { this.input.clear(); this.touch?.clear(); }

    /** Both input devices use the real camera ray, animated muzzle and transport. */
    private shoot(): void {
        if (this.transport.state !== 'playing' || this.roundWon || !this.rat || this.rat.entity.dead || this.rat.entity.hp <= 0) return;
        this.rat.updateView();
        this.stage.camera.getWorldDirection(this.direction);
        const target = this.stage.camera.position.clone().addScaledVector(this.direction, 200);
        this.shotsAttempted++;
        const shot = this.gun.shoot(this.rat.entity, target);
        if (shot && this.transport.send({type:'shoot', ...shot})) {
            this.shotsSent++;this.chaos?.fire(shot);
        }
    }
    private requestPointerLock(): void { if (!this.touch?.active) this.pointerLock.request(); }

    private welcome(message: Extract<ServerMessage, { type: 'welcome' }>): void {
        this.clearInput(); this.touch?.showScores(false); this.roundWon = message.round.phase === 'won';
        this.serverOffset = message.serverTime - Date.now();
        this.foleyWorld.reset();
        this.bots?.dispose();this.bots=null;
        this.chaos?.dispose();this.chaos=null;
        this.gun.clearProjectiles();
        this.remotes.clear();
        this.gun.setIncident();
        this.rat?.dispose();
        this.rat = null;
        if (message.world.seed !== this.worldSpec.seed || message.world.version !== this.worldSpec.version) {
            this.city.dispose();
            this.worldSpec = message.world;
            this.city = this.worldSpec.version===GRAYBOX_VERSION ? new Neighborhood(this.stage.scene,this.stage.world,this.worldSpec) : new CityGenerator(this.stage.scene, this.stage.world, DEFAULT_CITY_OPTIONS, this.worldSpec);
            this.city.generate();
            this.foleyWorld?.dispose();this.foleyWorld=new FoleyWorld(this.foley,this.stage.scene);
        }
        this.myId = message.id;
        this.gun.setProtectedRats(new Set());
        const player = message.player;
        this.rat = new RatController(this.stage.scene, this.stage.world, this.stage.camera, player.name, player,
            new THREE.Vector3(player.x, player.y, player.z),this.worldSpec.version===GRAYBOX_VERSION?CITY_BOUNDS:undefined);
        this.rat.entity.isPlayer = true;
        this.rat.entity.applySnapshot(player);
        this.gun.setPlayer(this.stage.camera, this.rat.entity);
        this.remotes.snapshot(message.players, this.myId);
        this.gun.authoritative=this.worldSpec.version===GRAYBOX_VERSION;
        if(this.gun.authoritative)this.chaos=new ChaosView(this.stage.scene,id=>id===this.myId?this.rat?.entity:this.remotes.get(id),this.stage.listener.context as AudioContext,true,(cue,origin)=>this.feedback.play(cue,origin),this.foleyWorld,this.gun.tracePresentation);
        this.chaos?.setScores(Object.values(message.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name)), this.myId);
        this.chaos?.setIncidentRoster(message.incidents);
        this.hud.hideRespawn();
        this.hud.hideVictory();
        if (player.hp <= 0 && player.respawnAt) this.hud.showRespawn(player.respawnAt - this.serverOffset);
        if (message.round.phase === 'won') {this.hud.hideRespawn();this.hud.showVictory(message.round.winnerName ?? '', message.round.kills ?? 0,message.round.assignment);}
        this.lastMovement = [];
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
        this.scoreboard.receive(message);
        if(message.type==='chaos'){this.diagnosticChaos={receivedAt:Date.now(),serverTime:message.state.time,shots:message.state.shots.length};}

        this.bots?.receive(message);
        switch (message.type) {
            case 'chaos':
                this.gun.setIncident(message.state.dispatch.phase==='active'?incidentInfo(message.state.dispatch.incident).id:undefined);
                this.applyPickupState(message.state);
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
                    this.clearInput();
                    this.rat.syncAfterPhysics(0);
                    this.rat.resetGrounding();
                    this.lastMovement = [];
                } else this.remotes.move(pose, message.at);
                break;
            }
            case 'playerShot': {
                if(message.shooterId===this.myId){this.chaos?.launch(message);break;}
                const owner = this.remotes.get(message.shooterId);
                if (owner) this.gun.replayShot(owner, message);
                break;
            }
            case 'playerDamaged': {
                if(message.attackerId===this.myId && message.id!==this.myId){this.hud.showHitMarker();this.foley.play('hit-confirm');}
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
            case 'playerHealed': {
                const entity = message.id === this.myId ? this.rat?.entity : this.remotes.get(message.id);
                entity?.heal(message.hp);
                if (message.id === this.myId) this.chaos?.toast(PICKUP_COPY['quick-fix'].title, PICKUP_COPY['quick-fix'].effect);
                break;
            }
            case 'playerDied': {
                const entity = message.victimId === this.myId ? this.rat?.entity : this.remotes.get(message.victimId);
                const killer = message.killerId === null ? undefined : message.killerId === this.myId ? this.rat?.entity : this.remotes.get(message.killerId);
                if (entity && !entity.dead) {
                    if(message.incident){entity.useSharedCorpse();}
                    else {
                    const impact = message.incoming?new THREE.Vector3(message.incoming.x,message.incoming.y,message.incoming.z):killer ? entity.mesh.position.clone().sub(killer.mesh.position) : new THREE.Vector3(0, 0, 1);
                    if(!message.incoming)impact.y = 0;
                    entity.takeDamage(entity.hp, impact.normalize().multiplyScalar(50));
                    }
                }
                if (message.victimId === this.myId) {
                    this.clearInput();
                    this.stats?.event('death',{respawnAt:message.respawnAt-this.serverOffset,incident:message.incident});
                    this.hud.showRespawn(message.respawnAt - this.serverOffset);
                }
                this.hud.addKillFeed(message.cause==='evidence-tampering'
                    ? this.deathQuips.caseDeath(message.victimName)
                    : `${message.killerName} eliminated ${message.victimName}`);
                break;
            }
            case 'playerRespawn':
                if (message.id === this.myId && this.rat) this.rat.setSpeedScale(1);
                if (message.id === this.myId) {
                    this.stats?.event('respawn'); this.rat?.entity.respawn(message); this.rat?.resetGrounding(); this.clearInput(); this.hud.hideRespawn();
                } else this.remotes.respawn(message.id, message);
                break;
            case 'playerLeft': this.remotes.remove(message.id); break;
            case 'scoreboardUpdate': this.chaos?.setScores(message.scores, this.myId); break;
            case 'gameWon': this.roundWon=true;this.clearInput();this.hud.hideRespawn();this.hud.showVictory(message.winnerName, message.kills,message.assignment); break;
            case 'gameReset': this.roundWon=false;this.rat?.entity.setPowerups(0,0);for(const {entity} of this.remotes.rats.values())entity.setPowerups(0,0);this.rat?.setSpeedScale(1);this.gun.setProtectedRats(new Set());this.clearInput();this.foleyWorld.reset();this.gun.clearProjectiles();this.chaos?.resetProjectiles(); this.hud.hideVictory(); this.hud.hideRespawn(); break;
            case 'error': this.hud.setConnection('notice', message.message); break;
            case 'pong': break;
        }
    }

    /** Mirror the authoritative buff snapshot onto local prediction and movement.
     * The server remains the sole source of truth for both. */
    private applyPickupState(state: ChaosState): void {
        const protectedRats = new Set<RatEntity>();
        const apply=(id:string,entity:RatEntity)=>{
            const buff=state.buffs?.[id];
            const ironclad=Math.max(0,((buff?.ironcladUntil??0)-state.time)/1000);
            const hustle=Math.max(0,((buff?.hustleUntil??0)-state.time)/1000);
            entity.setPowerups(ironclad,hustle);
            if(ironclad>0&&!entity.dead)protectedRats.add(entity);
        };
        if(this.rat)apply(this.myId,this.rat.entity);
        for(const [id,{entity}] of this.remotes.rats)apply(id,entity);
        this.gun.setProtectedRats(protectedRats);
        const hustle = (state.buffs?.[this.myId]?.hustleUntil ?? 0) > state.time;
        this.rat?.setSpeedScale(hustle ? PICKUP_TUNING.hustleMultiplier : 1);
    }

    private sendMovement(now: number): void {
        if (!this.rat || this.rat.entity.dead || this.rat.entity.hp <= 0 || now - this.lastMovementAt < 50) return;
        const { position: p, quaternion: q } = this.rat.entity.body;
        const mq = this.rat.entity.mesh.quaternion;
        const pose=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,mq.x,mq.y,mq.z,mq.w];
        if (pose.every((value,i)=>value===this.lastMovement[i]) && now-this.lastMovementAt<1_000) return;
        const message: ClientMessage = { type: 'updateMovement', position: { x: p.x, y: p.y, z: p.z },
            rotation: { x: q.x, y: q.y, z: q.z, w: q.w }, meshRotation: { x: mq.x, y: mq.y, z: mq.z, w: mq.w } };
        if (this.transport.send(message)) { this.lastMovement = pose; this.lastMovementAt = now; }
    }

    private animate(now: number): void {
        if (this.disposed) return;
        // The prepared title backdrop is static; do not spend phone frame time
        // drawing the whole city while somebody is choosing a name.
        if(!this.rat && this.transport.state==='idle'){
            this.previousTime=now;
            this.frame=requestAnimationFrame(time=>this.animate(time));return;
        }
        const frameMs = this.previousTime ? now - this.previousTime : 0;
        const dt = this.previousTime ? Math.min((now - this.previousTime) / 1000, 0.05) : 1 / 60;
        this.previousTime = now;
        const { scene, camera, renderer, world, flashlight } = this.stage;
        const measure=!!this.stats,start=measure?performance.now():0;let botsMs=0;
        if (this.transport.state === 'playing') {
            this.remotes.prepareFrame();
            this.simulation.advance(dt, step => {
                this.remotes.updateDeaths(step);
                this.rat?.prepareMovement(step, this.input.keys, this.touch?.active ? this.touch.input.movement : undefined);
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
            this.touch?.update(now, !!this.rat && !this.rat.entity.dead && this.rat.entity.hp > 0 && !this.roundWon);
            this.sendMovement(now);
            if (this.rat) {
                const position = this.rat.entity.mesh.position;
                camera.getWorldDirection(this.direction);
                flashlight.position.set(position.x, position.y + 2, position.z);
                flashlight.target.position.copy(position).addScaledVector(this.direction, 15);
            }
        }
        const simulationEnd=measure?performance.now():0;
        this.foleyWorld.listener(camera);
        if(this.transport.state==='playing'&&!document.hidden){
            if(this.rat&&!this.rat.entity.dead)this.foleyWorld.motion.update(this.rat.entity.mesh.position,dt,this.rat.grounded);
            else this.foleyWorld.motion.clear();
        }
        this.chaos?.update(dt,camera);
        this.city.update(dt, camera, this.rat?.entity.body.position);
        const presentationEnd=measure?performance.now():0;
        renderer.render(scene, camera);
        if(this.rat && this.transport.state==='playing' && this.releasePreparedModels){
            this.releasePreparedModels();this.releasePreparedModels=undefined;
            performance.mark('city-first-play-frame');
        }
        this.chaos?.renderOutline(renderer,camera);
        this.stats?.record(frameMs, now, this.worldSpec,{simulationMs:simulationEnd-start,botsMs,presentationMs:presentationEnd-simulationEnd,renderMs:performance.now()-presentationEnd},{network:this.transport.getDiagnostics(),shotsAttempted:this.shotsAttempted,shotsSent:this.shotsSent,chaos:this.diagnosticChaos,snapshotAgeMs:this.diagnosticChaos.receivedAt?Date.now()-this.diagnosticChaos.receivedAt:null,projectiles:this.chaos?.getDiagnostics()});
        this.frame = requestAnimationFrame(time => this.animate(time));
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.title.dispose();
        this.releasePreparedModels?.();this.releasePreparedModels=undefined;
        cancelAnimationFrame(this.frame);
        this.events.abort();
        this.touch?.dispose();
        this.input.dispose();
        this.bots?.dispose();this.bots=null;
        this.transport.destroy();
        this.hud.dispose();
        this.scoreboard.dispose();
        this.chaos?.dispose();
        this.gun.dispose();
        this.rat?.dispose();
        this.rat = null;
        this.remotes.dispose();
        this.city.dispose();
        this.music.dispose();
        this.feedback.dispose();
        this.foleyWorld.dispose();this.foley.dispose();
        disposeEntitySounds();
        this.stats?.dispose();
        this.stage.dispose();
    }
}
