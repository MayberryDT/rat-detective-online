import * as THREE from 'three';
import type {IncidentId} from '../shared/incidentCatalog';
import type {RatEntity} from '../entities/RatEntity';
import type {DeathStyle} from '../utils/RatAnimator';
import {CameraFeel} from './CameraFeel';
import {ScreenFeel} from './ScreenFeel';
import {NoirAudio} from './NoirAudio';
import {MAX_HP} from '../shared/networkProtocol';
import {feelState,type FeelState} from './feelState';
import {FEEL} from './feelTuning';

/** One entry point from game events to presentation-only feel effects.
 * GameSession calls it at existing event sources; channels never parse
 * network messages themselves. */
export class FeelDirector {
    readonly camera:CameraFeel;
    readonly screen:ScreenFeel;
    private incident?:IncidentId;
    private readonly killTimes:number[]=[];
    private lastWordAt=-Infinity;
    private danger=0;
    private dangerTarget=0;
    private flood=0;
    private noirAudio?:NoirAudio;
    private colourFilter=true;
    private readonly impulse=new THREE.Vector3();
    private readonly inverse=new THREE.Quaternion();
    constructor(readonly state:FeelState=feelState(),doc:Document|undefined=globalThis.document){
        this.camera=new CameraFeel(()=>this.state.shake());
        this.screen=new ScreenFeel(()=>this.state.flash(),doc);
    }
    /** Connect the game canvas (colour drain) and audio listener (muffle, heartbeat). */
    attach(canvas:HTMLElement,listener?:THREE.AudioListener,touch=false):void {
        this.screen.attachCanvas(canvas);
        if(listener)this.noirAudio=new NoirAudio(listener);
        // Phones skip the full-canvas colour filter; the vignette and audio remain.
        this.colourFilter=!touch;
    }

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
        if(!this.state.on('hitJolt'))return;
        const p=FEEL.hitJolt.params,scale=1+Math.max(0,Math.min(3,damage)-1)*p.perDamage;
        if(from)this.impulse.copy(victim).sub(from).setY(0);
        if(!from||this.impulse.lengthSq()<1e-6)this.impulse.set(Math.random()-.5,0,Math.random()-.5);
        this.impulse.normalize().applyQuaternion(this.inverse.copy(view.quaternion).invert());
        this.camera.kick(p.dip*scale,-this.impulse.x*p.yaw*scale);
        this.camera.push(this.impulse.multiplyScalar(p.push*scale*.1));
    }

    /** Cause-flavoured corpse motion: neutral traps and case missiles flop,
     * explosive incidents fling, ordinary shots spin. */
    deathStyle(killerId:string|null,cause?:string):DeathStyle {
        if(killerId===null||cause==='evidence-tampering')return 'flop';
        return this.incident==='improper-disposal'||this.incident==='planted-evidence'||this.incident==='popcorn-panic'?'fling':'spin';
    }

    /** You scored a kill on the rat at `victim`; `airborne` when you were in flight. */
    killed(victim:THREE.Vector3,airborne:boolean,view:THREE.Camera,now=performance.now()):void {
        if(this.state.on('killBloom')){
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
        this.camera.update(dt);
        this.screen.update(dt,view,self);
        const on=this.state.on('lowHealth'),p=FEEL.lowHealth.params,target=on?this.dangerTarget:0;
        this.danger+=(target-this.danger)*(1-Math.exp(-p.ease*dt));
        if(Math.abs(target-this.danger)<.002)this.danger=target;
        this.flood=Math.max(0,this.flood-dt*1.4);
        this.screen.noir(this.danger,on?this.flood:0,this.colourFilter);
        if(on)this.noirAudio?.update(dt,this.danger,p.closed,p.period,p.heartbeat);
        else this.noirAudio?.reset();
    }
    /** Offset the rendered view; `afterRender` must follow the same frame. */
    beforeRender(camera:THREE.PerspectiveCamera):void {this.camera.apply(camera);}
    afterRender(camera:THREE.PerspectiveCamera):void {this.camera.restore(camera);}
    /** Respawn, reconnect, round reset, leaving play. */
    reset():void {this.camera.reset();this.screen.reset();this.killTimes.length=0;this.danger=this.dangerTarget=this.flood=0;this.noirAudio?.reset();}
    dispose():void {this.camera.reset();this.screen.dispose();this.noirAudio?.dispose();}
}
