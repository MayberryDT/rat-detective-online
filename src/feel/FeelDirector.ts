import * as THREE from 'three';
import type {IncidentId} from '../shared/incidentCatalog';
import type {RatEntity} from '../entities/RatEntity';
import type {DeathStyle} from '../utils/RatAnimator';
import {CameraFeel} from './CameraFeel';
import {ScreenFeel} from './ScreenFeel';
import {NoirAudio} from './NoirAudio';
import {Dust,registerDust} from './Dust';
import {CityReactions,registerCity} from './CityReactions';
import {NoirCity} from './NoirCity';
import {NoirRain} from './NoirRain';
import {NoirAtmosphere} from './NoirAtmosphere';
import type {StreetLampPosition} from '../shared/streetLampLayout';
import {FeelSound,spaceAt,type FootstepSource} from './FeelSound';
import type {Sting} from './FeelAudio';
import type {ChaosShot} from '../shared/chaosState';
import {MAX_HP} from '../shared/networkProtocol';
import {feelState,type FeelState} from './feelState';
import {FEEL} from './feelTuning';

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
    private city?:CityReactions;
    private noirCity?:NoirCity;
    private noirRain?:NoirRain;
    private noirAtmosphere?:NoirAtmosphere;
    private lifeKills=0;
    private lastCalloutAt=-Infinity;
    private slowAge=Infinity;
    private lag=0;
    private wasGrounded=true;
    private airVy=0;
    private flying=false;
    private pursuit=0;
    private readonly impulse=new THREE.Vector3();
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
    attachScene(scene:THREE.Scene):void {this.dust?.dispose();this.dust=new Dust(scene);registerDust(this.dust);}

    /** Cosmetic reactive props for the current city (replaced on a new world). */
    attachCity(scene:THREE.Scene,lamps:readonly StreetLampPosition[]):void {
        this.city?.dispose();this.city=new CityReactions(scene,lamps);registerCity(this.city);
        // Collect city materials now, before rats, cases and pickups exist.
        this.noirCity?.dispose();this.noirCity=new NoirCity(scene);
        this.noirAtmosphere?.dispose();this.noirAtmosphere=new NoirAtmosphere(scene,lamps);
        this.noirRain?.dispose();this.noirRain=new NoirRain(scene,lamps,Math.round(this.colourFilter?FEEL.noirRain.params.drops:FEEL.noirRain.params.phoneDrops));
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
        this.screen.speed(this.pursuit*p.streaks);
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
        const p=FEEL.lowHealth.params,previous=this.dangerTarget;
        this.dangerTarget=hp>=MAX_HP?0:hp<=1?1:p.mid;
        if(healed&&previous>0&&this.dangerTarget<previous)this.flood=1;
    }

    /** The active Dispatch incident, for effects that scale with heavier volleys. */
    setIncident(incident?:IncidentId):void {this.incident=incident;}

    /** A local shot left the muzzle. */
    shot():void {
        if(!this.state.on('shotKick'))return;
        const p=FEEL.shotKick.params;
        const scale=this.incident==='scattershot'?p.scattershot:this.incident==='popcorn-panic'?p.popcorn:1;
        this.camera.kick(p.pitch*scale,(Math.random()*2-1)*p.yawJitter*p.pitch*scale);
        this.camera.push(this.impulse.set(0,0,p.push*scale));
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
        return this.incident==='improper-disposal'||this.incident==='planted-evidence'||this.incident==='popcorn-panic'?'fling':'spin';
    }

    /** You scored a kill on the rat at `victim`; `airborne` when you were in flight. */
    killed(victim:THREE.Vector3,airborne:boolean,view:THREE.Camera,now=performance.now(),victimCarried=false):void {
        this.sound.brass();
        this.lifeKills++;
        if(victimCarried)this.callout('COLD CASE',now);
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
        const r=FEEL.rewards.params;
        if(this.slowAge<r.slowmo){this.slowAge+=dt;this.lag+=dt*1000*(1-r.slowRate);}
        else if(this.lag>0)this.lag=Math.max(0,this.lag-dt*1000*r.catchup);
        this.camera.update(dt);
        this.dust?.update(dt);
        this.city?.update(dt);
        this.noirCity?.update();
        if(this.noirRain){
            const where=self?spaceAt(self):'open';
            this.noirRain.update(dt,view,where==='open');
            this.sound.rain(this.noirRain.level);
        }
        if(this.noirAtmosphere){
            this.noirAtmosphere.update(dt,view,!self||spaceAt(self)==='open');
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
        if(this.noirAudio){
            this.noirAudio.space=this.state.on('sound')&&self?spaceAt(self):'open';
            this.noirAudio.update(dt,this.danger,p.closed,p.period,on?p.heartbeat:0);
        }
    }
    /** Offset the rendered view; `afterRender` must follow the same frame. */
    beforeRender(camera:THREE.PerspectiveCamera):void {this.camera.apply(camera);}
    afterRender(camera:THREE.PerspectiveCamera):void {this.camera.restore(camera);}
    /** Respawn, reconnect, round reset, leaving play. */
    reset():void {this.camera.reset();this.screen.reset();this.killTimes.length=0;this.danger=this.dangerTarget=this.flood=0;this.noirAudio?.reset();this.deathTarget=undefined;this.deathAge=0;this.dust?.clear();this.flying=false;this.airVy=0;this.pursuit=0;this.wasGrounded=true;this.sound.reset();this.lifeKills=0;}
    dispose():void {this.camera.reset();this.screen.dispose();this.noirAudio?.dispose();registerDust(undefined);this.dust?.dispose();this.sound.dispose();registerCity(undefined);this.city?.dispose();this.noirCity?.dispose();this.noirRain?.dispose();this.noirAtmosphere?.dispose();}
}
