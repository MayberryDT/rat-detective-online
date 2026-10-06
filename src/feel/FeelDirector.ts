import {HeavyCheese} from './HeavyCheese';
import * as THREE from 'three';
import type {IncidentId} from '../shared/incidentCatalog';
import {RAT_BLACKOUT,type RatEntity} from '../entities/RatEntity';
import type {DeathStyle} from '../utils/RatAnimator';
import {CameraFeel} from './CameraFeel';
import {ScreenFeel} from './ScreenFeel';
import {NoirAudio} from './NoirAudio';
import {Dust,registerDust} from './Dust';
import {badRound} from '../shared/shotPattern';
import {BAD_AMMO,type BadRound} from '../shared/shotBallistics';
import type {Vec3Data} from '../shared/networkProtocol';
import {CityReactions,registerCity} from './CityReactions';
import {NoirCity} from './NoirCity';
import {NoirRain} from './NoirRain';
import {NoirAtmosphere} from './NoirAtmosphere';
import {NoirDressing} from './NoirDressing';
import type {StreetLampPosition} from '../shared/streetLampLayout';
import {FeelSound,spaceAt,type FootstepSource} from './FeelSound';
import type {Sting} from './FeelAudio';
import {type ChaosShot} from '../shared/chaosState';
import {playHic,playSynth} from '../audio/IncidentAudio';
import {MAX_HP} from '../shared/networkProtocol';
import {feelState,type FeelState} from './feelState';
import {FEEL} from './feelTuning';
import {GRAPHICS} from '../session/graphicsQuality';
import {Hunch,type HunchRat} from './Hunch';
import {WantedSearchlight} from './WantedSearchlight';
import {registerSupplyCues} from './supplyCues';
import {LaunchJuice} from './LaunchJuice';
import {TommyJuice} from './TommyJuice';
import {LampAlarm} from './LampAlarm';
import type {LaunchMachineKind} from '../shared/chaosState';
import type {PickupKind,WeaponKind} from '../shared/pickups';
import type {FeedbackCue} from '../audio/FeedbackAudio';
import {reducedMotion} from '../ui/motion';
import {pickupArtwork} from '../prototype/pickupArtwork';
import {CarrierFeel} from './CarrierFeel';
import type {CaseState} from '../shared/chaosState';
/** C1: each supply's claim flash colour: silver Ironclad, red Hot Pursuit, green Quick Fix, cold lens cyan Stakeout; the
 * arsenal's orange Tommy Gun, the Laser's greasy cheesy yellow-green and the Mousetrap's pale pine. */
const CLAIM_INK:Record<PickupKind,string>={ironclad:'#c9d3de',hustle:'#d9473a','quick-fix':'#5fc884',stakeout:'#7ad8e8','tommy-gun':'#e8873e',laser:'#c8f040',mousetrap:'#e6dcc4'};
/** C4: Hot Pursuit claim dust, a multiplier on the grey dust colour. */
const CLAIM_DUST=new THREE.Color(3.2,.42,.26);
/** Bad Ammunition: the word over your own ball, by its personality. */
const BAD_WORDS:Record<BadRound,string>={corkscrew:'WHEEE!',snake:'WIGGLE!',superball:'BOING!',floater:'PFFFT.',hiccup:'HIC!'};

/** One entry point from game events to presentation-only feel effects.
 * GameSession calls it at existing event sources; channels never parse
 * network messages themselves. */
export class FeelDirector {
    private heavy?:HeavyCheese;
    /** Review opt-in only. Normal sessions never call this. */
    enableHeavyCheese(scene:THREE.Scene):void {this.heavy?.dispose();this.heavy=new HeavyCheese(scene);}
    heavyArsenal(kind:'laser'|'tommy-gun'|'mousetrap'|'pickup'|'trap-snap'|'trap-release'|'laser-hit'|'tommy-hit'|'laser-pickup'|'tommy-pickup'|'trap-pickup'):void {if(this.heavy)this.sound.arsenal(kind);}
    heavyPickup(kind:string):void {this.heavy?.pickup(kind);}
    heavyWeaponImpact(at:THREE.Vector3,normal:THREE.Vector3,weapon:string):void {this.heavy?.weaponHit(at,normal,weapon);}
    heavyBeforeRender(rat:THREE.Object3D):void {this.heavy?.beforeRender(rat);}
    heavyAfterRender():void {this.heavy?.afterRender();}
    heavyReport():void {if(this.heavy)this.sound.pressure();}
    heavyWeaponLaunch(origin:THREE.Vector3,direction:THREE.Vector3,weapon?:string):void {this.heavy?.launchWeapon(origin,direction,weapon);}
    heavyLaunch(origin:THREE.Vector3,direction:THREE.Vector3):void {this.heavy?.launch(origin,direction);}
    heavyImpact(at:THREE.Vector3,normal:THREE.Vector3,target:THREE.Object3D):void {if(this.heavy){this.sound.bodySmack();this.heavy.hit(at,normal,target);}}
    readonly camera:CameraFeel;
    readonly screen:ScreenFeel;
    readonly sound:FeelSound;
    private incident?:IncidentId;
    private readonly killTimes:number[]=[];
    private lastWordAt=-Infinity;
    private danger=0;
    private dangerTarget=0;
    private flood=0;
    private noirAudio?:NoirAudio;
    private colourFilter=true;
    private deathTarget?:()=>THREE.Vector3|undefined;
    private deathAge=0;
    private dust?:Dust;
    /** The live scene its dust and supply cues are registered on. */
    private scene?:THREE.Scene;
    private launchJuice?:LaunchJuice;
    /** Thrown cases being watched for the whistle (true once it played) until they land. */
    private readonly fallingCases=new Map<string,boolean>();
    private hunchView?:Hunch;
    private searchlight?:WantedSearchlight;
    private wasWanted=false;
    private city?:CityReactions;
    private noirCity?:NoirCity;
    private noirRain?:NoirRain;
    private noirAtmosphere?:NoirAtmosphere;
    private noirDressing?:NoirDressing;
    private lampAlarm?:LampAlarm;
    private lifeKills=0;
    private lastCalloutAt=-Infinity;
    private slowAge=Infinity;
    private lag=0;
    private wasGrounded=true;
    private airVy=0;
    private flying=false;
    private pursuit=0;
    /** C4: seconds of Hot Pursuit claim speed lines left. */
    private claimStreaks=0;
    /** W1: muzzle flashes and casings for every Tommy, and whether your trigger is held (the rattle). */
    private tommy?:TommyJuice;
    private rattle=false;
    /** Edited feedback cues (Stakeout claim shutters, Quick Fix pip ticks), wired by the session. */
    cue?:(cue:FeedbackCue)=>void;
    /** Blackout: eased power-off level, and the brief lift from nearby muzzle flashes. */
    private blackout=0;
    private muzzleFlash=0;
    /** P4: seconds into the current Pressure Surge, and the lights' flicker from its latest pulse. */
    private surgeAge=0;
    private surgeFlicker=0;
    private dark=0;
    /** The last rendered view, for placing world cues raised outside the frame loop. */
    private view?:THREE.Camera;
    private readonly impulse=new THREE.Vector3();
    private readonly up=new THREE.Vector3();
    private readonly inverse=new THREE.Quaternion();
    /** K3: the hot case's carrier feel (yours only). */
    private readonly carrier:CarrierFeel;
    constructor(readonly state:FeelState=feelState(),private readonly doc:Document|undefined=globalThis.document){
        this.camera=new CameraFeel(()=>this.state.shake());
        this.screen=new ScreenFeel(()=>this.state.flash(),doc);
        this.sound=new FeelSound(this.state);
        this.carrier=new CarrierFeel(this.state,this.screen);
    }
    /** Connect the game canvas (colour drain) and audio listener (muffle, heartbeat). */
    attach(canvas:HTMLElement,listener?:THREE.AudioListener,touch=false):void {
        this.screen.attachCanvas(canvas);
        if(listener){this.noirAudio=new NoirAudio(listener);this.sound.attach(listener.context);this.carrier.attach(listener.context);}
        // Phones skip the full-canvas colour filter; the vignette and audio remain.
        this.colourFilter=!touch;
    }

    /** Scene-wide dust for every rat's landings, skids and launches. */
    attachScene(scene:THREE.Scene):void {
        if(this.scene){registerDust(this.scene,undefined);registerSupplyCues(this.scene,undefined);}
        this.scene=scene;
        this.dust?.dispose();this.dust=new Dust(scene);registerDust(scene,this.dust);
        this.launchJuice?.dispose();this.launchJuice=new LaunchJuice(scene);
        this.tommy?.dispose();this.tommy=new TommyJuice(scene);
        this.hunchView?.dispose();this.hunchView=new Hunch(scene,this.state,this.sound);this.hunchView.onReveal=()=>this.cue?.('stakeout-shutter');
        this.searchlight?.dispose();this.searchlight=new WantedSearchlight(scene);
        registerSupplyCues(scene,(cue,at)=>{if(this.view)this.sound.supply(cue,at,this.view);});
    }
    /** Most Wanted each frame: the searchlight follows `target` (the leader's feet);
     * `me` when the leader is you, which gets its own callout. */
    wanted(dt:number,target:THREE.Vector3|undefined,me:boolean):void {
        this.searchlight?.update(dt,target);
        if(me&&!this.wasWanted){this.lastCalloutAt=-Infinity;this.callout('YOU ARE MOST WANTED');this.sound.sting('case');}
        this.wasWanted=me;
    }
    /** The Hunch each frame; `self` only while your rat is alive and in play. */
    hunch(dt:number,now:number,view:THREE.Camera,self:RatEntity|undefined,rats:ReadonlyMap<string,HunchRat>,wanted?:string):void {this.hunchView?.update(dt,now,view,self,rats,wanted);}

    /** Cosmetic reactive props for the current city (replaced on a new world). */
    attachCity(scene:THREE.Scene,lamps:readonly StreetLampPosition[]):void {
        this.city?.dispose();this.city=new CityReactions(scene,lamps);registerCity(this.city);
        // Collect city materials now, before rats, cases and pickups exist.
        this.noirCity?.dispose();this.noirCity=new NoirCity(scene);
        this.noirAtmosphere?.dispose();this.noirAtmosphere=new NoirAtmosphere(scene,lamps);
        this.noirDressing?.dispose();this.noirDressing=new NoirDressing(scene);
        this.lampAlarm?.dispose();this.lampAlarm=new LampAlarm(scene,lamps);
        this.noirRain?.dispose();this.noirRain=new NoirRain(scene,lamps,Math.round(this.colourFilter?FEEL.noirRain.params.drops:FEEL.noirRain.params.phoneDrops));
        // Blackout also kills the neon, haze, searchlights and wet-street reflections.
        for(const root of [this.noirAtmosphere.root,this.noirDressing.root,this.noirRain.root])this.noirCity.adopt(root);
    }
    /** Force a lightning strike (workshop review). */
    lightning():void {this.noirAtmosphere?.strike();}
    /** New round: props back where they started. */
    resetRound():void {this.city?.reset();this.slowAge=Infinity;this.lag=0;}

    /** Local rat motion each frame: landing dip, launch view, Hot Pursuit streaks. */
    motion(dt:number,grounded:boolean,verticalSpeed:number,horizontalSpeed:number,speedScale:number,carrying=false):void {
        const on=this.state.on('movement'),p=FEEL.movement.params;this.screen.crosshairMotion(horizontalSpeed);
        let landed=0;
        if(!grounded){this.airVy=Math.min(this.airVy,verticalSpeed);if(verticalSpeed>30)this.flying=true;}
        if(grounded&&!this.wasGrounded){
            landed=-this.airVy;
            if(on&&this.airVy<-8){
                const strength=Math.min(1,(-this.airVy-8)/25);
                this.camera.kick(p.dip*strength);this.camera.push(this.impulse.set(0,p.dipPush*strength,0));
            }
            this.airVy=0;this.flying=false;
        }
        this.wasGrounded=grounded;
        const target=on&&speedScale>1&&horizontalSpeed>10?1:0;
        this.pursuit+=(target-this.pursuit)*(1-Math.exp(-7.7*Math.max(0,dt)));
        if(this.pursuit<.01)this.pursuit=0;
        this.camera.hold(!on?0:this.flying?p.launchWiden:this.pursuit*p.pursuitWiden);
        // Launcher flight streaks the screen by airspeed, like a Hot Pursuit sprint.
        const flightStreaks=this.flying&&this.state.on('launchFlight')?Math.min(1,Math.hypot(horizontalSpeed,verticalSpeed)/55)*FEEL.launchFlight.params.streaks:0;
        this.claimStreaks=Math.max(0,this.claimStreaks-Math.max(0,dt));
        const claimStreaks=this.claimStreaks>0?Math.min(1,this.claimStreaks/FEEL.claimHustle.params.streaks*2):0;
        this.screen.speed(Math.max(this.pursuit*p.streaks,flightStreaks,claimStreaks));
        this.sound.localMotion(horizontalSpeed,landed,carrying,this.flying?Math.min(1,Math.hypot(horizontalSpeed,verticalSpeed)/45):0);
    }

    /** Footsteps for your rat (id `self`) and nearby rats. */
    footsteps(dt:number,sources:readonly FootstepSource[],self:THREE.Vector3|undefined,view:THREE.Camera):void {
        this.sound.footsteps(dt,sources,self,view);
        this.city?.proximity(sources);
    }
    /** Near-miss whizz for other rats' balls. */
    /** Near-miss whizzes; true when a ball just passed your head. */
    projectiles(shots:readonly ChaosShot[],myId:string,head:THREE.Vector3,view:THREE.Camera):boolean {return this.sound.projectiles(shots,myId,head,view);}
    /** Case pickup, your delivery. Your own take of the case gets the K1 stamp instead of the plain callout. */
    sting(kind:Sting):void {
        this.sound.sting(kind);
        if(kind==='case'&&!this.state.on('caseClaim'))this.callout('ON THE CASE');
    }
    /** K1: you took the case: the ON THE CASE stamp and paper burst, a brass edge flash, a punch-in, a kick and a squash of your rat. */
    caseClaimed(self:RatEntity|undefined):void {
        if(!this.state.on('caseClaim'))return;
        const p=FEEL.caseClaim.params;
        this.screen.caseClaim(p.sheets,p.flash);
        this.camera.widen(-p.punch);this.camera.kick(p.kick,(Math.random()*2-1)*p.kick*.4);
        if(self&&!self.dead&&!reducedMotion())self.squashPop(p.squash);
    }
    /** K3, each frame: `mine` is the buffed hot case you carry (null when you do not, or are dead), `now` the chaos view's
     * server time, `urgency` its nearness to scoring (0…1): the ping's red edge and your heartbeat. */
    hotCase(mine:CaseState|null,now:number,urgency:number):void {this.carrier.update(mine,now,urgency);}
    /** K3: a kill while carrying healed you (heal cause `case-kill`): the heartbeat surges, CASE CLOSED · HEALED. */
    caseKillHealed():void {this.carrier.healed();}
    /** K3: a buffed carrier fired (`origin` for another rat's, placed in the world; yours at full): the low thump
     * under its shot. */
    carrierShot(origin?:Vec3Data):void {if(this.state.on('hotCase'))playSynth('thump',origin,1,FEEL.hotCase.params.thump);}
    /** K1, everyone: the case bursts paperwork where it is taken, knocked loose or shot. */
    casePaper(at:Vec3Data,kind:'taken'|'loose'|'kick'):void {
        if(!this.state.on('caseClaim'))return;
        const p=FEEL.caseClaim.params;
        this.launchJuice?.spill(this.impulse.set(at.x,at.y+.3,at.z),kind==='kick'?p.kickPaper:kind==='loose'?Math.round(p.paper*.6):p.paper);
    }
    /** C1–C4: your own supply claim (other rats' claims keep only their world effects): an edge flash in the supply's colour,
     * a punch-in, a small kick and a squash-and-pop, then the supply's signature. The card flight and Ironclad sparks are ChaosView's.
     * W3: a Mousetrap just taken (`lockMs` of its trigger lockout left) gets the TRAP IN PAW moment and a heave of the view. */
    claimed(kind:PickupKind,self:RatEntity|undefined,view:THREE.Camera,lockMs=0):void {
        if(!self||self.dead)return;
        const widens=kind==='hustle'&&this.state.on('claimHustle');
        if(this.state.on('claimMoment')){
            const p=FEEL.claimMoment.params;
            this.screen.claim(CLAIM_INK[kind],p.flash);
            // Hot Pursuit widens instead of punching in.
            if(!widens)this.camera.widen(-p.punch);
            this.camera.kick(p.kick,(Math.random()*2-1)*p.kick*.4);
            if(!reducedMotion())self.squashPop(p.squash);
        }
        if(kind==='stakeout'&&this.state.on('claimStakeout')){
            this.screen.stakeout(self.mesh.position,view,FEEL.claimStakeout.params.lens);
            this.hunchView?.reveal();
        }else if(kind==='ironclad'&&this.state.on('claimIronclad')){
            const p=FEEL.claimIronclad.params;
            this.camera.kick(p.dip);this.camera.push(this.impulse.set(0,p.push,0));
            self.shine(p.shine);
        }else if(widens){
            const p=FEEL.claimHustle.params;
            this.camera.widen(p.widen);
            if(!reducedMotion())this.claimStreaks=p.streaks;
            this.dust?.puff(self.mesh.position,p.dust,CLAIM_DUST);
        }else if(kind==='mousetrap'&&lockMs>0&&this.state.on('mousetrap')){
            const p=FEEL.mousetrap.params;
            this.screen.trapInPaw(pickupArtwork('mousetrap'),lockMs,p.inPaw);
            this.camera.kick(-p.heave,(Math.random()*2-1)*p.heave*.3);
        }
    }
    /** C5: seconds between your nameplate's restored pips refilling on a Quick Fix (0: all at once). */
    get pipStagger():number {return this.state.on('claimQuickFix')&&!reducedMotion()?FEEL.claimQuickFix.params.pip:0;}

    private callout(text:string,now=performance.now()):void {
        if(!this.state.on('rewards')||now-this.lastCalloutAt<FEEL.rewards.params.calloutCooldown*1000)return;
        this.lastCalloutAt=now;this.screen.callout(text);
    }

    /** The round was won: start the presentation slow-motion. Returns how long
     * (seconds) to hold the victory card so the moment plays first; 0 when off. */
    victory():number {
        if(!this.state.on('rewards')||this.state.shake()<=0)return 0;
        this.slowAge=0;return FEEL.rewards.params.slowmo;
    }
    /** Presentation clock for remote rats and chaos playback: runs slow during
     * the victory moment, then catches up. Authority and local controls are unaffected. */
    presentTime(realNow:number):number {return realNow-this.lag;}
    /** Presentation dt scale matching `presentTime`. */
    get timeScale():number {return this.slowAge<FEEL.rewards.params.slowmo?FEEL.rewards.params.slowRate:this.lag>0?1+FEEL.rewards.params.catchup:1;}
    /** You made a Crossfire bank kill: a moment (`rewards.bank` seconds) of the victory slow-motion, unless a longer one is running. */
    bankShot():void {
        const r=FEEL.rewards.params;
        if(this.state.on('rewards')&&this.state.shake()>0)this.slowAge=Math.min(this.slowAge,r.slowmo-r.bank);
    }

    /** Authoritative local health changed; `healed` floods colour back. */
    health(hp:number,healed=false):void {
        const previous=this.dangerTarget;this.hp=hp;
        // Linear from max HP (clear) to the last hit point (full danger).
        this.dangerTarget=hp>=MAX_HP?0:hp<=1?1:(MAX_HP-hp)/(MAX_HP-1);
        if(healed&&previous>0&&this.dangerTarget<previous)this.flood=1;
    }
    private hp=MAX_HP;

    /** Your last hit point (or dead): case markers hide. */
    get lastHitPoint():boolean {return this.state.on('lastHitPoint')&&this.hp<=1;}
    /** Two hit points or fewer: Quick Fix kits show through walls. */
    get fixXray():boolean {return this.state.on('lastHitPoint')&&this.hp<=2;}
    /** Noir perception scale: the full-health hint at every health (low health fades to black and white instead); full without T2. */
    private perception():number {return this.state.on('noirByHealth')?FEEL.noir.params.clear:1;}
    /** Low-health black and white, 0 (colour) … 1 (last hit point). */
    private mono():number {return this.state.on('noirByHealth')?this.danger:0;}

    /** The active Dispatch incident, for effects that scale with heavier volleys. */
    setIncident(incident?:IncidentId):void {
        this.incident=incident;
        const blackout=incident==='blackout';
        if(this.noirAtmosphere)this.noirAtmosphere.blackout=blackout;
        // Blackout: the HUD goes black and white (feel.css).
        this.doc?.body.classList.toggle('blackout',blackout);
    }
    /** The city's own lights, 0…1: out in a Blackout (a nearby muzzle flash lifts them for a blink), stuttering in a Pressure Surge. */
    get power():number {return 1-this.dark;}
    /** How far a Blackout has set in, 0…1: every rat's flashlight takes over from the city's lights. */
    get blackoutLevel():number {return this.blackout;}

    /** A local shot left the muzzle; a held special weapon has its own kick (a Mousetrap press has none). */
    shot(weapon?:WeaponKind):void {
        if(weapon==='mousetrap')return;
        this.screen.crosshairKick();
        if(weapon==='tommy-gun'||weapon==='laser'){
            const tommy=weapon==='tommy-gun',on=this.state.on(tommy?'tommyGun':'laser');
            if(!on)return;
            const kick=tommy?FEEL.tommyGun.params.kick:FEEL.laser.params.kick,push=tommy?FEEL.tommyGun.params.push:FEEL.laser.params.push;
            this.camera.kick(kick*(.75+Math.random()*.5),(Math.random()*2-1)*kick*(tommy?FEEL.tommyGun.params.yaw:.25));
            this.camera.push(this.impulse.set((Math.random()*2-1)*push*.4,0,push));
            return;
        }
        if(!this.state.on('shotKick'))return;
        const p=FEEL.shotKick.params;
        const blast=this.incident==='scattershot',scale=blast?p.scattershot:1;
        this.camera.kick(p.pitch*scale,(Math.random()*2-1)*p.yawJitter*p.pitch*scale);
        this.camera.push(this.impulse.set(0,0,p.push*scale));
        // Scattershot: the shotgun's punch, a field-of-view thump with the kick.
        if(blast)this.camera.widen(p.scatterWiden);
    }
    /** W1, each frame: your Tommy's trigger is held (its rounds rattle the view between kicks). */
    tommyHeld(held:boolean):void {this.rattle=held&&this.state.on('tommyGun');}
    /** W1: any rat's Tommy round within range: muzzle flash and a flung casing. */
    tommyRound(origin:Vec3Data,direction:Vec3Data,view:THREE.Camera):void {
        if(!this.state.on('tommyGun'))return;
        const reach=FEEL.tommyGun.params.range;
        if(Math.hypot(origin.x-view.position.x,origin.y-view.position.y,origin.z-view.position.z)<reach)this.tommy?.fired(origin,direction);
    }
    /** W3: your trap would not go down here: a small shake and the word, at the spot you tried. */
    trapRefused(at:THREE.Vector3,view:THREE.Camera,now=performance.now()):void {
        if(!this.state.on('mousetrap'))return;
        const s=FEEL.mousetrap.params.refuse;
        this.camera.kick(-s,(Math.random()*2-1)*s);
        this.word('NO ROOM.',at,view,now,true);
    }
    /** W3: a trap snapped a rat at `at` (`involved` when it was yours or you): SNAP!, and a jolt nearby. */
    trapSnapped(at:THREE.Vector3,view:THREE.Camera,involved:boolean,now=performance.now()):void {
        if(!this.state.on('mousetrap'))return;
        const p=FEEL.mousetrap.params,d=at.distanceTo(view.position);
        if(d<p.snapRange){const s=1-d/p.snapRange;this.camera.kick(-p.snap*s,(Math.random()*2-1)*p.snap*s*.6);}
        if(involved||d<p.snapRange*2)this.word('SNAP!',at,view,now,true);
    }

    /** Bad Ammunition, per trigger (`plain` when a special weapon fired it instead): a puff of muzzle smoke and the
     * ball's personality sound for everyone near (a corkscrew's drill, a snake's slide whistle, a superball's boing, a
     * floater's lazy kazoo, a hiccup's HIC! where it stops); your own also gets its word. */
    fired(shotId:string,origin:Vec3Data,direction:Vec3Data,local:boolean,view:THREE.Camera,now=performance.now(),plain=false):void {
        // Blackout: a shot nearby lights the street for a blink.
        if(this.incident==='blackout'){
            const d=Math.hypot(origin.x-view.position.x,origin.y-view.position.y,origin.z-view.position.z),reach=FEEL.blackout.params.muzzleRange;
            if(d<reach)this.muzzleFlash=Math.max(this.muzzleFlash,FEEL.blackout.params.muzzle*(1-d/reach));
        }
        if(plain||this.incident!=='bad-ammunition'||!this.state.on('badAmmo'))return;
        const quirk=badRound(shotId),p=FEEL.badAmmo.params,muzzle=new THREE.Vector3(origin.x,origin.y,origin.z);
        const aim=new THREE.Vector3(direction.x,direction.y,direction.z).normalize();
        this.dust?.smoke(muzzle,aim,p.smoke);
        if(quirk==='hiccup'){
            // It hangs in the air where it stops, the hiccup's own spot along the aim.
            const at=muzzle.clone().addScaledVector(aim,BAD_AMMO.hiccup.speed*BAD_AMMO.hiccup.stopAt);
            setTimeout(()=>{playHic(at);if(local&&this.view)this.word('HIC!',at,this.view,performance.now(),true);},BAD_AMMO.hiccup.stopAt*1000);
            return;
        }
        playSynth(quirk==='superball'?'boing':quirk,local?undefined:origin,quirk==='superball'?p.superballPitch:1,p.volume);
        if(local)this.word(BAD_WORDS[quirk],muzzle.addScaledVector(aim,4),view,now,true);
    }
    /** Bad Ammunition: a superball struck a wall or floor at `at`. */
    superballBounce(at:Vec3Data):void {
        if(this.state.on('badAmmo'))playSynth('boing',at,FEEL.badAmmo.params.superballPitch*(.9+Math.random()*.2),FEEL.badAmmo.params.volume*.7);
    }
    /** You took nonlethal damage. `from` is the attacker's live position when known. */
    hurt(damage:number,victim:THREE.Vector3,from:THREE.Vector3|undefined,view:THREE.Camera):void {
        if(this.state.on('damageDirection'))this.screen.damage(from,damage);
        this.sound.squelch(undefined,view);
        if(!this.state.on('hitJolt'))return;
        const p=FEEL.hitJolt.params,scale=1+Math.max(0,Math.min(3,damage)-1)*p.perDamage;
        if(from)this.impulse.copy(victim).sub(from).setY(0);
        if(!from||this.impulse.lengthSq()<1e-6)this.impulse.set(Math.random()-.5,0,Math.random()-.5);
        this.impulse.normalize().applyQuaternion(this.inverse.copy(view.quaternion).invert());
        this.camera.kick(p.dip*scale,-this.impulse.x*p.yaw*scale);
        this.camera.push(this.impulse.multiplyScalar(p.push*scale*.1));
    }

    /** Your rat died: follow `target` (your corpse, looked up each frame), then iris out. */
    died(target:()=>THREE.Vector3|undefined):void {
        // Flight wind, launch view and speed streaks end with the rat.
        this.flying=false;this.airVy=0;this.pursuit=0;this.camera.hold(0);this.screen.speed(0);this.sound.localMotion(0,0,false,0);
        if(!this.state.on('deathCam'))return;
        this.deathTarget=target;this.deathAge=0;
    }

    /** Cause-flavoured corpse motion: neutral traps and case missiles flop,
     * explosive incidents fling, ordinary shots spin. */
    deathStyle(killerId:string|null,cause?:string):DeathStyle {
        if(killerId===null||cause==='evidence-tampering')return 'flop';
        return this.incident==='improper-disposal'?'fling':'spin';
    }

    /** You scored a kill on the rat at `victim`; `airborne` when you were in flight. */
    killed(victim:THREE.Vector3,airborne:boolean,view:THREE.Camera,now=performance.now(),victimCarried=false,headshot=false):void {
        this.sound.brass();
        this.lifeKills++;
        // A headshot always gets its callout, regardless of the ordinary cooldown.
        if(headshot&&this.state.on('headshot')){this.lastCalloutAt=now;this.screen.callout('HEADSHOT');}
        else if(victimCarried)this.callout('COLD CASE',now);
        else if(this.lifeKills===3)this.callout('RAT RACKET',now);
        if(this.state.on('killBloom')&&!this.deathTarget){
            this.screen.killBloom();
            this.camera.widen(-FEEL.killBloom.params.punch);
        }
        const p=FEEL.comicWords.params;
        while(this.killTimes.length&&now-this.killTimes[0]!>p.streakWindow*1000)this.killTimes.shift();
        this.killTimes.push(now);
        const streak=this.killTimes.length;
        // Escalating streaks always show; other words respect the cooldown.
        if(streak>=2)this.word(streak===2?'DOUBLE CHEESE!':streak===3?'TRIPLE CHEESE!':'CHEESE-A-PALOOZA!',victim,view,now,true);
        else if(airborne)this.word('AIR MAIL!',victim,view,now,false);
    }

    /** Juice T4: a lethal headshot; full volume when you dealt or took it, else it fades with distance. */
    headshot(victim:THREE.Vector3,view:THREE.Camera,involved:boolean):void {
        if(this.state.on('headshot'))this.sound.headshot(victim,view,involved);
    }

    /** Juice T5: the lineup takes the camera; drop any death camera and its iris. */
    endDeathCamera(view:THREE.Camera):void {
        this.deathTarget=undefined;this.deathAge=0;
        this.camera.look(undefined,0,0);this.screen.iris(0,undefined,view,0);
    }

    /** Juice T5: a lineup flashbulb. */
    flashbulb():void {this.sound.flashbulb();}

    /** L5: a machine fired, seen or not: its debris, a dust ring and a rumble for anyone near. */
    launcherFired(kind:LaunchMachineKind,pad:{x:number;y:number;z:number;radius:number},boost:boolean,view:THREE.Camera):void {
        if(!this.state.on('launchMoment'))return;
        const p=FEEL.launchMoment.params;
        this.launchJuice?.fired(kind,pad,boost,Math.round(p.debris*(boost?1.6:1)));
        for(let i=0;i<6;i++){
            const angle=i*Math.PI/3;
            this.dust?.puff(this.impulse.set(pad.x+Math.cos(angle)*pad.radius*.7,pad.y,pad.z+Math.sin(angle)*pad.radius*.7),1);
        }
        if(boost)for(let i=0;i<3;i++)this.dust?.smoke(this.impulse.set(pad.x,pad.y+.5,pad.z),this.up.set(0,1,0),1);
        const d=Math.hypot(pad.x-view.position.x,pad.y-view.position.y,pad.z-view.position.z);
        if(d<p.shakeRange){
            const s=(1-d/p.shakeRange)*(boost?1.6:1);
            this.camera.kick(p.shake*s,(Math.random()*2-1)*p.shake*s*.5);
        }
    }
    /** P4: a surge pulse (a street launcher erupting or a machine firing during Pressure Surge) flickers the city. */
    surgePulse(at:Vec3Data,view:THREE.Camera):void {
        if(this.incident!=='pressure-surge'||!this.state.on('surgeLook'))return;
        const d=Math.hypot(at.x-view.position.x,at.z-view.position.z);
        this.surgeFlicker=Math.max(this.surgeFlicker,Math.max(.35,1-d/80));
        if(d<30)this.camera.kick(-FEEL.launchMoment.params.shake*(1-d/30),(Math.random()*2-1)*.4);
    }
    /** A ball struck a launcher's trigger at `at`: chips fly and, close by, the hit thumps the view
     * harder the fuller the machine (`level` 0…1). `busy` hits (cooldown) are a dull tap. */
    triggerHit(at:THREE.Vector3,busy:boolean,level:number,view:THREE.Camera):void {
        if(!this.state.on('launchMoment'))return;
        this.launchJuice?.chips(at,busy?2:8+Math.round(level*8));
        const d=at.distanceTo(view.position);
        if(d<12&&!busy)this.camera.kick(-(.25+.6*level)*(1-d/12),(Math.random()*2-1)*.2);
    }
    /** D2: the ball that started an incident hit a pillar's bell at `at`: every streetlamp flashes red,
     * sweeping out from the pillar, and close by the view kicks, harder the nearer you are. */
    dispatchShot(at:Vec3Data,view:THREE.Camera):void {
        if(!this.state.on('dispatchShot'))return;
        const p=FEEL.dispatchShot.params,d=Math.hypot(at.x-view.position.x,at.y-view.position.y,at.z-view.position.z);
        this.lampAlarm?.flash(at);
        if(d<p.kickRange){const s=1-d/p.kickRange;this.camera.kick(-p.kick*s,(Math.random()*2-1)*p.kick*s*.5);}
    }
    /** P2, each frame: standing on a pad whose pressure is `level` (0…1) shakes your view harder as it builds. */
    padRumble(level:number,dt:number):void {
        if(!this.state.on('launchMoment')||level<=.3||!(dt>0))return;
        const s=((level-.3)/.7)**2*FEEL.launchMoment.params.shake*dt*9;
        this.camera.kick((Math.random()*2-1)*s,(Math.random()*2-1)*s);
    }
    /** L5/L6: a rat was thrown (`local` for yours): it screams; yours also kicks the view. */
    launched(at:Vec3Data,local:boolean,boost:boolean,view:THREE.Camera):void {
        if(this.state.on('launchFlight'))this.sound.scream(local?undefined:at,view);
        if(!local||!this.state.on('launchMoment'))return;
        const p=FEEL.launchMoment.params,s=boost?1.4:1;
        this.camera.kick(p.kick*s,(Math.random()*2-1)*.6);this.camera.push(this.impulse.set(0,p.push*s,0));this.camera.widen(6*s);
        if(boost){this.lastCalloutAt=-Infinity;this.callout('OVERPRESSURE!');}
    }
    /** L6: every frame for each rat; contrails behind the ones in launcher flight. */
    flightTrail(id:string,at:THREE.Vector3,flying:boolean,dt:number):void {
        if(!flying||!this.state.on('launchFlight')){this.launchJuice?.endTrail(id);return;}
        this.launchJuice?.trail(id,at,dt,FEEL.launchFlight.params.trailEvery);
    }
    /** L7: a launched rat came down at `at` falling at `speed`: crater, dust, thud, shake and a word. */
    landed(at:THREE.Vector3,speed:number,view:THREE.Camera,now=performance.now()):void {
        if(!this.state.on('launchLanding'))return;
        const p=FEEL.launchLanding.params,heavy=Math.min(1,speed/60);
        this.launchJuice?.landed(at,heavy,p.decalLife);
        this.dust?.puff(at,1);this.dust?.puff(this.impulse.copy(at).setY(at.y+.2),heavy);
        this.sound.landing(at,view,heavy);
        const d=at.distanceTo(view.position);
        if(d<p.shakeRange){
            const s=(1-d/p.shakeRange)*(.5+heavy);
            this.camera.kick(-p.shake*s,(Math.random()*2-1)*p.shake*s*.4);this.camera.push(this.impulse.set(0,-4*s,0));
        }
        this.word(heavy>.6?'KA-THUD!':'THUD!',at,view,now,heavy>.6);
    }
    /** L7, per snapshot: a thrown case whistles as it falls and bursts paperwork where it lands. */
    cases(list:readonly {id?:string;p:Vec3Data;v:Vec3Data;owner:string|null}[],view:THREE.Camera):void {
        if(!this.state.on('launchLanding')){this.fallingCases.clear();return;}
        const seen=new Set<string>();
        for(const c of list){
            const id=c.id??'primary';seen.add(id);
            if(c.owner){this.fallingCases.delete(id);continue;}
            const whistled=this.fallingCases.get(id);
            if(!whistled&&c.p.y>14&&c.v.y<-6){
                // Time to the street from here: y + vy·t − ½·25·t² = 0.
                const seconds=(c.v.y+Math.sqrt(c.v.y*c.v.y+50*c.p.y))/25;
                this.sound.whistle(c.p,view,seconds);this.fallingCases.set(id,true);
            }else if(whistled&&c.p.y<2.5){
                this.launchJuice?.spill(this.impulse.set(c.p.x,c.p.y,c.p.z),FEEL.launchLanding.params.paper);
                this.fallingCases.delete(id);
            }
        }
        for(const id of this.fallingCases.keys())if(!seen.has(id))this.fallingCases.delete(id);
    }

    /** R3: a shot jolted a body's limbs. */
    corpseJolt(at:Vec3Data,view:THREE.Camera):void {if(this.state.on('ragdoll'))this.sound.squeak(at,view);}

    /** Your cheese hit someone (nonlethal). */
    hitDealt(victim:THREE.Vector3,view:THREE.Camera):void {this.sound.squelch(victim,view);}

    private word(text:string,at:THREE.Vector3,view:THREE.Camera,now:number,escalation:boolean):void {
        if(!this.state.on('comicWords'))return;
        if(!escalation&&now-this.lastWordAt<FEEL.comicWords.params.cooldown*1000)return;
        this.lastWordAt=now;
        this.screen.word(text,at,view);
    }

    /** A cheese hit landed on `victim` (a remote rat you hit, or your own rat). */
    impact(victim:RatEntity,local:boolean):void {
        if(!this.state.on('impactFreeze'))return;
        const p=FEEL.impactFreeze.params;
        victim.freeze(local?p.taken:p.dealt,!local);
    }

    /** `self` is the local rat's position, for direction arrows. */
    update(dt:number,view:THREE.Camera,self?:THREE.Vector3):void {
        this.heavy?.update(dt);
        const r=FEEL.rewards.params;this.view=view;
        if(this.slowAge<r.slowmo){this.slowAge+=dt;this.lag+=dt*1000*(1-r.slowRate);}
        else if(this.lag>0)this.lag=Math.max(0,this.lag-dt*1000*r.catchup);
        this.camera.update(dt);
        this.updateSurge(dt);
        this.updateBlackout(dt);
        this.dust?.update(dt);
        this.launchJuice?.update(dt);
        this.tommy?.update(dt);
        if(this.rattle&&dt>0){const s=FEEL.tommyGun.params.rattle*dt*9;this.camera.kick((Math.random()*2-1)*s,(Math.random()*2-1)*s);}
        this.city?.update(dt);
        this.noirCity?.update(this.perception(),this.mono(),FEEL.lowHealth.params.lift);
        this.noirDressing?.update(dt);
        this.lampAlarm?.update(dt);
        if(this.noirRain){
            const where=self?spaceAt(self):'open';
            this.noirRain.update(dt,view,where==='open');
            this.sound.rain(this.noirRain.level);
        }
        if(this.noirAtmosphere){
            this.noirAtmosphere.update(dt,view,!self||spaceAt(self)==='open',this.perception(),this.mono(),this.dark);
            if(this.noirAtmosphere.thunderIn>=0&&(this.noirAtmosphere.thunderIn-=dt)<0)this.sound.thunder();
        }
        this.screen.update(dt,view,self);
        if(this.deathTarget){
            const d=FEEL.deathCam.params,target=this.deathTarget();this.deathAge+=dt;
            this.camera.look(target,Math.min(1,this.deathAge/d.turn),d.pullBack);
            this.screen.iris(Math.max(0,Math.min(1,(this.deathAge-d.follow)/d.close)),target,view,d.irisRadius);
        }
        const on=this.state.on('lowHealth'),p=FEEL.lowHealth.params,target=on?this.dangerTarget:0;
        this.danger+=(target-this.danger)*(1-Math.exp(-p.ease*dt));
        if(Math.abs(target-this.danger)<.002)this.danger=target;
        this.flood=Math.max(0,this.flood-dt*1.4);
        this.screen.noir(this.danger,on?this.flood:0,this.colourFilter);
        const noir=this.state.noir()*this.perception(),filmOn=this.state.on('noirFilm'),film=filmOn?noir/.65:0,f=FEEL.noirFilm.params;
        // Old film: grain thickens as the city turns black and white.
        const grain=film*f.grain+(filmOn&&this.state.noir()>0?this.mono()*p.grain:0);
        this.screen.film(this.colourFilter&&GRAPHICS.grain?grain:0,film*f.vignette,film>0&&(!!this.deathTarget||this.slowAge<FEEL.rewards.params.slowmo));
        if(this.noirAudio){
            this.noirAudio.space=this.state.on('sound')&&self?spaceAt(self):'open';
            this.noirAudio.update(dt,this.danger,p.closed,p.period,on&&!this.carrier.active?p.heartbeat:0);
        }
    }
    /** P4: the rumble and a restless view build over the surge. */
    private updateSurge(dt:number):void {
        const on=this.incident==='pressure-surge'&&this.state.on('surgeLook');
        this.surgeAge=on?this.surgeAge+dt:0;
        const level=on?Math.min(1,.3+this.surgeAge/25*.7):0;
        this.sound.rumble(level);
        if(on&&dt>0){const s=level*level*FEEL.surgeLook.params.shake*dt*6;this.camera.kick((Math.random()*2-1)*s,(Math.random()*2-1)*s);}
        this.surgeFlicker*=Math.exp(-dt/.18);if(!on)this.surgeFlicker=0;
    }
    /** Blackout eases in with the lights stuttering out, and back on the same way.
     * Muzzle flashes lift the dark for a beat; there is no lightning. */
    private updateBlackout(dt:number):void {
        const p=FEEL.blackout.params,target=this.incident==='blackout'?1:0;
        this.blackout+=Math.sign(target-this.blackout)*Math.min(Math.abs(target-this.blackout),dt/p.fade);
        const transition=this.blackout>0&&this.blackout<1,stutter=transition&&Math.sin(this.blackout*47)>.2?.45:1;
        this.muzzleFlash*=Math.exp(-dt/.07);
        const flash=Math.min(1,Math.max(this.noirAtmosphere?.flash??0,this.muzzleFlash)*1.5);
        // A surge pulse makes the lights stutter for a beat.
        const flicker=this.surgeFlicker>.02&&Math.sin(performance.now()*.09)>0?this.surgeFlicker*FEEL.surgeLook.params.flicker:0;
        this.dark=Math.max(this.blackout*stutter,flicker)*(1-flash);
        this.noirCity?.setDark(this.dark);
        RAT_BLACKOUT.value=this.blackout;
    }
    /** Offset the rendered view; `afterRender` must follow the same frame. */
    beforeRender(camera:THREE.PerspectiveCamera):void {this.camera.apply(camera);}
    afterRender(camera:THREE.PerspectiveCamera):void {this.camera.restore(camera);}
    /** Respawn, reconnect, round reset, leaving play. */
    reset():void {this.heavy?.clear();this.camera.reset();this.screen.reset();this.carrier.stop();this.killTimes.length=0;this.danger=this.dangerTarget=this.flood=0;this.hp=MAX_HP;this.noirAudio?.reset();this.deathTarget=undefined;this.deathAge=0;this.dust?.clear();this.launchJuice?.clear();this.tommy?.clear();this.rattle=false;this.fallingCases.clear();this.flying=false;this.airVy=0;this.pursuit=0;this.claimStreaks=0;this.wasGrounded=true;this.muzzleFlash=0;this.surgeAge=this.surgeFlicker=0;this.sound.reset();this.lifeKills=0;this.hunchView?.reset();}
    dispose():void {this.heavy?.dispose();this.camera.reset();this.carrier.dispose();this.screen.dispose();this.noirAudio?.dispose();if(this.scene){registerDust(this.scene,undefined);registerSupplyCues(this.scene,undefined);}this.dust?.dispose();this.launchJuice?.dispose();this.tommy?.dispose();this.sound.dispose();registerCity(undefined);this.city?.dispose();this.noirCity?.dispose();this.noirRain?.dispose();this.noirAtmosphere?.dispose();this.noirDressing?.dispose();this.lampAlarm?.dispose();this.hunchView?.dispose();this.searchlight?.dispose();RAT_BLACKOUT.value=0;this.doc?.body.classList.remove('blackout');}
}
