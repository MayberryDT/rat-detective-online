import * as THREE from 'three';
import type {IncidentId} from '../shared/incidentCatalog';
import type {RatEntity} from '../entities/RatEntity';
import type {DeathStyle} from '../utils/RatAnimator';
import {CameraFeel} from './CameraFeel';
import {ScreenFeel} from './ScreenFeel';
import {NoirAudio} from './NoirAudio';
import {Dust,registerDust,muzzleSmoke} from './Dust';
import {badRound} from '../shared/shotPattern';
import type {Vec3Data} from '../shared/networkProtocol';
import {CityReactions,registerCity} from './CityReactions';
import {NoirCity} from './NoirCity';
import {NoirRain} from './NoirRain';
import {NoirAtmosphere} from './NoirAtmosphere';
import {NoirDressing} from './NoirDressing';
import type {StreetLampPosition} from '../shared/streetLampLayout';
import {FeelSound,spaceAt,type FootstepSource} from './FeelSound';
import type {Sting} from './FeelAudio';
import type {ChaosShot} from '../shared/chaosState';
import {MAX_HP} from '../shared/networkProtocol';
import {feelState,type FeelState} from './feelState';
import {FEEL} from './feelTuning';
import {NAMEPLATE_LIGHT} from '../ui/RatBillboard';
import {Hunch,type HunchRat} from './Hunch';
import {WantedSearchlight} from './WantedSearchlight';
import {registerSupplyCues} from './supplyCues';
import {LaunchJuice} from './LaunchJuice';
import type {LaunchMachineKind} from '../shared/chaosState';

/** One entry point from game events to presentation-only feel effects.
 * GameSession calls it at existing event sources; channels never parse
 * network messages themselves. */
export class FeelDirector {
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
    private lifeKills=0;
    private lastCalloutAt=-Infinity;
    private slowAge=Infinity;
    private lag=0;
    private wasGrounded=true;
    private airVy=0;
    private flying=false;
    private pursuit=0;
    /** Blackout: eased power-off level, and the brief lift from nearby muzzle flashes. */
    private blackout=0;
    private muzzleFlash=0;
    private dark=0;
    /** The last rendered view, for placing world cues raised outside the frame loop. */
    private view?:THREE.Camera;
    private readonly impulse=new THREE.Vector3();
    private readonly up=new THREE.Vector3();
    private readonly inverse=new THREE.Quaternion();
    constructor(readonly state:FeelState=feelState(),doc:Document|undefined=globalThis.document){
        this.camera=new CameraFeel(()=>this.state.shake());
        this.screen=new ScreenFeel(()=>this.state.flash(),doc);
        this.sound=new FeelSound(this.state);
    }
    /** Connect the game canvas (colour drain) and audio listener (muffle, heartbeat). */
    attach(canvas:HTMLElement,listener?:THREE.AudioListener,touch=false):void {
        this.screen.attachCanvas(canvas);
        if(listener){this.noirAudio=new NoirAudio(listener);this.sound.attach(listener.context);}
        // Phones skip the full-canvas colour filter; the vignette and audio remain.
        this.colourFilter=!touch;
    }

    /** Scene-wide dust for every rat's landings, skids and launches. */
    attachScene(scene:THREE.Scene):void {
        this.dust?.dispose();this.dust=new Dust(scene);registerDust(this.dust);
        this.launchJuice?.dispose();this.launchJuice=new LaunchJuice(scene);
        this.hunchView?.dispose();this.hunchView=new Hunch(scene,this.state,this.sound);
        this.searchlight?.dispose();this.searchlight=new WantedSearchlight(scene);
        registerSupplyCues((cue,at)=>{if(this.view)this.sound.supply(cue,at,this.view);});this.hunchView.setSupercharged(this.incident==='clean-bill');
    }
    /** Most Wanted each frame: the searchlight follows `target` (the leader's feet);
     * `me` when the leader is you, which gets its own callout. */
    wanted(dt:number,target:THREE.Vector3|undefined,me:boolean):void {
        this.searchlight?.update(dt,target);
        if(me&&!this.wasWanted){this.lastCalloutAt=-Infinity;this.callout('YOU ARE MOST WANTED');this.sound.sting('case');}
        this.wasWanted=me;
    }
    /** You collected the Most Wanted bounty. */
    bounty():void {this.lastCalloutAt=-Infinity;this.callout('BOUNTY COLLECTED');this.sound.brass();}
    /** The Hunch each frame; `self` only while your rat is alive and in play. */
    hunch(dt:number,now:number,view:THREE.Camera,self:RatEntity|undefined,rats:ReadonlyMap<string,HunchRat>,wanted?:string):void {this.hunchView?.update(dt,now,view,self,rats,wanted);}

    /** Cosmetic reactive props for the current city (replaced on a new world). */
    attachCity(scene:THREE.Scene,lamps:readonly StreetLampPosition[]):void {
        this.city?.dispose();this.city=new CityReactions(scene,lamps);registerCity(this.city);
        // Collect city materials now, before rats, cases and pickups exist.
        this.noirCity?.dispose();this.noirCity=new NoirCity(scene);
        this.noirAtmosphere?.dispose();this.noirAtmosphere=new NoirAtmosphere(scene,lamps);
        this.noirDressing?.dispose();this.noirDressing=new NoirDressing(scene);
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
        const on=this.state.on('movement'),p=FEEL.movement.params;
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
        this.screen.speed(Math.max(this.pursuit*p.streaks,flightStreaks));
        this.sound.localMotion(horizontalSpeed,landed,carrying,this.flying?Math.min(1,Math.hypot(horizontalSpeed,verticalSpeed)/45):0);
    }

    /** Footsteps for your rat (id `self`) and nearby rats. */
    footsteps(dt:number,sources:readonly FootstepSource[],self:THREE.Vector3|undefined,view:THREE.Camera):void {
        this.sound.footsteps(dt,sources,self,view);
        this.city?.proximity(sources);
    }
    /** Near-miss whizz for other rats' balls. */
    projectiles(shots:readonly ChaosShot[],myId:string,head:THREE.Vector3,view:THREE.Camera):void {this.sound.projectiles(shots,myId,head,view);}
    /** Case pickup, your delivery, closing seconds. */
    sting(kind:Sting):void {
        this.sound.sting(kind);
        if(kind==='case')this.callout('ON THE CASE');
    }

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

    /** Authoritative local health changed; `healed` floods colour back. */
    health(hp:number,healed=false):void {
        const previous=this.dangerTarget;
        // Linear from max HP (clear) to the last hit point (full danger).
        this.dangerTarget=hp>=MAX_HP?0:hp<=1?1:(MAX_HP-hp)/(MAX_HP-1);
        if(healed&&previous>0&&this.dangerTarget<previous)this.flood=1;
    }

    /** Your last hit point (or dead): case markers hide and Quick Fix shows through walls. */
    get lastHitPoint():boolean {return this.state.on('lastHitPoint')&&this.dangerTarget>=1;}
    /** Noir perception scale: a background hint at max HP, full strength at the last hit point. */
    private perception():number {
        if(!this.state.on('noirByHealth'))return 1;
        const clear=FEEL.noir.params.clear;return clear+(1-clear)*this.danger;
    }

    /** The active Dispatch incident, for effects that scale with heavier volleys. */
    setIncident(incident?:IncidentId):void {
        this.incident=incident;this.hunchView?.setSupercharged(incident==='clean-bill');
        if(this.noirAtmosphere)this.noirAtmosphere.storm=incident==='blackout';
    }
    /** Renderer exposure multiplier: Blackout sinks everything but the lamps' own glow. */
    get exposure():number {return 1-this.dark*FEEL.blackout.params.exposure;}

    /** A local shot left the muzzle (a Bad Ammunition jam fires nothing, so no kick). */
    shot(shotId?:string):void {
        if(!this.state.on('shotKick'))return;
        if(shotId&&this.incident==='bad-ammunition'&&badRound(shotId).round==='jam')return;
        const p=FEEL.shotKick.params;
        const scale=this.incident==='scattershot'?p.scattershot:1;
        this.camera.kick(p.pitch*scale,(Math.random()*2-1)*p.yawJitter*p.pitch*scale);
        this.camera.push(this.impulse.set(0,0,p.push*scale));
    }

    /** Bad Ammunition, per trigger: smoke and a cough for everyone nearby; for your
     * own shot a jam clicks, a dud goes wah-wah and a backfire smears soot on the lens. */
    fired(shotId:string,origin:Vec3Data,direction:Vec3Data,local:boolean,view:THREE.Camera,now=performance.now()):void {
        // Blackout: a shot nearby lights the street for a blink.
        if(this.incident==='blackout'){
            const d=Math.hypot(origin.x-view.position.x,origin.y-view.position.y,origin.z-view.position.z),reach=FEEL.blackout.params.muzzleRange;
            if(d<reach)this.muzzleFlash=Math.max(this.muzzleFlash,FEEL.blackout.params.muzzle*(1-d/reach));
        }
        if(this.incident!=='bad-ammunition'||!this.state.on('badAmmo'))return;
        const {round,backfire}=badRound(shotId),muzzle=new THREE.Vector3(origin.x,origin.y,origin.z);
        if(round!=='jam')muzzleSmoke(muzzle,new THREE.Vector3(direction.x,direction.y,direction.z),round==='dud'?.4:1);
        if(round==='crooked')this.sound.cough(local?undefined:origin,view);
        if(!local)return;
        if(round==='jam'){
            this.sound.jam();this.word('CLICK.',muzzle,view,now,true);
            this.camera.kick(.25,(Math.random()*2-1)*.8);
        }else if(round==='dud'){this.sound.womp();this.word('PFFT.',muzzle,view,now,true);}
        else if(backfire){
            this.screen.soot();this.word('BACKFIRE!',muzzle,view,now,true);
            this.camera.kick(FEEL.shotKick.params.pitch*3,(Math.random()*2-1)*.6);
        }
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
        return this.incident==='improper-disposal'||this.incident==='planted-evidence'?'fling':'spin';
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

    /** Your cheese hit someone (nonlethal). */
    hitDealt(victim:THREE.Vector3,view:THREE.Camera,now=performance.now()):void {
        this.sound.squelch(victim,view);
        if(this.incident==='big-cheese')this.word('KER-CHEESE!',victim,view,now,false);
    }

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
        const r=FEEL.rewards.params;this.view=view;
        if(this.slowAge<r.slowmo){this.slowAge+=dt;this.lag+=dt*1000*(1-r.slowRate);}
        else if(this.lag>0)this.lag=Math.max(0,this.lag-dt*1000*r.catchup);
        this.camera.update(dt);
        this.updateBlackout(dt);
        this.dust?.update(dt);
        this.launchJuice?.update(dt);
        this.city?.update(dt);
        this.noirCity?.update(this.perception());
        this.noirDressing?.update(dt);
        if(this.noirRain){
            const where=self?spaceAt(self):'open';
            this.noirRain.update(dt,view,where==='open');
            this.sound.rain(this.noirRain.level);
        }
        if(this.noirAtmosphere){
            this.noirAtmosphere.update(dt,view,!self||spaceAt(self)==='open',this.perception());
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
        const noir=this.state.noir()*this.perception(),film=this.state.on('noirFilm')?noir/.65:0,f=FEEL.noirFilm.params;
        this.screen.film(this.colourFilter?film*f.grain:0,film*f.vignette,film>0&&(!!this.deathTarget||this.slowAge<FEEL.rewards.params.slowmo));
        if(this.noirAudio){
            this.noirAudio.space=this.state.on('sound')&&self?spaceAt(self):'open';
            this.noirAudio.update(dt,this.danger,p.closed,p.period,on?p.heartbeat:0);
        }
    }
    /** Blackout eases in with the lights stuttering out, and back on the same way.
     * Lightning and muzzle flashes lift the dark for a beat. */
    private updateBlackout(dt:number):void {
        const p=FEEL.blackout.params,target=this.incident==='blackout'?1:0;
        this.blackout+=Math.sign(target-this.blackout)*Math.min(Math.abs(target-this.blackout),dt/p.fade);
        const transition=this.blackout>0&&this.blackout<1,stutter=transition&&Math.sin(this.blackout*47)>.2?.45:1;
        this.muzzleFlash*=Math.exp(-dt/.07);
        const flash=Math.min(1,Math.max(this.noirAtmosphere?.flash??0,this.muzzleFlash)*1.5);
        this.dark=this.blackout*stutter*(1-flash);
        this.noirCity?.setDark(this.dark*p.city);
        NAMEPLATE_LIGHT.value=1-this.dark*p.nameplates;
    }
    /** Offset the rendered view; `afterRender` must follow the same frame. */
    beforeRender(camera:THREE.PerspectiveCamera):void {this.camera.apply(camera);}
    afterRender(camera:THREE.PerspectiveCamera):void {this.camera.restore(camera);}
    /** Respawn, reconnect, round reset, leaving play. */
    reset():void {this.camera.reset();this.screen.reset();this.killTimes.length=0;this.danger=this.dangerTarget=this.flood=0;this.noirAudio?.reset();this.deathTarget=undefined;this.deathAge=0;this.dust?.clear();this.launchJuice?.clear();this.fallingCases.clear();this.flying=false;this.airVy=0;this.pursuit=0;this.wasGrounded=true;this.muzzleFlash=0;this.sound.reset();this.lifeKills=0;this.hunchView?.reset();}
    dispose():void {this.camera.reset();this.screen.dispose();this.noirAudio?.dispose();registerDust(undefined);this.dust?.dispose();this.launchJuice?.dispose();this.sound.dispose();registerCity(undefined);this.city?.dispose();this.noirCity?.dispose();this.noirRain?.dispose();this.noirAtmosphere?.dispose();this.noirDressing?.dispose();this.hunchView?.dispose();this.searchlight?.dispose();registerSupplyCues(undefined);NAMEPLATE_LIGHT.value=1;}
}
