import { SURGE } from '../shared/launcherVelocity';
import { actionBound, lookDelta } from '../settings/PlayerPreferences';
import {FoleyAudio} from '../audio/FoleyAudio';
import { unlockEffectsAudio } from '../audio/effectsAudio';
import {FoleyWorld} from '../audio/FoleyWorld';
import * as THREE from 'three';
import { ChaosView } from '../prototype/ChaosView';
import { HARD_SHOVE } from '../prototype/RatReactionEvents';
import { Neighborhood } from '../prototype/Neighborhood';
import { CITY_BOUNDS, GRAYBOX_VERSION } from '../shared/grayboxLayout';
import { CityGenerator } from '../world/CityGenerator';
import { DEFAULT_CITY_OPTIONS, createWorldSpec, type WorldSpec } from '../shared/worldSpec';
import { RatController } from '../player/RatController';
import { CheeseGun } from '../weapons/CheeseGun';
import { initEntitySounds, disposeEntitySounds } from '../entities/RatEntity';
import { generateRandomAppearance } from '../shared/ratAppearance';
import { MAX_HP, READING_CAP_MS, type ClientMessage, type MovementInput, type ServerMessage } from '../shared/networkProtocol';
import { NetworkManager } from '../network/NetworkManager';
import { GameHud } from '../ui/GameHud';
import { TitleScreen } from '../ui/TitleScreen';
import { MunicipalQuips } from '../ui/municipalQuips';
import { createStage } from './createStage';
import { RemotePlayers } from './RemotePlayers';
import { InputState } from './InputState';
import { SessionMusic } from './SessionMusic';
import { PerformanceStats } from './PerformanceStats';
import { PerfReporter } from './perfReporter';
import { SimulationClock } from './SimulationClock';
import { NormalGameBots, normalGameBotCount } from './NormalGameBots';
import { muzzleAtPose } from '../utils/muzzlePose';
import { incidentInfo, type IncidentId } from '../shared/incidentCatalog';
import { ShotSpacing } from '../shared/shotTiming';
import { LAUNCH_MACHINES, PRESSURE_TUNING, type ChaosState, type LaunchMachine } from '../shared/chaosState';
import { FAULTY_COPY, PICKUP_TUNING, WEAPON_TUNING, faultyOf, heldWeapon, jumpBlocked, legScale, shortedOut, trapped, weaponArming, type WeaponKind } from '../shared/pickups';
import { tommyHeat } from '../shared/shotPattern';
import { laserPath } from '../shared/laser';
import { HeldFire } from './HeldFire';
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
import {IncidentStory,STORY} from '../feel/IncidentStory';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';
import {FLASHLIGHT,FLASHLIGHT_REACH} from '../shared/rat/ratBody';
import {PoliceLineup,type LineupEntry} from '../feel/PoliceLineup';
import {entryRequested} from './yieldToPage';
import {checkPrograms,uploadTextures} from './warmPrograms';
import {qualityFrame,qualityStatus,settleQuality} from './graphicsQuality';

/** Reused per-frame scratch for polish-17 audio (one live session at a time). */
const FOOTSTEP_SOURCES:{id:string;position:THREE.Vector3;grounded?:boolean}[]=[];
const HEAD_POSITION=new THREE.Vector3();
const LANDING_POSITION=new THREE.Vector3();
/** Where a refused Mousetrap would have gone (its NO ROOM word). */
const TRAP_SPOT=new THREE.Vector3();
const HEADSHOT_NORMAL=new THREE.Vector3();
/** Longest a welcome waits for off-thread shader links before drawing anyway. */
const WELCOME_COMPILE_MS=2500;
/** Fill slot `n` of the reused footstep list in place; returns the next slot. */
function pooledSource(n:number,id:string,position:THREE.Vector3,grounded?:boolean):number {
    const source=FOOTSTEP_SOURCES[n]??={id,position,grounded};
    source.id=id;source.position=position;source.grounded=grounded;
    return n+1;
}

/** One owner for the complete local game lifetime, including reconnect reconciliation. */
/** Round end (Tyler, 2026-09-28): the slow-motion finish, the CASE CLOSED card and the
 * lineup's photos share the first `results` seconds; the results board holds the other 25. */
const ROUND_END={card:1,results:5};

export class GameSession {
    private readonly stage;
    private readonly transport: NetworkManager;
    private readonly title: TitleScreen;
    private readonly hud = new GameHud(document, () => this.transport.retry(), cue => this.feedback?.play(cue),(...args)=>this.foley?.play(...args));
    private readonly deathQuips = new MunicipalQuips();
    private readonly scoreboard = new MatchScoreboard(document, cue => this.feedback?.play(cue));
    private readonly input = new InputState(window,document,()=>!this.title?.settings?.isOpen && this.transport?.state==='playing' && (this.touch?.active || document.pointerLockElement===this.stage?.renderer.domElement));
    private readonly events = new AbortController();
    private readonly gun;
    private readonly remotes;
    private readonly music;
    private readonly feedback: FeedbackAudio;
    private readonly foley:FoleyAudio;
    private foleyWorld!:FoleyWorld;
    private readonly stats: PerformanceStats | null;
    /** Frame performance sent to the city map every 30 s of play. */
    readonly perf: PerfReporter;
    private diagnosticChaos:{receivedAt:number;serverTime:number;shots:number;tick:number;epoch:string}={receivedAt:0,serverTime:0,shots:0,tick:0,epoch:''};
    private shotsAttempted=0;
    private shotsSent=0;
    private readonly shotSpacing=new ShotSpacing();
    /** The Tommy Gun's held trigger (mouse/key), and its bloom count of your own triggers. */
    private readonly heldFire=new HeldFire();
    private tommyHeat=0;
    private tommyAt:number|undefined;
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
    /** The camera's look direction sent with movement for the city map's aim record (rounded, so noise sends nothing). */
    private readonly aim = new THREE.Vector3();
    private touch?: TouchControls;
    private roundWon = false;
    private releasePreparedModels?:()=>void;
    private playFrameMarked=false;
    private readonly highlights = new HighlightBridge();
    private readonly feel = new FeelDirector();
    /** Incident storytelling overlays (WANTED poster, BOUNTY CLAIMED, ALL UNITS radio call, YOU'RE BACKUP card). */
    private story?: IncidentStory;
    /** The running Dispatch incident, from the latest chaos snapshot. */
    private activeIncident: IncidentId | undefined;
    /** C5: one tick per nameplate pip a Quick Fix refills. */
    private readonly pipTick = () => this.feedback.play('pip-tick');
    /** The stage's own exposure (a Blackout leaves it alone: beam-lit surfaces read bright). */
    private baseExposure = 1;
    private readonly beamAim = new THREE.Vector3();
    /** The Blackout level the nameplates were last shaded for (0: every plate lit). */
    private plateDark = 0;
    private compiling?:Promise<unknown>;
    private compileTimer?:ReturnType<typeof setTimeout>;
    private readonly lineup?:PoliceLineup;
    private pendingLineup?:{entries:LineupEntry[];at:number};
    /** Round end, last beat: when the Case File and final standings take over. */
    private pendingResults?:number;
    private resultsShown=false;
    /** Results (protocol 28): this human still owes the round a CONTINUE (set by `gameWon`; observers never do), has
     * continued before the next round started, or is held out of the round already under way until they continue. */
    private awaitingContinue=false;
    private continued=false;
    private held=false;
    private heldUntil=0;
    /** When the next round starts (local clock), and when the results board appeared. */
    private nextRoundAt=0;
    private resultsShownAt=0;
    private pendingVictory?:{message:Extract<ServerMessage,{type:'gameWon'}>;at:number};
    private lastHighlightObserve = 0;
    private lastChaos: ChaosState | null = null;
    private localLaunchY = 0;
    private localLaunchAt = 0;
    private highlightBaseline = true;
    private seenHighlightLaunches = new Set<string>();
    /** Launch events already given their scream and view kick (L5/L6). */
    private readonly feltLaunches = new Set<string>();
    /** Code Violation: each rat's dud deadline as last seen (a new one goes in the feed once), after the first snapshot. */
    private readonly dudsSeen = new Map<string, number>();
    private dudsPrimed = false;
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
        this.perf=new PerfReporter(renderer,report=>this.transport.send({type:'perf',report}),this.events.signal);
        // The page's first pagehide listener (main.ts) closes the socket before the session's own runs.
        this.transport.onDestroy=()=>this.perf.leave();
        this.perf.quality=()=>{const q=qualityStatus();return{quality:q.mode==='auto'?`auto-${q.tier}`:q.tier,scale:q.scale};};
        // Measurement only (Tyler, 1 October): real ping before any network change.
        this.perf.network=()=>{const n=this.transport.getDiagnostics();
            return{...(n.rttMinMs>0||n.rttMs>0?{rtt:Math.round(n.rttMs),rttJitter:Math.round(n.rttJitterMs),rttMin:Math.round(n.rttMinMs),rttMax:Math.round(n.rttMaxMs)}:{}),...this.remotes.viewDelays()};};
        const { scene, world, listener } = this.stage;
        initEntitySounds(listener);
        this.music = prepared.music ?? new SessionMusic(listener);
        this.music.start();
        this.feedback = new FeedbackAudio(listener);
        this.feel.cue = cue => this.feedback.play(cue);
        this.foley=new FoleyAudio(listener);
        this.foley.setEnabled(false);
        this.gun = new CheeseGun(scene, world, listener);
        this.feel.attach(this.stage.renderer.domElement, listener, touchControlsAvailable());
        this.baseExposure=this.stage.renderer.toneMappingExposure;
        this.feel.attachScene(scene);
        this.story=new IncidentStory(typeof document==='undefined'?undefined:document,listener.context as AudioContext);
        this.lineup=new PoliceLineup(scene,typeof document==='undefined'?undefined:document,()=>this.feel.flashbulb());
        this.remotes = new RemotePlayers(scene, world);
        this.worldSpec = initialWorld ? { ...initialWorld } : createWorldSpec(1);
        if(!initialWorld && new URLSearchParams(window.location.search).get('room')?.startsWith('graybox-')) this.worldSpec.version=GRAYBOX_VERSION;
        const beforeCity=prepared.city?undefined:new Set(scene.children);
        this.city = prepared.city ?? (this.worldSpec.version===GRAYBOX_VERSION ? new Neighborhood(scene,world,this.worldSpec) : new CityGenerator(scene, world, DEFAULT_CITY_OPTIONS, this.worldSpec));
        if (beforeCity) {this.city.generate();this.stage.moonShadow.adoptCity(scene,beforeCity);}
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
                if(message)this.hud.addKillFeed({kind:'note',text:message});
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
            look:(dx,dy)=>this.rat?.onMouseMove(dx,dy),shoot:()=>this.shoot(),holdMs:()=>this.tommyRepeatMs(),
            openSettings:()=>this.title.settings?.open(),blocked:()=>!!this.title.settings?.isOpen,
            scores:visible=>{if(!this.resultsShown)this.scoreboard.setVisible(visible);},clearKeys:()=>this.input.clear()});
        // While a reader is on the results the mouse belongs to the board: no lock from stray clicks, no pause menu on unlock.
        this.pointerLock=bindGamePointerLock({canvas:this.stage.renderer.domElement,
            playing:()=>this.transport.state==='playing'&&!this.reading,enabled:()=>!this.touch?.active,signal:this.events.signal,
            allowUnlockedClick:target=>!!this.title.settings?.contains(target)||credits.allowUnlockedClick(target),
            record:(type,detail)=>this.stats?.event(type,detail)});
        this.title.settings?.attach({observing:()=>this.observing,playing:()=>this.transport.state==='playing'&&!this.reading,touch:()=>!!this.touch?.active,clear:()=>{this.clearInput();this.scoreboard.setVisible(false);},resume:()=>this.requestPointerLock(),cue:cue=>this.feedback?.play(cue)});
        bindScoreboardHold({available:()=>this.transport.state==='playing'&&!this.title.settings?.isOpen&&!this.resultsShown,
            show:visible=>{if(!this.resultsShown)this.scoreboard.setVisible(visible);},scroll:(dy,dx)=>this.scoreboard.scroll(dy,dx),signal:this.events.signal});
        this.hud.onContinue=()=>this.continueFromResults();
        // Any key leaves the results too, once they have been up long enough not to catch a key held from play.
        document.addEventListener('keydown',event=>{
            if(!this.reading||event.repeat||event.altKey||event.ctrlKey||event.metaKey||this.title.settings?.isOpen||performance.now()-this.resultsShownAt<800)return;
            if(['Escape','Tab','CapsLock','ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(event.code)||/^F\d+$/.test(event.code))return;
            if((event.target as HTMLElement|null)?.tagName==='BUTTON'&&(event.code==='Enter'||event.code==='Space'))return;
            event.preventDefault();this.continueFromResults();
        },options);
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
            this.pressFire();
        }, options);
        document.addEventListener('keydown',event=>{
            if(!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!this.title.settings?.isOpen&&document.pointerLockElement===this.stage.renderer.domElement&&actionBound('fire',event.code)){event.preventDefault();this.pressFire();}
        },options);
        // The Tommy Gun fires while the button is held: releasing it, losing the lock or the window ends the burst.
        document.addEventListener('mouseup',event=>{if(actionBound('fire',`Mouse${event.button}`))this.heldFire.release();},options);
        document.addEventListener('keyup',event=>{if(actionBound('fire',event.code))this.heldFire.release();},options);
        document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==this.stage.renderer.domElement)this.heldFire.release();},options);
        window.addEventListener('blur',()=>this.heldFire.release(),options);
        window.addEventListener('pagehide', () => this.dispose(), options);
    }

    private clearInput(): void { this.input.clear(); this.touch?.clear(); this.heldFire.release(); }

    /** The special weapon your rat holds now, by the server's clock. */
    private weaponNow(): WeaponKind | undefined { return heldWeapon(this.lastChaos?.buffs, this.myId, Date.now() + this.serverOffset); }
    /** The Tommy Gun's held-fire repeat; undefined (one shot per press) for every other gun. */
    private tommyRepeatMs(): number | undefined { return this.weaponNow() === 'tommy-gun' ? WEAPON_TUNING.tommyIntervalMs : undefined; }
    private pressFire(): void { this.shoot(); this.heldFire.press(performance.now(), this.tommyRepeatMs()); }
    private readonly fireRound = () => this.shoot();

    /** Both input devices use the real camera ray, animated muzzle and transport. */
    private shoot(): void {
        if (this.observing || this.title.settings?.isOpen || this.transport.state !== 'playing' || this.roundWon || !this.rat || this.rat.entity.dead || this.rat.entity.hp <= 0) return;
        // Big Cheese spaces every rat's shots, as the room does; an early press only dry-clicks.
        const dispatch=this.lastChaos?.dispatch,incident=dispatch?.phase==='active'?incidentInfo(dispatch.incident).id:undefined;
        const now=performance.now(),weapon=this.weaponNow();
        // A Mousetrap just taken is still coming up into the paw: the press does nothing (no shot, no set-down predicted;
        // the room refuses it too). Only a press after that sets it down: a held trigger never repeats into it.
        if (weaponArming(this.lastChaos?.buffs?.[this.myId], Date.now() + this.serverOffset)) return;
        // Short Circuit (a Code Violation dud): the gun is shorted out and only dry-clicks, as the room refuses it.
        if (shortedOut(this.lastChaos?.buffs, this.myId, Date.now() + this.serverOffset)) { this.feel.sound.jam(); return; }
        if (!this.shotSpacing.allow(this.myId, incident, now, 0, weapon)) { this.feel.sound.jam(); return; }
        this.rat.updateView();
        this.stage.camera.getWorldDirection(this.direction);
        const target = this.stage.camera.position.clone().addScaledVector(this.direction, 200);
        this.shotsAttempted++;
        const shot = this.gun.shoot(this.rat.entity, target, weapon);
        if(!shot)return;
        this.feel.shot(weapon);
        if(weapon!=='mousetrap')this.feel.fired(shot.shotId,shot.origin,shot.direction,true,this.stage.camera,now,weapon!==undefined);
        if(weapon==='tommy-gun')this.feel.tommyRound(shot.origin,shot.direction,this.stage.camera);
        const movement=this.movementInput(),viewAt=this.remotes.viewAt?.(shot.origin,shot.direction);
        if (movement && this.transport.send({type:'shoot', ...shot, movement, ...(viewAt===undefined?{}:{viewAt})})) {
            this.rememberMovement(movement,now);
            // A Mousetrap press sets a trap down: no ball, so no netplay shot timing.
            if(weapon!=='mousetrap')this.netplay?.begin(shot.shotId,'shot');
            this.shotsSent++;
            // Shooter and authority each count their own Tommy triggers for its bloom.
            if(weapon==='tommy-gun'){this.tommyHeat=tommyHeat(this.tommyHeat,this.tommyAt,now);this.tommyAt=now;}
            this.chaos?.fire(shot,weapon&&{kind:weapon,heat:this.tommyHeat},weapon==='laser'?laserPath(shot.origin,shot.direction,this.gun.traceLaser):undefined);
        }
    }
    private requestPointerLock(): void { if (!this.title.settings?.isOpen && !this.touch?.active) this.pointerLock.request(); }

    private welcome(message: Extract<ServerMessage, { type: 'welcome' }>): void {
        this.clearInput(); this.touch?.showScores(false); this.roundWon = message.round.phase === 'won';
        this.serverOffset = message.serverTime - Date.now();
        this.foleyWorld.reset();
        // The scoreboard has already taken this welcome's round (its results when the round is won).
        this.feel.reset();this.feel.resetRound();this.story?.reset();this.pendingVictory=undefined;this.pendingLineup=undefined;this.lineup?.end();this.endResults(false);
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
            const beforeCity=new Set(this.stage.scene.children);
            this.city = this.worldSpec.version===GRAYBOX_VERSION ? new Neighborhood(this.stage.scene,this.stage.world,this.worldSpec) : new CityGenerator(this.stage.scene, this.stage.world, DEFAULT_CITY_OPTIONS, this.worldSpec);
            this.city.generate();
            // A new city: its moon shadow is drawn once more, with the next frame.
            this.stage.moonShadow.adoptCity(this.stage.scene,beforeCity);
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
        this.rat.entity.applySnapshot(player);this.rat.lookAlongFacing();
        this.feel.health(player.hp);
        this.gun.setPlayer(this.stage.camera, this.rat.entity);
        if(this.observing)this.rat.entity.body.collisionFilterMask=1;
        this.remotes.observing=this.observing;
        this.remotes.snapshot(message.players, this.myId);
        this.gun.authoritative=this.worldSpec.version===GRAYBOX_VERSION;
        if(this.gun.authoritative)this.chaos=new ChaosView(this.stage.scene,id=>id===this.myId?this.rat?.entity:this.remotes.get(id),this.stage.listener.context as AudioContext,true,(cue,origin)=>this.feedback.play(cue,origin),this.foleyWorld,this.gun.tracePresentation);
        if(this.chaos){
            this.chaos.onPresentedShot=(id,p,radius)=>this.cameos?.observeShot(id,p,radius,this.gun.sceneryClear);
            // W3: the trap's own foley where it happens: set down, SNAP with a spring twang, splinters per hit, a sad boing as it breaks.
            this.chaos.onTrap=(event,trap)=>{
                this.feedback.play(event==='set'?'trap-set':event==='snap'?'trap-snap':event==='hit'?'trap-splinter':'trap-break',trap);
                // The SNAP! where a trap catches a rat (the word always for its owner and anyone near).
                if(event==='snap')this.feel.trapSnapped(TRAP_SPOT.set(trap.x,trap.y,trap.z),this.stage.camera,trap.owner===this.myId);
            };
            this.chaos.onLanding=(p,speed)=>this.feel.landed(LANDING_POSITION.set(p.x,p.y,p.z),speed,this.stage.camera);
            this.chaos.onLauncherFired=(machine,boost)=>this.launcherFired(machine,boost);
            this.chaos.onCorpseJolt=p=>this.feel.corpseJolt(p,this.stage.camera);
            this.chaos.onMeteorWarn=(at,seconds)=>this.feel.meteorWarned(at,seconds);
            this.chaos.onMeteorImpact=at=>this.feel.meteorLanded(at,this.stage.camera);
            this.chaos.onSuperball=p=>this.feel.superballBounce(p);
            this.chaos.onCasePaper=(p,kind)=>this.feel.casePaper(p,kind);
            this.chaos.onClaim=(kind,camera,lockMs)=>this.feel.claimed(kind,this.rat?.entity,camera,lockMs);
            this.chaos.onTriggerHit=(_machine,at,busy,level)=>this.feel.triggerHit(at,busy,level,this.stage.camera);
            this.chaos.onDispatchShot=(_station,at)=>this.feel.dispatchShot(at,this.stage.camera);
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
        if (message.round.phase === 'won') {this.hud.hideRespawn();this.hud.showVictory(message.round.winnerName ?? '', message.round.kills ?? 0,{assignment:message.round.assignment,localId:this.myId,...(message.round.winnerId?{winnerId:message.round.winnerId}:{})});}
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
        // off-thread; frames skip drawing until then instead of stalling. Some drivers
        // report a link complete while the GPU still has it queued, so also wait for
        // the GPU to finish and take each new program's first use now, and upload the new
        // rats' nameplates; the first draw would otherwise freeze the page behind it.
        // Bounded: three's readiness poll can throw inside its timer (a material
        // disposed mid-link, context loss) and never settle.
        clearTimeout(this.compileTimer);
        const compiling=Promise.race([this.stage.renderer.compileAsync(this.stage.scene,this.stage.camera).then(()=>{uploadTextures(this.stage.renderer,this.stage.scene);return checkPrograms(this.stage.renderer);}),
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
                this.gun.setIncident(incident);this.feel.setIncident(incident);this.activeIncident=incident;
                // A new call: everyone reads who rang Dispatch.
                const d=message.state.dispatch,caller=d.caller&&this.lastChaos&&d.serial!==this.lastChaos.dispatch.serial?d.caller===this.myId?this.rat?.entity:this.remotes.get(d.caller):undefined;
                if(caller)this.hud.addKillFeed({kind:'dispatch',caller:caller.name,...(d.caller===this.myId?{local:true}:{})});
                // Big Cheese: every rat's pistol goes big, and big balls landing nearby thud.
                const big=incident==='big-cheese';this.rat?.entity.setBigPistol(big);
                // Most Wanted stamps the target's nameplate.
                const wanted=incident==='most-wanted'?d.wanted:undefined;
                this.rat?.entity.setWanted(!!wanted&&wanted===this.myId);
                for(const [id,{entity}] of this.remotes.rats){entity.setBigPistol(big);entity.setWanted(id===wanted);}
                if(big)this.feel.cheeseLandings(message.state.impacts,this.stage.camera);
                if(!this.observing)this.story?.apply(message.state,this.myId,id=>id===this.myId?this.rat?.entity.name:this.remotes.get(id)?.name);}
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
                if (owner) {
                    // Observers read the shooter's weapon from the buffs: the Tommy's own report, flash and brass; the Laser's zap comes with its beam.
                    const weapon=heldWeapon(this.lastChaos?.buffs,message.shooterId,Date.now()+this.serverOffset);
                    this.gun.replayShot(owner,message,weapon);this.feel.fired(message.shotId,message.origin,message.direction,false,this.stage.camera,performance.now(),weapon!==undefined);
                    if(weapon==='tommy-gun')this.feel.tommyRound(message.origin,message.direction,this.stage.camera);
                }
                break;
            }
            case 'shotResult':
                if(['first-step','ironclad-reflect','case-contact','world-bounce','dispatch-contact','pressure-contact'].includes(message.outcome))
                    this.netplay?.lap(message.shotId,message.outcome,message.compensated?`rewind:${Math.round(message.rewindMs??0)}ms`:message.fallback);
                else if(message.ballId===message.shotId)this.netplay?.end(message.shotId,message.outcome,message.compensated?`rewind:${Math.round(message.rewindMs??0)}ms/delta:${(message.targetDelta??0).toFixed(2)}`:message.fallback);
                else this.netplay?.count('shot-ball',message.outcome,message.compensated?'compensated':message.fallback);
                this.chaos?.shotResult(message);
                // W3: the Mousetrap would not go down there; it stays in your paw.
                if(message.outcome==='rejected'&&message.fallback==='trap-blocked'&&this.rat){
                    this.stage.camera.getWorldDirection(this.direction).setY(0).normalize();
                    TRAP_SPOT.copy(this.rat.entity.mesh.position).addScaledVector(this.direction,WEAPON_TUNING.trapReach);
                    this.feedback.play('trap-refused');this.feel.trapRefused(TRAP_SPOT,this.stage.camera);
                }
                break;
            case 'pickupResult':
                this.pendingInteractions.delete(message.interactionId);
                this.netplay.end(message.interactionId,message.accepted?'accepted':'rejected',message.reason);
                this.chaos?.resolveInteraction(message);
                if(message.accepted&&message.pickup==='hustle'&&!message.faulty)this.rat?.setLegs(PICKUP_TUNING.hustleMultiplier);
                break;
            case 'playerDamaged': {
                if(message.hp>0 && message.attackerId===this.myId && message.id!==this.myId){const victim=this.remotes.get(message.id);this.hud.showHitMarker(victim?victim.hp-message.hp:1);this.foley.play('hit-confirm');if(victim)this.feel.hitDealt(victim.mesh.position,this.stage.camera);}
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
                // C5: your Quick Fix refills the nameplate pips one at a time, ticking each.
                const fix = message.id === this.myId;
                entity?.heal(message.hp, fix ? this.feel.pipStagger : 0, this.pipTick);
                if (message.id === this.myId) {
                    this.chaos?.showHealing();
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
                // Kill streaks: the victim's ends; the credited killer takes the server's count.
                entity?.setStreak(0);if(killer&&killer!==entity)killer.setStreak(message.killerStreak??0);
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
                this.hud.addKillFeed(message.cause
                    ? {kind:'note',text:this.deathQuips.environmental(message.cause,message.victimName)}
                    : {kind:'kill',killer:message.killerName,victim:message.victimName,headshot,
                        ...(message.killerId===this.myId?{local:'killer' as const}:message.victimId===this.myId?{local:'victim' as const}:{})});
                break;
            }
            case 'playerRespawn':
                if (message.id === this.myId && this.rat) this.rat.setLegs(1);
                if (message.id === this.myId) {
                    this.stats?.event('respawn'); this.rat?.entity.respawn(message); this.rat?.resetGrounding(); this.feel.reset(); this.feel.health(message.hp); settleQuality();
                    // Held out of the round, then brought in (CONTINUE, a resume or the server's cap): the results go.
                    if(this.held){this.endResults();this.hud.hideVictory();}
                    this.lastInteractionPosition.set(message.x,message.y+.8,message.z);this.clearInput(); this.hud.hideRespawn();
                } else this.remotes.respawn(message.id, message);
                // All Units: the fallen arrive as backup, strobing red and blue to a prowl-car yelp; yours gets the card.
                if(this.activeIncident==='all-units'){
                    const arrived=message.id===this.myId?this.rat?.entity:this.remotes.get(message.id);
                    arrived?.backupStrobe(STORY.strobe);
                    this.story?.arrived(message,message.id===this.myId,this.stage.camera.position);
                }
                break;
            case 'playerLeft': this.remotes.remove(message.id); break;
            case 'scoreboardUpdate': this.chaos?.setScores(message.scores, this.myId); break;
            case 'gameWon': {
                this.roundWon=true;this.clearInput();this.hud.hideRespawn();
                this.awaitingContinue=!this.observing;this.continued=false;this.held=false;this.nextRoundAt=message.resetAt-this.serverOffset;
                // Polish 19: let the winning moment play in slow motion before the card slams in.
                const hold=this.feel.victory();
                if(hold>0)this.pendingVictory={message,at:performance.now()+hold*1000};
                else this.hud.showVictory(message.winnerName,message.kills,{assignment:message.assignment,awards:message.awards,report:message.report,localId:this.myId,winnerId:message.winnerId});
                // Round end: the CASE CLOSED card holds the screen, then the police lineup,
                // then the Case File and final standings for the rest of the 30 seconds.
                const won=performance.now(),entries=feelState().on('lineup')?this.lineupEntries(message):[];
                if(entries.length)this.pendingLineup={entries,at:won+(hold+ROUND_END.card)*1000};
                this.pendingResults=won+ROUND_END.results*1000;
                this.highlights.emit(this.highlights.detector.onWin(message.winnerId, performance.now()));
                break;
            }
            case 'gameReset': {
                // A reader who has not continued stays on the results while the round starts without them (the server
                // holds their rat until they continue); everyone else leaves them now.
                const keep=this.awaitingContinue&&!this.continued,pending=this.pendingVictory;
                this.pendingVictory=undefined;this.pendingLineup=undefined;this.lineup?.end();
                if(keep){
                    if(pending)this.hud.showVictory(pending.message.winnerName,pending.message.kills,{assignment:pending.message.assignment,awards:pending.message.awards,report:pending.message.report,localId:this.myId,winnerId:pending.message.winnerId});
                    this.held=true;this.heldUntil=Date.now()+READING_CAP_MS;
                    if(this.resultsShown)this.hud.setContinue({kind:'held',until:this.heldUntil});else this.showResultsBoard();
                }else this.endResults();
                this.cameos?.reset();
                this.highlights.detector.beginRound({
                    epoch: '',
                    roundId: message.round?.assignment?.roundId ?? '',
                    deliverySerial: 0,
                    owner: null,
                });
                this.highlightBaseline = true;
                this.seenHighlightLaunches.clear();
                this.highlightCorpseSeen.clear();
                this.roundWon=false;this.rat?.entity.setPowerups(0,0,0);this.rat?.entity.resetReactions();this.rat?.entity.setStreak(0);
                for(const {entity} of this.remotes.rats.values()){entity.setPowerups(0,0,0);entity.resetReactions();entity.setStreak(0);}
                this.rat?.setLegs(1);this.gun.setProtectedRats(new Set());this.clearInput();this.foleyWorld.reset();this.feel.reset();this.feel.resetRound();this.story?.reset();this.gun.clearProjectiles();this.chaos?.resetProjectiles(); if(!keep)this.hud.hideVictory(); this.hud.hideRespawn(); break;
            }
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
            const stakeout=Math.max(0,((buff?.stakeoutUntil??0)-state.time)/1000);
            entity.setPowerups(ironclad,hustle,stakeout);
            // Code Violation: a rat's dud is stamped on its nameplate, told once in the feed, and Staked Out puts it on everyone's Hunch.
            const dud=faultyOf(state.buffs,id,state.time),until=dud?buff!.faultyUntil!:0;
            // A rat held in a Mousetrap shows HELD on its nameplate.
            entity.setDud(trapped(state.buffs,id,state.time)?'HELD':dud&&FAULTY_COPY[dud].title);entity.exposed=dud==='stakeout';
            if(dud&&until!==this.dudsSeen.get(id)&&this.dudsPrimed){
                const {title,effect}=FAULTY_COPY[dud],mine=id===this.myId;
                this.hud.addKillFeed({kind:'note',text:`CODE VIOLATION · ${mine?'YOU':entity.name.toUpperCase()}: ${title}${mine?'':`, ${effect}`}`});
            }
            this.dudsSeen.set(id,until);
            if(ironclad>0&&!entity.dead)protectedRats.add(entity);
        };
        if(this.rat)apply(this.myId,this.rat.entity);
        for(const [id,{entity}] of this.remotes.rats)apply(id,entity);
        this.gun.setProtectedRats(protectedRats);this.dudsPrimed=true;
        // Hot Pursuit, or a Code Violation dud's slow, pin or no-jump: the same rule every bot's legs follow.
        this.rat?.setLegs(legScale(state.buffs,this.myId,state.time),jumpBlocked(state.buffs,this.myId,state.time));
    }

    private sendMovement(now: number): void {
        if (this.observing || !this.rat || this.rat.entity.dead || this.rat.entity.hp <= 0 || now - this.lastMovementAt < 50) return;
        const { position: p, quaternion: q } = this.rat.entity.body;
        const mq = this.rat.entity.mesh.quaternion,a=this.lookDirection(),c=this.rat.tally;
        const pose=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,mq.x,mq.y,mq.z,mq.w,a.x,a.y,a.z,c.f,c.r];
        // A press or key change is sent even while the pose holds still (a tap between two sends).
        if (!c.pending && pose.every((value,i)=>value===this.lastMovement[i]) && now-this.lastMovementAt<1_000) return;
        const movement=this.movementInput();if(!movement)return;
        const message: ClientMessage = { type: 'updateMovement', ...movement };
        if (this.transport.send(message)) this.rememberMovement(movement,now,pose);
    }

    private lookDirection():THREE.Vector3 {
        const a=this.stage.camera.getWorldDirection(this.aim);
        return a.set(Math.round(a.x*1000)/1000,Math.round(a.y*1000)/1000,Math.round(a.z*1000)/1000);
    }

    /** The pose, look and controls pressed since the last send (sent counts are cleared by `rememberMovement`). */
    private movementInput():MovementInput|undefined {
        if(!this.rat)return;
        const {position:p,quaternion:q}=this.rat.entity.body,mq=this.rat.entity.mesh.quaternion??q,a=this.lookDirection(),c=this.rat.tally;
        this.movementSequence=(this.movementSequence??0)+1;
        return{seq:this.movementSequence,position:{x:p.x,y:p.y,z:p.z},rotation:{x:q.x,y:q.y,z:q.z,w:q.w},
            meshRotation:{x:mq.x,y:mq.y,z:mq.z,w:mq.w},aim:{x:a.x,y:a.y,z:a.z},controls:{f:c.f,r:c.r,j:c.j,fx:c.fx,rx:c.rx}};
    }
    private rememberMovement(movement:MovementInput,now:number,pose?:number[]):void {
        const p=movement.position,q=movement.rotation,mq=movement.meshRotation,a=movement.aim,c=movement.controls;
        this.lastMovement=pose??[p.x,p.y,p.z,q.x,q.y,q.z,q.w,mq.x,mq.y,mq.z,mq.w,a?.x??0,a?.y??0,a?.z??0,c?.f??0,c?.r??0];this.lastMovementAt=now;
        this.rat?.tally.clear();
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
            if(!this.touch?.active)this.heldFire.tick(now,this.tommyRepeatMs(),this.fireRound);
            this.feel.tommyHeld(this.heldFire.active||!!this.touch?.input.holding);
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
        this.chaos?.setFixXray(!this.observing&&this.feel.fixXray);
        this.chaos?.update(dt*this.feel.timeScale,camera,this.feel.presentTime(performance.now()));
        if(this.pendingVictory&&now>=this.pendingVictory.at){
            const won=this.pendingVictory.message;this.pendingVictory=undefined;
            if(this.roundWon)this.hud.showVictory(won.winnerName,won.kills,{assignment:won.assignment,awards:won.awards,report:won.report,localId:this.myId,winnerId:won.winnerId});
        }
        if(this.transport.state==='playing'&&!document.hidden)this.cameos?.update(this.cameoVisitors,this.gun.sceneryClear);
        this.blackoutFrame(camera);
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
        this.story?.update(camera,this.rat&&!this.rat.entity.dead?this.rat.entity.mesh.position:undefined);
        if(this.pendingResults!==undefined&&now>=this.pendingResults&&this.roundWon)this.showResultsBoard();
        if(this.pendingLineup&&now>=this.pendingLineup.at){this.lineup?.start(this.pendingLineup.entries);this.feel.endDeathCamera(camera);this.pendingLineup=undefined;}
        if(this.lineup?.active)this.lineup.update(dt,camera,flashlight);
        if(!this.compiling){
            renderer.toneMappingExposure=this.baseExposure;
            this.feel.beforeRender(camera);
            this.stats?.gpu.begin();
            renderer.render(scene, camera);
            this.stats?.gpu.end();
            this.feel.afterRender(camera);
            if(this.transport.state==='playing')qualityFrame(now);
        }
        // The prepared stand-ins live until the session ends: their programs (round-end lineup
        // rats, powerups, the Hunch sketch) would otherwise be released here and relinked in play.
        if(this.rat && this.transport.state==='playing' && !this.playFrameMarked && !this.compiling){
            this.playFrameMarked=true;
            performance.mark('city-first-play-frame');
            // A full build's city bake is stored now, when idle, off the load's critical path.
            if(this.city instanceof Neighborhood)this.city.saveBake();
        }
        this.stats?.record(frameMs, now, this.worldSpec,{simulationMs:simulationEnd-start,botsMs,presentationMs:presentationEnd-simulationEnd,renderMs:performance.now()-presentationEnd},{network:this.transport.getDiagnostics(),netplay:this.netplay.snapshot(),remoteTiming:this.remotes.timingDiagnostics(),shotsAttempted:this.shotsAttempted,shotsSent:this.shotsSent,chaos:this.diagnosticChaos,snapshotAgeMs:this.diagnosticChaos.receivedAt?Date.now()-this.diagnosticChaos.receivedAt:null,projectiles:this.chaos?.getDiagnostics()});
        if(this.transport.state==='playing'&&!this.observing)this.perf.frame(frameMs,performance.now()-now);
        this.frame = requestAnimationFrame(time => this.animate(time));
    }

    /** Blackout: your flashlight narrows to a hard, intense beam, the street light pool carries the four nearest rats'
     * copies of it, the city's own lights follow the power, and only rats in your beam show their nameplates. */
    private blackoutFrame(camera:THREE.Camera):void {
        const level=this.feel.blackoutLevel,{flashlight}=this.stage,p=FEEL.blackout.params,base=FLASHLIGHT;
        // The round-end lineup owns the flashlight's intensity (it reads the everyday one) once it is on its way.
        const lineup=!!this.pendingLineup||!!this.lineup?.active,shape=lineup?0:level;
        flashlight.angle=base.angle+(p.angle-base.angle)*shape;flashlight.penumbra=base.penumbra+(p.penumbra-base.penumbra)*shape;
        flashlight.decay=base.decay+(p.decay-base.decay)*shape;flashlight.distance=base.distance+(FLASHLIGHT_REACH-base.distance)*shape;
        if(!lineup)flashlight.intensity=base.intensity+(p.beam-base.intensity)*level;
        // The beam points where you aim: at the crosshair, out to its reach (every day it lights the ground ahead).
        if(shape>0&&this.rat)flashlight.target.position.lerp(this.beamAim.copy(camera.position).addScaledVector(this.direction,FLASHLIGHT_REACH),shape);
        if(this.city instanceof Neighborhood){this.city.power=this.feel.power;this.city.streetLights?.flashlights(flashlight,camera.position,this.remotes.rats,level*p.beam);}
        if(level<=0&&this.plateDark<=0)return;
        this.plateDark=level;
        const from=flashlight.position,to=flashlight.target.position,ax=to.x-from.x,ay=to.y-from.y,az=to.z-from.z;
        const aim=Math.sqrt(ax*ax+ay*ay+az*az)||1,cone=Math.cos(flashlight.angle);
        for(const {entity} of this.remotes.rats.values()){
            const p=entity.mesh.position,dx=p.x-from.x,dy=p.y+1.2-from.y,dz=p.z-from.z,d=Math.sqrt(dx*dx+dy*dy+dz*dz);
            entity.billboard.light=d<flashlight.distance&&dx*ax+dy*ay+dz*az>=cone*d*aim?1:1-level;
        }
    }

    /** The round-end results board takes the screen; a reader gets the mouse back to read it (pointer lock released). */
    private showResultsBoard():void {
        this.pendingResults=undefined;this.resultsShown=true;this.resultsShownAt=performance.now();
        if(this.awaitingContinue&&!this.continued)this.hud.setContinue(this.held?{kind:'held',until:this.heldUntil}:{kind:'reading'});
        this.hud.showResults(true);this.scoreboard.setVisible(true);
        if(this.reading&&document.pointerLockElement)document.exitPointerLock();
    }
    /** A reader on the results board, still to CONTINUE. */
    private get reading():boolean { return this.resultsShown&&this.awaitingContinue&&!this.continued; }
    /** CONTINUE (button or key): tell the room, and take the mouse back for play. Before the next round starts the board
     * waits for it with everyone; once it is under way without you, the board goes and the room brings your rat in. */
    private continueFromResults():void {
        if(!this.reading)return;
        this.transport.send({type:'ready'});
        if(this.held){this.endResults();this.hud.hideVictory();}
        else{this.continued=true;this.hud.setContinue({kind:'ready',until:this.nextRoundAt});}
        this.requestPointerLock();
    }
    /** Leave the round-end results board (reset, reconnect, leaving play, CONTINUE); `closeBoard` returns the standings to the live round. */
    private endResults(closeBoard=true):void {
        const shown=this.resultsShown;this.pendingResults=undefined;this.resultsShown=false;
        this.awaitingContinue=false;this.continued=false;this.held=false;
        if(closeBoard)this.scoreboard.closeResults();
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
        if(next.case?.owner===this.myId&&previous.case?.owner!==this.myId){this.feel.sting('case');this.feel.caseClaimed(this.rat?.entity);}
        const before=previous.assignment,after=next.assignment;
        if(!before||!after||before.roundId!==after.roundId)return;
        if((after.deliverySerial??0)>(before.deliverySerial??0)&&after.lastDelivery?.playerId===this.myId)this.feel.sting('delivery');
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
        // A hard shove (Scattershot, a meteor) is felt like a small launch: the scream, and your view kicks.
        for(const shove of state.pressure?.shoves??[]){
            if(this.feltLaunches.has(shove.id)||Math.hypot(shove.velocity.x,shove.velocity.z)<HARD_SHOVE)continue;
            this.feltLaunches.add(shove.id);
            if(this.feltLaunches.size>64)this.feltLaunches.delete(this.feltLaunches.values().next().value!);
            const local=shove.playerId===this.myId,entity=local?this.rat?.entity:this.remotes.get(shove.playerId);
            if(entity&&!entity.dead&&state.time-shove.at<500)this.feel.launched(entity.mesh.position,local,false,this.stage.camera);
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
        this.foleyWorld.dispose();this.foley.dispose();this.feel.dispose();this.story?.dispose();this.lineup?.dispose();clearTimeout(this.compileTimer);
        disposeEntitySounds();
        this.stats?.dispose();
        this.stage.dispose();
    }
}
