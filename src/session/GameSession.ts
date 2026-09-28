import { SURGE } from '../shared/launcherVelocity';
import { actionBound, lookDelta } from '../settings/PlayerPreferences';
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
import { MAX_HP, type ClientMessage, type MovementInput, type ServerMessage } from '../shared/networkProtocol';
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
import { LAUNCH_MACHINES, PRESSURE_TUNING, type ChaosState, type LaunchMachine } from '../shared/chaosState';
import { PICKUP_TUNING } from '../shared/pickups';
import type { RatEntity } from '../entities/RatEntity';
import { bindGamePointerLock } from './GamePointerLock';
import { FeedbackAudio } from '../audio/FeedbackAudio';
import { MatchScoreboard } from '../ui/MatchScoreboard';
import { bindScoreboardHold } from './ScoreboardHold';
import {TouchControls, touchControlsAvailable} from '../ui/TouchControls';
import {NetplayAuditLog} from '../shared/netplay';
import {createShotId} from '../weapons/shotId';
import type {CameoView,CameoVisitor} from '../cameos/CameoView';
import {loadCameos} from '../cameos/loadCameos';
import {HighlightBridge} from '../highlights/HighlightBridge';
import {FeelDirector} from '../feel/FeelDirector';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';
import {entryRequested} from './yieldToPage';
import {PoliceLineup,type LineupEntry} from '../feel/PoliceLineup';

/** Reused per-frame scratch for polish-17 audio (one live session at a time). */
const FOOTSTEP_SOURCES:{id:string;position:THREE.Vector3;grounded?:boolean}[]=[];
const HEAD_POSITION=new THREE.Vector3();
const LANDING_POSITION=new THREE.Vector3();
const HEADSHOT_NORMAL=new THREE.Vector3();
/** Longest a welcome waits for off-thread shader links before drawing anyway. */
const WELCOME_COMPILE_MS=1500;
/** Fill slot `n` of the reused footstep list in place; returns the next slot. */
function pooledSource(n:number,id:string,position:THREE.Vector3,grounded?:boolean):number {
    const source=FOOTSTEP_SOURCES[n]??={id,position,grounded};
    source.id=id;source.position=position;source.grounded=grounded;
    return n+1;
}

/** One owner for the complete local game lifetime, including reconnect reconciliation. */
/** Round end (seconds after the slow-motion finish): the CASE CLOSED card, then the lineup's photos. */
const ROUND_END={card:2.6,lineup:6.6};

export class GameSession {
    private readonly stage;
    private readonly transport: NetworkManager;
    private readonly title: TitleScreen;
    private readonly hud = new GameHud(document, () => this.transport.retry(), cue => this.feedback?.play(cue),(...args)=>this.foley?.play(...args));
    private readonly deathQuips = new MunicipalQuips();
    private readonly scoreboard = new MatchScoreboard();
    private readonly input = new InputState(window,document,()=>!this.title?.settings?.isOpen && this.transport?.state==='playing' && (this.touch?.active || document.pointerLockElement===this.stage?.renderer.domElement));
    private readonly events = new AbortController();
    private readonly gun;
    private readonly remotes;
    private readonly music;
    private readonly feedback: FeedbackAudio;
    private readonly foley:FoleyAudio;
    private foleyWorld!:FoleyWorld;
    private readonly stats: PerformanceStats | null;
    private diagnosticChaos:{receivedAt:number;serverTime:number;shots:number;tick:number;epoch:string}={receivedAt:0,serverTime:0,shots:0,tick:0,epoch:''};
    private shotsAttempted=0;
    private shotsSent=0;
    private chaos:ChaosView|null=null;
    private cameos?:CameoView;
    private cameoLoading=false;
    private bots:NormalGameBots|null=null;
    private city: CityGenerator | Neighborhood;
    private worldSpec: WorldSpec;
    private rat: RatController | null = null;
    private myId = '';
    private observing = false;
    private frame = 0;
    private previousTime = 0;
    private disposed = false;
    private serverOffset = 0;
    private lastMovementAt = 0;
    private lastMovement: number[] = [];
    private movementSequence=0;
    private readonly lastInteractionPosition=new THREE.Vector3();
    private readonly pendingInteractions=new Map<string,number>();
    private readonly netplay=new NetplayAuditLog();
    private readonly simulation = new SimulationClock();
    private readonly direction = new THREE.Vector3();
    private touch?: TouchControls;
    private roundWon = false;
    private releasePreparedModels?:()=>void;
    private readonly highlights = new HighlightBridge();
    private readonly feel = new FeelDirector();
    /** The stage's own exposure; Blackout scales it. */
    private baseExposure = 1;
    private compiling?:Promise<unknown>;
    private compileTimer?:ReturnType<typeof setTimeout>;
    private readonly lineup?:PoliceLineup;
    private pendingLineup?:{entries:LineupEntry[];at:number};
    /** Round end, last beat: when the Case File and final standings take over. */
    private pendingResults?:number;
    private resultsShown=false;
    private pendingVictory?:{message:Extract<ServerMessage,{type:'gameWon'}>;at:number};
    private lastHighlightObserve = 0;
    private lastChaos: ChaosState | null = null;
    private localLaunchY = 0;
    private localLaunchAt = 0;
    private highlightBaseline = true;
    private seenHighlightLaunches = new Set<string>();
    /** Launch events already given their scream and view kick (L5/L6). */
    private readonly feltLaunches = new Set<string>();
    private highlightCorpseSeen = new Map<string, number>();
    private readonly highlightFrustum = new THREE.Frustum();
    private readonly highlightMatrix = new THREE.Matrix4();

    constructor(renderer: THREE.WebGLRenderer, initialWorld?: WorldSpec, prepared: {
        title?: TitleScreen; transport?: NetworkManager; music?: Pick<SessionMusic, 'start' | 'unlock' | 'dispose'>;
        stage?: ReturnType<typeof createStage>; city?: CityGenerator | Neighborhood;
        releasePreparedModels?:()=>void;cameos?:CameoView;
    } = {}) {
        this.transport = prepared.transport ?? new NetworkManager();
        this.title = prepared.title ?? new TitleScreen();
        this.stage = prepared.stage ?? createStage(renderer);
        this.releasePreparedModels=prepared.releasePreparedModels;
        this.cameos=prepared.cameos;
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
        this.feel.attach(this.stage.renderer.domElement, listener, touchControlsAvailable());
        this.baseExposure=this.stage.renderer.toneMappingExposure;
        this.feel.attachScene(scene);
        this.lineup=new PoliceLineup(scene,typeof document==='undefined'?undefined:document,()=>this.feel.flashbulb());
        this.remotes = new RemotePlayers(scene, world);
        this.worldSpec = initialWorld ? { ...initialWorld } : createWorldSpec(1);
        if(!initialWorld && new URLSearchParams(window.location.search).get('room')?.startsWith('graybox-')) this.worldSpec.version=GRAYBOX_VERSION;
        this.city = prepared.city ?? (this.worldSpec.version===GRAYBOX_VERSION ? new Neighborhood(scene,world,this.worldSpec) : new CityGenerator(scene, world, DEFAULT_CITY_OPTIONS, this.worldSpec));
        if (!prepared.city) this.city.generate();
        if (this.city instanceof Neighborhood && this.city.streetLamps) this.feel.attachCity(scene, this.city.streetLamps);
        this.foleyWorld?.dispose();this.foleyWorld=new FoleyWorld(this.foley,this.stage.scene);
        this.transport.onMessage = message => this.receive(message);
        this.transport.onState = (state, message) => {
            this.clearInput();
            if(state!=='playing'){this.feel.reset();this.pendingLineup=undefined;this.lineup?.end();this.endResults();this.cameos?.reset();for(const id of this.pendingInteractions.keys())this.chaos?.cancelInteraction(id);this.pendingInteractions.clear();this.netplay.clear();}
            this.foleyWorld.setEnabled(state==='playing'&&!document.hidden);
            this.simulation.reset();
            this.hud.setConnection(state, message);
            this.scoreboard.setAvailable(state === 'playing');
            this.touch?.setPlaying(state === 'playing');
            if (state !== 'playing') this.highlights.setIdentity(false, this.observing);
            if (state === 'playing') {
                this.hud.enterPlaying();
                if(message)this.hud.addKillFeed(message);
            }
        };
        this.gun.onHitEntity = (victim, damage) => {
            const victimId = this.remotes.idFor(victim);
            if (victimId && this.transport.state === 'playing') this.transport.send({ type: 'hit', victimId, damage });
        };
        this.bindInput();
        this.title.focus();
        this.highlights.attach();
        this.frame = requestAnimationFrame(time => this.animate(time));
    }

    enterCity(): void {
        if (this.transport.state !== 'idle' && this.transport.state !== 'disconnected') return;
        entryRequested();
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
            openSettings:()=>this.title.settings?.open(),blocked:()=>!!this.title.settings?.isOpen,
            scores:visible=>this.scoreboard.setVisible(visible),clearKeys:()=>this.input.clear()});
        this.pointerLock=bindGamePointerLock({canvas:this.stage.renderer.domElement,
            playing:()=>this.transport.state==='playing',enabled:()=>!this.touch?.active,signal:this.events.signal,
            allowUnlockedClick:target=>!!this.title.settings?.contains(target)||credits.allowUnlockedClick(target),
            record:(type,detail)=>this.stats?.event(type,detail)});
        this.title.settings?.attach({observing:()=>this.observing,playing:()=>this.transport.state==='playing',touch:()=>!!this.touch?.active,clear:()=>{this.clearInput();this.scoreboard.setVisible(false);},resume:()=>this.requestPointerLock()});
        bindScoreboardHold({available:()=>this.transport.state==='playing'&&!this.title.settings?.isOpen,
            show:visible=>this.scoreboard.setVisible(visible),scroll:(dy,dx)=>this.scoreboard.scroll(dy,dx),signal:this.events.signal});
        document.addEventListener('visibilitychange', () => {
            this.foleyWorld.setEnabled(!document.hidden&&this.transport.state==='playing');
        }, options);
        document.addEventListener('mousemove', event => {
            if (!this.touch?.active && this.transport.state === 'playing' && document.pointerLockElement === this.stage.renderer.domElement) {
                if(!this.title.settings?.isOpen)this.rat?.onMouseMove(...lookDelta(event.movementX,event.movementY,'mouse'));
            }
        }, options);
        document.addEventListener('mousedown', event => {
            if (this.title.settings?.isOpen || this.touch?.active || !actionBound('fire',`Mouse${event.button}`) || document.pointerLockElement !== this.stage.renderer.domElement) return;
            this.shoot();
        }, options);
        document.addEventListener('keydown',event=>{
            if(!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!this.title.settings?.isOpen&&document.pointerLockElement===this.stage.renderer.domElement&&actionBound('fire',event.code)){event.preventDefault();this.shoot();}
        },options);
        window.addEventListener('pagehide', () => this.dispose(), options);
    }

    private clearInput(): void { this.input.clear(); this.touch?.clear(); }

    /** Both input devices use the real camera ray, animated muzzle and transport. */
    private shoot(): void {
        if (this.observing || this.title.settings?.isOpen || this.transport.state !== 'playing' || this.roundWon || !this.rat || this.rat.entity.dead || this.rat.entity.hp <= 0) return;
        this.rat.updateView();
        this.stage.camera.getWorldDirection(this.direction);
        const target = this.stage.camera.position.clone().addScaledVector(this.direction, 200);
        this.shotsAttempted++;
        const shot = this.gun.shoot(this.rat.entity, target);
        if(!shot)return;
        this.feel.shot(shot.shotId);this.feel.fired(shot.shotId,shot.origin,shot.direction,true,this.stage.camera);
        const movement=this.movementInput(),viewAt=this.remotes.viewAt?.(shot.origin,shot.direction);
        if (movement && this.transport.send({type:'shoot', ...shot, movement, ...(viewAt===undefined?{}:{viewAt})})) {
            this.rememberMovement(movement,performance.now());
            this.netplay?.begin(shot.shotId,'shot');
            this.shotsSent++;this.chaos?.fire(shot);
        }
    }
    private requestPointerLock(): void { if (!this.title.settings?.isOpen && !this.touch?.active) this.pointerLock.request(); }

    private welcome(message: Extract<ServerMessage, { type: 'welcome' }>): void {
        this.clearInput(); this.touch?.showScores(false); this.roundWon = message.round.phase === 'won';
        this.serverOffset = message.serverTime - Date.now();
        this.foleyWorld.reset();
        this.feel.reset();this.feel.resetRound();this.pendingVictory=undefined;this.pendingLineup=undefined;this.lineup?.end();this.endResults();
        this.cameos?.reset();
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
            if (this.city instanceof Neighborhood && this.city.streetLamps) this.feel.attachCity(this.stage.scene, this.city.streetLamps);
        }
        this.ensureCameos();
        this.myId = message.id;
        this.observing=message.observing===true;
        document.body.classList.toggle('observing',this.observing);
        this.title.settings?.refreshHints();
        this.movementSequence=Math.max(this.movementSequence,message.movementSeq??0);
        this.gun.setProtectedRats(new Set());
        const player = message.player;
        this.rat = new RatController(this.stage.scene, this.stage.world, this.stage.camera, player.name, player,
            new THREE.Vector3(player.x, player.y, player.z),this.worldSpec.version===GRAYBOX_VERSION?CITY_BOUNDS:undefined);
        this.rat.entity.isPlayer = true;
        this.rat.entity.applySnapshot(player);
        this.feel.health(player.hp);
        this.gun.setPlayer(this.stage.camera, this.rat.entity);
        if(this.observing)this.rat.entity.body.collisionFilterMask=1;
        this.remotes.observing=this.observing;
        this.remotes.snapshot(message.players, this.myId);
        this.gun.authoritative=this.worldSpec.version===GRAYBOX_VERSION;
        if(this.gun.authoritative)this.chaos=new ChaosView(this.stage.scene,id=>id===this.myId?this.rat?.entity:this.remotes.get(id),this.stage.listener.context as AudioContext,true,(cue,origin)=>this.feedback.play(cue,origin),this.foleyWorld,this.gun.tracePresentation);
        if(this.chaos){
            this.chaos.onPresentedShot=(id,p,radius)=>this.cameos?.observeShot(id,p,radius,this.gun.sceneryClear);
            this.chaos.onLanding=(p,speed)=>this.feel.landed(LANDING_POSITION.set(p.x,p.y,p.z),speed,this.stage.camera);
            this.chaos.onLauncherFired=(machine,boost)=>this.launcherFired(machine,boost);
            this.chaos.onCorpseJolt=p=>this.feel.corpseJolt(p,this.stage.camera);
            this.chaos.onVentErupted=vent=>{
                const pad={x:vent.x,y:vent.y,z:vent.z,radius:SURGE.radius};
                this.feel.launcherFired('geyser',pad,!!vent.boost,this.stage.camera);this.feel.surgePulse(vent,this.stage.camera);
            };
        }
        this.chaos?.setScores(Object.values(message.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name)), this.myId);
        this.chaos?.setIncidentRoster(message.incidents);
        this.chaos?.setObserving(this.observing);
        this.hud.hideRespawn();
        this.hud.hideVictory();
        if (player.hp <= 0 && player.respawnAt) this.hud.showRespawn(player.respawnAt - this.serverOffset);
        if (message.round.phase === 'won') {this.hud.hideRespawn();this.hud.showVictory(message.round.winnerName ?? '', message.round.kills ?? 0,message.round.assignment);}
        this.lastMovement = [];
        this.lastMovementAt = 0;
        this.lastInteractionPosition.set(player.x,player.y+.8,player.z);
        this.pendingInteractions.clear();this.netplay.clear();
        this.highlightBaseline = true;
        this.lastChaos = null;
        this.seenHighlightLaunches.clear();
        this.highlights.detector.welcome({
            localId: this.myId,
            epoch: '',
            roundId: message.round.assignment?.roundId ?? '',
            deliverySerial: 0,
            owner: null,
            remainingMs: message.round.assignment?.remainingMs ?? null,
            assignmentId: message.round.assignment?.id ?? '',
        });
        this.highlights.setIdentity(!this.observing, this.observing);
        if(!this.observing && normalGameBotCount(window.location) && this.worldSpec.version===GRAYBOX_VERSION){
            this.bots=new NormalGameBots(this.worldSpec,message.players,{muzzle:(id,position,facing)=>{
                const entity=this.remotes.get(id);
                return entity?muzzleAtPose(entity.mesh,position,facing):undefined;
            }});
            if(message.round.phase==='won')this.bots.receive({type:'gameWon',winnerId:message.round.winnerId??'',winnerName:message.round.winnerName??'',kills:message.round.kills??0,resetAt:message.round.resetAt??0});
        }
        // Link whatever the welcome added (other rats, the round's objects)
        // off-thread; frames skip drawing until then instead of stalling.
        // Bounded: three's readiness poll can throw inside its timer (a material
        // disposed mid-link, context loss) and never settle.
        clearTimeout(this.compileTimer);
        const compiling=Promise.race([this.stage.renderer.compileAsync(this.stage.scene,this.stage.camera),
            new Promise(resolve=>{this.compileTimer=setTimeout(resolve,WELCOME_COMPILE_MS);})]).catch(()=>undefined)
            .finally(()=>{if(this.compiling===compiling){clearTimeout(this.compileTimer);this.compiling=undefined;}});
        this.compiling=compiling;
    }

    private receive(message: ServerMessage): void {
        this.scoreboard.receive(message);
        if(message.type==='chaos'){this.diagnosticChaos={receivedAt:Date.now(),serverTime:message.state.time,shots:message.state.shots.length,tick:message.state.tick??0,epoch:message.state.epoch??'legacy'};}

        this.bots?.receive(message);
        switch (message.type) {
            case 'chaos':
                {const incident=message.state.dispatch.phase==='active'?incidentInfo(message.state.dispatch.incident).id:undefined;
                this.gun.setIncident(incident);this.feel.setIncident(incident);}
                this.applyPickupState(message.state);
                this.rat?.applyPressureLaunches(message.state,this.myId);this.chaos?.apply(message.state);
                this.feelStings(this.lastChaos,message.state);
                this.feelLaunches(message.state);
                this.noteHighlightSnapshot(message.state);
                break;
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
                    // A position correction is not a key-up or touch cancel.
                    // Preserve held controls so the next physics step can move.
                    this.rat.syncAfterPhysics(0);
                    this.rat.entity.resetMotionHistory();
                    this.rat.resetGrounding();
                    this.lastMovement = [];
                    this.lastInteractionPosition.set(pose.x,pose.y+.8,pose.z);
                } else this.remotes.move(pose, message.at);
                break;
            }
            case 'playerShot': {
                if(message.shooterId===this.myId){this.netplay?.lap(message.shotId,'confirmed');this.chaos?.launch(message);break;}
                const owner = this.remotes.get(message.shooterId);
                if (owner) {this.gun.replayShot(owner, message);this.feel.fired(message.shotId,message.origin,message.direction,false,this.stage.camera);}
                break;
            }
            case 'shotResult':
                if(['first-step','ironclad-reflect','case-contact','world-bounce','dispatch-contact','pressure-contact'].includes(message.outcome))
                    this.netplay?.lap(message.shotId,message.outcome,message.compensated?`rewind:${Math.round(message.rewindMs??0)}ms`:message.fallback);
                else if(message.ballId===message.shotId)this.netplay?.end(message.shotId,message.outcome,message.compensated?`rewind:${Math.round(message.rewindMs??0)}ms/delta:${(message.targetDelta??0).toFixed(2)}`:message.fallback);
                else this.netplay?.count('shot-ball',message.outcome,message.compensated?'compensated':message.fallback);
                this.chaos?.shotResult(message);
                break;
            case 'pickupResult':
                this.pendingInteractions.delete(message.interactionId);
                this.netplay.end(message.interactionId,message.accepted?'accepted':'rejected',message.reason);
                this.chaos?.resolveInteraction(message);
                if(message.accepted&&message.pickup==='hustle')this.rat?.setSpeedScale(PICKUP_TUNING.hustleMultiplier);
                break;
            case 'playerDamaged': {
                if(message.hp>0 && message.attackerId===this.myId && message.id!==this.myId){this.hud.showHitMarker();this.foley.play('hit-confirm');const victim=this.remotes.get(message.id);if(victim)this.feel.hitDealt(victim.mesh.position,this.stage.camera);}
                const entity = message.id === this.myId ? this.rat?.entity : this.remotes.get(message.id);
                if (message.id === this.myId) this.feel.health(message.hp);
                if (entity && !entity.dead) {
                    if (message.hp === 0) {
                        // Apply health immediately; the ordered playerDied event supplies
                        // the killer direction and owns the single death transition.
                        entity.hp = 0;
                        entity.billboard.setHealth(0);
                    } else if (message.hp < entity.hp) {
                        const attacker=message.attackerId===this.myId?this.rat?.entity:
                            message.attackerId?this.remotes.get(message.attackerId):undefined;
                        // Nonlethal impact drives the cosmetic flinch and, for the local
                        // rat, the view-only jolt; no impulse or authoritative change.
                        const direction=new THREE.Vector3();
                        if(attacker)direction.copy(entity.mesh.position).sub(attacker.mesh.position).setY(0);
                        if(message.id===this.myId)this.feel.hurt(entity.hp-message.hp,entity.mesh.position,attacker?.mesh.position,this.stage.camera);
                        if(message.id===this.myId||message.attackerId===this.myId)this.feel.impact(entity,message.id===this.myId);
                        entity.takeDamage(entity.hp - message.hp, direction);
                    }
                }
                break;
            }
            case 'playerHealed': {
                const entity = message.id === this.myId ? this.rat?.entity : this.remotes.get(message.id);
                entity?.heal(message.hp);
                if (message.id === this.myId) {
                    // Clean Bill heals everyone without a Quick Fix card; a bounty gets its own callout.
                    if(message.cause==='bounty')this.feel.bounty();else if(message.cause!=='incident')this.chaos?.showHealing();
                    this.feel.health(message.hp,true);
                }
                break;
            }
            case 'playerDied': {
                // The kill event owns lethal confirmation, independently of the
                // damage packet or whether world playback already hid the rat.
                const headshot=message.headshot===true;
                if(message.killerId===this.myId && message.victimId!==this.myId){this.hud.showKillConfirmation(message.victimName,headshot);this.foley.play('hit-confirm');const victim=this.remotes.get(message.victimId);this.rat?.entity.nod();if(victim&&this.rat)this.feel.killed(victim.mesh.position,!this.rat.grounded&&this.rat.entity.mesh.position.y>4,this.stage.camera,performance.now(),this.lastChaos?.case?.owner===message.victimId,headshot);}
                this.highlights.emit(this.highlights.detector.onDeath({
                    victimId: message.victimId,
                    killerId: message.killerId,
                    eventKey: `${this.lastChaos?.epoch ?? ''}:${message.victimId}:${message.respawnAt}`,
                    presentedAtMs: performance.now(),
                    incident: message.incident === true,
                    local: message.victimId === this.myId,
                    localKill: message.killerId === this.myId && message.victimId !== this.myId,
                }));
                const entity = message.victimId === this.myId ? this.rat?.entity : this.remotes.get(message.victimId);
                // R2: killed mid-launch flails all the way down.
                const deathStyle = entity?.launchFlight && feelState().on('launchFlight') ? 'flail' : this.feel.deathStyle(message.killerId, message.cause);
                entity?.setDeathStyle(deathStyle);this.chaos?.noteDeathStyle(message.victimId, deathStyle, headshot);
                const killer = message.killerId === null ? undefined : message.killerId === this.myId ? this.rat?.entity : this.remotes.get(message.killerId);
                if (entity && !entity.dead) {
                    if(message.incident){entity.useSharedCorpse();}
                    else {
                    const impact = message.incoming?new THREE.Vector3(message.incoming.x,message.incoming.y,message.incoming.z):killer ? entity.mesh.position.clone().sub(killer.mesh.position) : new THREE.Vector3(0, 0, 1);
                    if(!message.incoming)impact.y = 0;
                    impact.normalize();
                    if(headshot){
                        // Juice T4: hat blast, head splat and a held beat before the fall, for everyone.
                        entity.markHeadshot();
                        const head=entity.mesh.getObjectByName('rat-head')?.getWorldPosition(HEAD_POSITION)??HEAD_POSITION.copy(entity.mesh.position).setY(entity.mesh.position.y+1.6);
                        if(feelState().on('headshot'))this.chaos?.burst(head,HEADSHOT_NORMAL.copy(impact).negate(),FEEL.headshot.params.burst);
                        this.feel.headshot(head,this.stage.camera,message.killerId===this.myId||message.victimId===this.myId);
                    }
                    entity.takeDamage(entity.hp, impact.multiplyScalar(50));
                    }
                }
                if (message.victimId === this.myId) {
                    this.feel.died(()=>this.chaos?.corpseOf(this.myId)??this.rat?.entity.mesh.position);
                    this.clearInput();
                    this.stats?.event('death',{respawnAt:message.respawnAt-this.serverOffset,incident:message.incident});
                    this.hud.showRespawn(message.respawnAt - this.serverOffset);
                }
                this.hud.addKillFeed(message.cause==='evidence-tampering'
                    ? this.deathQuips.caseDeath(message.victimName)
                    : `${message.killerName} eliminated ${message.victimName}${headshot?' · HEADSHOT':''}`);
                break;
            }
            case 'playerRespawn':
                if (message.id === this.myId && this.rat) this.rat.setSpeedScale(1);
                if (message.id === this.myId) {
                    this.stats?.event('respawn'); this.rat?.entity.respawn(message); this.rat?.resetGrounding(); this.feel.reset(); this.feel.health(message.hp);
                    this.lastInteractionPosition.set(message.x,message.y+.8,message.z);this.clearInput(); this.hud.hideRespawn();
                } else this.remotes.respawn(message.id, message);
                break;
            case 'playerLeft': this.remotes.remove(message.id); break;
            case 'scoreboardUpdate': this.chaos?.setScores(message.scores, this.myId); break;
            case 'gameWon': {
                this.roundWon=true;this.clearInput();this.hud.hideRespawn();
                // Polish 19: let the winning moment play in slow motion before the card slams in.
                const hold=this.feel.victory();
                if(hold>0)this.pendingVictory={message,at:performance.now()+hold*1000};
                else this.hud.showVictory(message.winnerName, message.kills,message.assignment,...(message.awards?[message.awards]:[]));
                // Round end: the CASE CLOSED card holds the screen, then the police lineup,
                // then the Case File and final standings for the rest of the 15 seconds.
                const entries=feelState().on('lineup')?this.lineupEntries(message):[],cardAt=performance.now()+hold*1000;
                if(entries.length)this.pendingLineup={entries,at:cardAt+ROUND_END.card*1000};
                this.pendingResults=cardAt+(ROUND_END.card+(entries.length?ROUND_END.lineup:0))*1000;
                this.highlights.emit(this.highlights.detector.onWin(message.winnerId, performance.now()));
                break;
            }
            case 'gameReset':
                this.pendingVictory=undefined;this.pendingLineup=undefined;this.lineup?.end();this.endResults();
                this.cameos?.reset();
                this.highlights.detector.beginRound({
                    epoch: '',
                    roundId: message.round?.assignment?.roundId ?? '',
                    deliverySerial: 0,
                    owner: null,
                    remainingMs: message.round?.assignment?.remainingMs ?? null,
                    assignmentId: message.round?.assignment?.id ?? '',
                });
                this.highlightBaseline = true;
                this.seenHighlightLaunches.clear();
                this.highlightCorpseSeen.clear();
                this.roundWon=false;this.rat?.entity.setPowerups(0,0);this.rat?.entity.resetReactions();
                for(const {entity} of this.remotes.rats.values()){entity.setPowerups(0,0);entity.resetReactions();}
                this.rat?.setSpeedScale(1);this.gun.setProtectedRats(new Set());this.clearInput();this.foleyWorld.reset();this.feel.reset();this.feel.resetRound();this.gun.clearProjectiles();this.chaos?.resetProjectiles(); this.hud.hideVictory(); this.hud.hideRespawn(); break;
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
        if (this.observing || !this.rat || this.rat.entity.dead || this.rat.entity.hp <= 0 || now - this.lastMovementAt < 50) return;
        const { position: p, quaternion: q } = this.rat.entity.body;
        const mq = this.rat.entity.mesh.quaternion;
        const pose=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,mq.x,mq.y,mq.z,mq.w];
        if (pose.every((value,i)=>value===this.lastMovement[i]) && now-this.lastMovementAt<1_000) return;
        const movement=this.movementInput();if(!movement)return;
        const message: ClientMessage = { type: 'updateMovement', ...movement };
        if (this.transport.send(message)) this.rememberMovement(movement,now,pose);
    }

    private movementInput():MovementInput|undefined {
        if(!this.rat)return;
        const {position:p,quaternion:q}=this.rat.entity.body,mq=this.rat.entity.mesh.quaternion??q;
        this.movementSequence=(this.movementSequence??0)+1;
        return{seq:this.movementSequence,position:{x:p.x,y:p.y,z:p.z},rotation:{x:q.x,y:q.y,z:q.z,w:q.w},
            meshRotation:{x:mq.x,y:mq.y,z:mq.z,w:mq.w}};
    }
    private rememberMovement(movement:MovementInput,now:number,pose?:number[]):void {
        const p=movement.position,q=movement.rotation,mq=movement.meshRotation;
        this.lastMovement=pose??[p.x,p.y,p.z,q.x,q.y,q.z,q.w,mq.x,mq.y,mq.z,mq.w];this.lastMovementAt=now;
    }
    private checkInteractions(now:number):void {
        if(this.observing||!this.rat||!this.chaos||this.rat.entity.dead||this.rat.entity.hp<=0)return;
        for(const [id,started] of this.pendingInteractions)if(now-started>1500){
            this.pendingInteractions.delete(id);this.chaos.cancelInteraction(id);this.netplay.end(id,'timeout');
        }
        const p=this.rat.entity.body.position,current={x:p.x,y:p.y+.8,z:p.z};
        const candidate=this.chaos.interaction?.(this.lastInteractionPosition,current,this.rat.entity.hp>=MAX_HP);
        this.lastInteractionPosition.set(current.x,current.y,current.z);
        if(!candidate)return;
        const movement=this.movementInput();if(!movement)return;
        const interactionId=createShotId();
        if(!this.transport.send({type:'pickupIntent',interactionId,target:candidate.target,targetId:candidate.targetId,generation:candidate.generation,movement}))return;
        this.rememberMovement(movement,now);this.pendingInteractions.set(interactionId,now);
        this.netplay.begin(interactionId,'pickup');this.chaos.anticipateInteraction(interactionId,candidate);
    }

    private animate(now: number): void {
        if (this.disposed) return;
        const resized = this.stage.syncViewport();
        // The prepared title backdrop is static; do not spend phone frame time
        // drawing the whole city while somebody is choosing a name.
        if(!this.rat && this.transport.state==='idle'){
            if(resized)this.stage.renderer.render(this.stage.scene,this.stage.camera);
            this.previousTime=now;
            this.frame=requestAnimationFrame(time=>this.animate(time));return;
        }
        const frameMs = this.previousTime ? now - this.previousTime : 0;
        const dt = this.previousTime ? Math.min((now - this.previousTime) / 1000, 0.05) : 1 / 60;
        this.previousTime = now;
        const { scene, camera, renderer, world, flashlight } = this.stage;
        const measure=!!this.stats,start=measure?performance.now():0;let botsMs=0;
        if (this.transport.state === 'playing') {
            this.remotes.prepareFrame(this.feel.presentTime(performance.now()));
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
            this.checkInteractions(now);
            this.sendMovement(now);
            this.observeHighlights(now);
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
            if(this.rat&&!this.rat.entity.dead){
                this.foleyWorld.motion.update(this.rat.entity.mesh.position,dt,this.rat.grounded);
                const v=this.rat.entity.body.velocity;
                this.feel.motion(dt,this.rat.grounded,v.y,Math.hypot(v.x,v.z),this.rat.moveSpeedScale,this.lastChaos?.case?.owner===this.myId);
                const p=this.rat.entity.mesh.position,levels=this.lastChaos?.pressure?.levels;
                const under=levels&&LAUNCH_MACHINES.find(m=>Math.abs(p.y-m.pad.y)<2&&Math.hypot(p.x-m.pad.x,p.z-m.pad.z)<=m.pad.radius);
                if(under)this.feel.padRumble((levels[under.id]??0)/PRESSURE_TUNING.full,dt);
            }
            else this.foleyWorld.motion.clear();
        }
        if(this.transport.state==='playing'&&!document.hidden&&this.rat)this.feelAudioFrame(dt);
        this.cameos?.beginFrame(dt,camera.position);
        this.chaos?.setLastHitPoint(!this.observing&&this.feel.lastHitPoint);
        this.chaos?.update(dt*this.feel.timeScale,camera,this.feel.presentTime(performance.now()));
        if(this.pendingVictory&&now>=this.pendingVictory.at){
            const won=this.pendingVictory.message;this.pendingVictory=undefined;
            if(this.roundWon)this.hud.showVictory(won.winnerName,won.kills,won.assignment,...(won.awards?[won.awards]:[]));
        }
        if(this.transport.state==='playing'&&!document.hidden)this.cameos?.update(this.cameoVisitors,this.gun.sceneryClear);
        this.city.update(dt, camera, this.rat?.entity.body.position);
        // Opponent outlines keep their on-screen width at any distance.
        const unitsPerPixel=2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/(globalThis.innerHeight||720);
        for(const {entity} of this.remotes.rats.values())entity.fitOutline(camera.position,unitsPerPixel);
        // The Hunch reads only while your rat is alive in live play.
        const detective=this.transport.state==='playing'&&!this.observing&&!this.roundWon&&this.rat&&!this.rat.entity.dead?this.rat.entity:undefined;
        const dispatch=this.lastChaos?.dispatch,wanted=dispatch?.phase==='active'&&incidentInfo(dispatch.incident).id==='most-wanted'&&!this.roundWon?dispatch.wanted:undefined;
        this.feel.hunch(dt,now,camera,detective,this.remotes.rats,wanted);
        const wantedRat=wanted===undefined?undefined:wanted===this.myId?this.rat?.entity:this.remotes.get(wanted);
        this.feel.wanted(dt,wantedRat&&!wantedRat.dead?wantedRat.mesh.position:undefined,!!wanted&&wanted===this.myId);
        const presentationEnd=measure?performance.now():0;
        this.feel.update(dt,camera,this.rat?.entity.mesh.position);
        if(this.pendingResults!==undefined&&now>=this.pendingResults&&this.roundWon){
            this.pendingResults=undefined;this.resultsShown=true;this.hud.showResults(true);this.scoreboard.setVisible(true);
        }
        if(this.pendingLineup&&now>=this.pendingLineup.at){this.lineup?.start(this.pendingLineup.entries);this.feel.endDeathCamera(camera);this.pendingLineup=undefined;}
        if(this.lineup?.active)this.lineup.update(dt,camera,flashlight);
        if(!this.compiling){
            renderer.toneMappingExposure=this.baseExposure*this.feel.exposure;
            this.feel.beforeRender(camera);
            this.stats?.gpu.begin();
            renderer.render(scene, camera);
            this.stats?.gpu.end();
            this.feel.afterRender(camera);
        }
        if(this.rat && this.transport.state==='playing' && this.releasePreparedModels && !this.compiling){
            this.releasePreparedModels();this.releasePreparedModels=undefined;
            performance.mark('city-first-play-frame');
        }
        this.stats?.record(frameMs, now, this.worldSpec,{simulationMs:simulationEnd-start,botsMs,presentationMs:presentationEnd-simulationEnd,renderMs:performance.now()-presentationEnd},{network:this.transport.getDiagnostics(),netplay:this.netplay.snapshot(),remoteTiming:this.remotes.timingDiagnostics(),shotsAttempted:this.shotsAttempted,shotsSent:this.shotsSent,chaos:this.diagnosticChaos,snapshotAgeMs:this.diagnosticChaos.receivedAt?Date.now()-this.diagnosticChaos.receivedAt:null,projectiles:this.chaos?.getDiagnostics()});
        this.frame = requestAnimationFrame(time => this.animate(time));
    }

    /** Leave the round-end results board (reset, reconnect, leaving play). */
    private endResults():void {
        const shown=this.resultsShown;this.pendingResults=undefined;this.resultsShown=false;
        if(shown){this.hud.showResults(false);this.scoreboard.setVisible(false);}
    }

    /** Juice T5: the lineup's rats, winner first, rebuilt from the rats this client knows. */
    private lineupEntries(message:Extract<ServerMessage,{type:'gameWon'}>):LineupEntry[] {
        const entries:LineupEntry[]=[];
        for(const id of message.lineup??[]){
            const entity=id===this.myId?this.rat?.entity:this.remotes.get(id);
            if(!entity)continue;
            entries.push({id,name:entity.name,appearance:entity.appearance,award:message.awards?.find(award=>award.playerId===id),winner:id===message.winnerId});
        }
        return entries;
    }

    /** Polish 17 music stings from consecutive snapshots. */
    private feelStings(previous:ChaosState|null,next:ChaosState):void {
        if(!previous||this.observing)return;
        if(next.case?.owner===this.myId&&previous.case?.owner!==this.myId)this.feel.sting('case');
        const before=previous.assignment,after=next.assignment;
        if(!before||!after||before.roundId!==after.roundId)return;
        if((after.deliverySerial??0)>(before.deliverySerial??0)&&after.lastDelivery?.playerId===this.myId)this.feel.sting('delivery');
        if((before.remainingMs??0)>10_000&&(after.remainingMs??0)<=10_000&&(after.remainingMs??0)>0)this.feel.sting('closing');
    }

    /** L5: a machine fired in the presented timeline: its debris and rumble, and hats blown off rats near the pad. */
    private launcherFired(machine:LaunchMachine,boost:boolean):void {
        this.feel.launcherFired(machine.kind,machine.pad,boost,this.stage.camera);this.feel.surgePulse(machine.pad,this.stage.camera);
        const range=FEEL.launchMoment.params.hatRange;
        const blow=(entity:RatEntity)=>{
            const d=Math.hypot(entity.mesh.position.x-machine.pad.x,entity.mesh.position.z-machine.pad.z);
            if(d<range&&Math.abs(entity.mesh.position.y-machine.pad.y)<3)entity.blowHat(1.5-d/range);
        };
        if(this.rat)blow(this.rat.entity);
        for(const {entity} of this.remotes.rats.values())blow(entity);
    }

    /** L5/L6 per snapshot: every new launch screams (yours kicks the view); thrown cases whistle and spill. */
    private feelLaunches(state:ChaosState):void {
        if(this.observing)return;
        for(const launch of state.pressure?.launches??[]){
            if(this.feltLaunches.has(launch.id))continue;
            this.feltLaunches.add(launch.id);
            if(this.feltLaunches.size>64)this.feltLaunches.delete(this.feltLaunches.values().next().value!);
            const local=launch.playerId===this.myId,entity=local?this.rat?.entity:this.remotes.get(launch.playerId);
            if(entity&&!entity.dead)this.feel.launched(entity.mesh.position,local,!!launch.boost,this.stage.camera);
        }
        if(state.case)this.feel.cases([state.case,...state.extraCases??[]],this.stage.camera);
    }

    /** Polish 17: footsteps (you and nearby rats) and near-miss whizzes. */
    private feelAudioFrame(dt:number):void {
        const rat=this.rat!,sources=FOOTSTEP_SOURCES;let n=0;
        const self=rat.entity.dead||this.observing?undefined:rat.entity.mesh.position;
        if(self)n=pooledSource(n,'self',self,rat.grounded);
        for(const [id,{entity}] of this.remotes.rats)if(!entity.dead)n=pooledSource(n,id,entity.mesh.position);
        sources.length=n;
        this.feel.footsteps(dt,sources,self,this.stage.camera);
        // M1: a near miss makes your rat gasp.
        if(self&&this.lastChaos&&this.feel.projectiles(this.lastChaos.shots,this.myId,HEAD_POSITION.copy(self).setY(self.y+1.6),this.stage.camera))rat.entity.startle();
        // L6: contrails behind every rat riding a launcher throw.
        if(!this.observing)this.feel.flightTrail(this.myId,rat.entity.mesh.position,rat.entity.launchFlight,dt);
        for(const [id,{entity}] of this.remotes.rats)this.feel.flightTrail(id,entity.mesh.position,entity.launchFlight,dt);
    }

    private ensureCameos():void {
        const enabled=this.worldSpec.version===GRAYBOX_VERSION;
        this.cameos?.setEnabled(enabled);
        if(!enabled||this.cameos||this.cameoLoading)return;
        this.cameoLoading=true;
        void loadCameos(this.events.signal).then(view=>{
            this.cameoLoading=false;
            if(this.disposed){view?.dispose();return;}
            this.cameos=view;
            if(view){view.setEnabled(this.worldSpec.version===GRAYBOX_VERSION);this.stage.scene.add(view.root);}
        });
    }
    private readonly cameoVisitors=()=>this.visitors();
    private *visitors():Iterable<CameoVisitor>{
        if(this.rat&&!this.observing)yield {id:this.myId,position:this.rat.entity.mesh.position,dead:this.rat.entity.dead};
        for(const [id,{entity}] of this.remotes.rats)yield {id,position:entity.mesh.position,dead:entity.dead};
    }

    private noteHighlightSnapshot(state: ChaosState): void {
        if (!this.highlights?.detectorActive) { this.lastChaos = state; return; }
        this.lastChaos = state;
        const presentedAtMs = performance.now();
        for (const launch of state.pressure?.launches ?? []) {
            if (launch.playerId !== this.myId || this.seenHighlightLaunches.has(launch.id)) continue;
            this.seenHighlightLaunches.add(launch.id);
            this.highlights.detector.noteLocalLaunch(presentedAtMs, this.rat?.entity.mesh.position.y ?? 0);
            this.localLaunchY = this.rat?.entity.mesh.position.y ?? 0;
            this.localLaunchAt = presentedAtMs;
        }
        this.highlights.emit(this.highlights.detector.onSnapshot({
            epoch: state.epoch ?? '',
            roundId: state.assignment?.roundId ?? '',
            deliverySerial: state.assignment?.deliverySerial ?? 0,
            owner: state.case.owner,
            remainingMs: state.assignment?.remainingMs ?? null,
            assignmentId: state.assignment?.id ?? '',
            lastDeliveryPlayerId: state.assignment?.lastDelivery?.playerId,
            launches: (state.pressure?.launches ?? []).map(launch => ({id: launch.id, playerId: launch.playerId, at: launch.at})),
            presentedAtMs,
            silent: this.highlightBaseline,
        }));
        this.highlightBaseline = false;
    }

    private observeHighlights(now: number): void {
        if (!this.highlights?.live || !this.lastChaos || now - this.lastHighlightObserve < 100) return;
        this.lastHighlightObserve = now;
        const camera = this.stage.camera;
        this.highlightMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.highlightFrustum.setFromProjectionMatrix(this.highlightMatrix);
        const local = this.rat?.entity.mesh.position;
        const live = new Set(this.lastChaos.corpses.map(corpse => corpse.id));
        for (const id of [...this.highlightCorpseSeen.keys()]) if (!live.has(id)) this.highlightCorpseSeen.delete(id);
        const corpses = this.lastChaos.corpses.map(corpse => {
            if (!this.highlightCorpseSeen.has(corpse.id)) this.highlightCorpseSeen.set(corpse.id, now);
            const point = new THREE.Vector3(corpse.p.x, corpse.p.y, corpse.p.z);
            const onScreen = this.highlightFrustum.containsPoint(point);
            const nearby = !local || Math.hypot(point.x - local.x, point.z - local.z) <= 20;
            const visible = onScreen && nearby && this.gun.sceneryClear(camera.position, point);
            return {id: corpse.id, presentedAtMs: this.highlightCorpseSeen.get(corpse.id) || now, x: corpse.p.x, y: corpse.p.y, z: corpse.p.z, onScreen, visible};
        });
        this.highlights.emit(this.highlights.detector.observePhysical({
            presentedAtMs: now,
            localY: this.rat?.entity.mesh.position.y ?? 0,
            localLaunchedAtMs: this.localLaunchAt || undefined,
            localLaunchY: this.localLaunchAt ? this.localLaunchY : undefined,
            nearbyEruption: (this.lastChaos.impacts ?? []).some(hit => hit.cue === 'thud'),
            corpses,
        }));
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.highlights.dispose();
        document.body.classList.remove('observing');
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
        this.cameos?.dispose();
        this.city.dispose();
        this.music.dispose();
        this.feedback.dispose();
        this.foleyWorld.dispose();this.foley.dispose();this.feel.dispose();this.lineup?.dispose();clearTimeout(this.compileTimer);
        disposeEntitySounds();
        this.stats?.dispose();
        this.stage.dispose();
    }
}
