import {BALL_RADIUS} from './ballTuning';
import {bounceShot,bounces,cheeseBounce,growIn,quirkBirth,quirkBounce,shotGravity,shotLife,steerQuirk} from './shotBallistics';
import {CHAOS_TUNING,type ChaosShot,type ChaosState} from './chaosState';
import {resolveShotPattern,type ShotWeapon} from './shotPattern';
import type {IncidentId} from './incidentCatalog';
import type {ServerMessage,ShotDescriptor,Vec3Data} from './networkProtocol';

/** `radius` is passed only for a Big Cheese ball: the trace then sweeps that sphere, as the authority does. */
export type ShotTrace=(from:Vec3Data,to:Vec3Data,radius?:number)=>{p:Vec3Data;n:Vec3Data;rat:boolean;reflect?:boolean}|undefined;
interface LocalShot {
    shot:ChaosShot; trigger:string; fired:number; updated:number; first:boolean;
    confirmed?:number; hidden:boolean; incident?:IncidentId; weapon?:ShotWeapon;
    offset?:{p:Vec3Data;at:number};
}
const distance=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const clone=(s:ChaosShot):ChaosShot=>({...s,p:{...s.p},v:{...s.v}});
const STEP=1/60;

/** One render entry per real shot ID, immediately on accepted local input.
 * Local sweeps affect only this ball's display. Server snapshots alone cause
 * damage, scoring, physical impulses, incident effects and final removal. */
export class LocalShotPresentation {
    private readonly shots=new Map<string,LocalShot>();
    private readonly retired=new Set<string>();
    private readonly merged:ChaosShot[]=[];
    constructor(private readonly trace?:ShotTrace){}
    clear():void{this.shots.clear();this.retired.clear();this.merged.length=0;}
    /** `weapon` is the held special weapon (the Tommy Gun with its heat); it replaces the incident's pattern. A trigger
     * with no ball (Laser, Mousetrap) is retired at once, so its confirmation is consumed without a muzzle replay. */
    fire(owner:string,shot:ShotDescriptor,incident:IncidentId|undefined,now:number,weapon?:ShotWeapon):void {
        const balls=resolveShotPattern(shot,incident,weapon);
        if(!balls.length){this.retire(shot.shotId);return;}
        for(const ball of balls){
            if(this.shots.has(ball.id)||this.retired.has(ball.id))continue;
            while(this.shots.size>=CHAOS_TUNING.maxShots)this.retire(this.shots.keys().next().value!);
            this.shots.set(ball.id,{shot:{id:ball.id,owner,p:{...shot.origin},v:{...ball.velocity},age:0,...(ball.quirk?quirkBirth(ball.quirk,shot.direction):{})},
                trigger:shot.shotId,fired:now,updated:now,first:true,hidden:false,...(weapon?{weapon}:{incident})});
        }
    }
    /** Returning true consumes the confirmation, including one already retired.
     * It must never replay the muzzle or add a second instanced ball. */
    confirm(message:Extract<ServerMessage,{type:'playerShot'}>,now:number):boolean {
        const launch=message.launch;if(!launch)return false;
        const tracked=this.shots.has(message.shotId)||this.retired.has(message.shotId);
        if(!tracked)return false;
        if(this.retired.has(message.shotId)&&!this.shots.has(message.shotId))return true;
        const expected=new Set(launch.balls.map(b=>b.id));
        // An incident may change while a shot is in transit. Correct the real
        // volley membership; do not keep a guessed extra or straight ball.
        for(const [id,local] of this.shots)if(local.trigger===message.shotId&&!expected.has(id))this.retire(id);
        for(const ball of launch.balls){
            let local=this.shots.get(ball.id);
            if(!local){
                if(this.retired.has(ball.id))continue;
                const original=this.shots.get(message.shotId);
                local={shot:{id:ball.id,owner:message.shooterId,p:{...message.origin},v:{...ball.velocity},age:0},
                    trigger:message.shotId,fired:original?.fired??now,updated:now,first:false,hidden:false};
                this.shots.set(ball.id,local);
            }
            local.confirmed=launch.at;
            // Usually this is identical. The authority wins a boundary change.
            const expectedVelocity=resolveShotPattern(message,local.incident,local.weapon).find(b=>b.id===ball.id)?.velocity;
            if(!expectedVelocity||distance(expectedVelocity,ball.velocity)>.01){
                // A Bad Ammunition ball the prediction did not expect (or a predicted one the authority did not fire) takes the authority's personality.
                const quirk=resolveShotPattern(message,'bad-ammunition').find(b=>b.id===ball.id&&distance(b.velocity,ball.velocity)<=.01)?.quirk;
                const state:ChaosShot={id:local.shot.id,owner:local.shot.owner,p:{...message.origin},v:{...ball.velocity},age:0,...(quirk?quirkBirth(quirk,message.direction):{})};
                const hidden=this.advance(state,Math.min(.5,Math.max(0,(now-local.fired)/1000)),local.incident);
                local.shot=state;local.hidden=hidden;local.offset=undefined;local.updated=now;
            }
        }
        return true;
    }
    /** A direct authority outcome closes the exact ball immediately instead of
     * waiting for absence inference from a later world snapshot. */
    result(message:Extract<ServerMessage,{type:'shotResult'}>):void {
        if(['first-step','ironclad-reflect','case-contact','world-bounce','dispatch-contact','pressure-contact'].includes(message.outcome))return;
        if(message.outcome==='rejected'){
            for(const [id,local] of this.shots)if(local.trigger===message.shotId)this.retire(id);
            this.retired.add(message.shotId);return;
        }
        this.retire(message.ballId);
    }
    apply(state:ChaosState,now:number):void {
        if(!this.shots.size)return; // every chaos frame; usually no local shot in flight
        const incoming=new Map(state.shots.map(s=>[s.id,s]));
        for(const [id,local] of this.shots){
            const authoritative=incoming.get(id);
            if(!authoritative){
                // Snapshots queued before the trigger/confirmation cannot erase
                // the shot. A post-confirmation absence is an authoritative hit.
                if(local.confirmed!==undefined&&state.time>=local.confirmed)this.retire(id);
                continue;
            }
            local.confirmed??=state.time;
            // A special weapon's balls are plain whatever the incident (no Big Cheese growth).
            if(!local.weapon)local.incident=state.dispatch.phase==='active'?state.dispatch.incident:undefined;
            if(local.first)continue; // first display frame still starts at muzzle
            this.update(local,now);
            const age=local.shot.age,elapsed=Math.max(0,age-authoritative.age);
            // Normal RTT fits this bound. A very stale sample cannot drag a
            // responsive local shot backwards across half the city.
            if(elapsed>.5)continue;
            const corrected=clone(authoritative);
            // Snapshots never carry a personality: keep the predicted one while its path lasts (a superball's for good).
            const quirk=local.shot.quirk;
            if(quirk&&local.shot.aim&&(quirk==='superball'||!authoritative.wallBounced)){corrected.quirk=quirk;corrected.aim=local.shot.aim;}
            const hidden=this.advance(corrected,elapsed,local.incident);
            const before=this.position(local,now),error=distance(before,corrected.p);
            const bounced=!!authoritative.wallBounced!==!!local.shot.wallBounced;
            if(error>.03&&!bounced&&!hidden&&error<3){
                local.offset={p:{x:before.x-corrected.p.x,y:before.y-corrected.p.y,z:before.z-corrected.p.z},at:now};
            }else local.offset=undefined;
            local.shot=corrected;local.hidden=hidden;local.updated=now;
        }
    }
    private retire(id:string):void {
        this.shots.delete(id);this.retired.add(id);
        if(this.retired.size>CHAOS_TUNING.maxShots*2)this.retired.delete(this.retired.values().next().value!);
    }
    private advance(shot:ChaosShot,elapsed:number,incident?:IncidentId):boolean {
        // Match the authoritative semi-implicit 60 Hz integration, Big Cheese included. At
        // most 30 replay steps reconcile a received snapshot; no per-ball world copy.
        const heavy=incident==='big-cheese';
        for(let remaining=elapsed;remaining>1e-8;remaining-=STEP){
            const dt=Math.min(STEP,remaining);shot.age+=dt;
            if(shot.age>shotLife(shot))return true;
            if(heavy)growIn(shot);
            const radius=shot.radius??BALL_RADIUS;
            if(steerQuirk(shot))shot.v.y+=shotGravity(radius)*dt;
            const next={x:shot.p.x+shot.v.x*dt,y:shot.p.y+shot.v.y*dt,z:shot.p.z+shot.v.z*dt};
            const big=radius>BALL_RADIUS+.001,hit=this.trace?.(shot.p,next,big?radius:undefined);
            if(!hit){shot.p=next;continue;}
            // A big ball rests on the surface, clear by its own radius (the authority's offset), never half buried.
            const clear=big?radius+.01:.05;
            shot.p={x:hit.p.x+hit.n.x*clear,y:hit.p.y+hit.n.y*clear,z:hit.p.z+hit.n.z*clear};
            // A reflective coat bounces the ball instead of consuming it, and it
            // stays a rat contact: it never counts as a wall bounce for incidents.
            if(hit.rat&&!hit.reflect)return true;
            if(!hit.rat)shot.wallBounced=true;
            const contact=bounceShot(shot.v,hit.n,radius);quirkBounce(shot);
            if(heavy&&!hit.rat&&bounces(contact,radius))cheeseBounce(shot);
        }
        return false;
    }
    private update(local:LocalShot,now:number):void {
        const dt=Math.min(.1,Math.max(0,(now-local.updated)/1000));local.updated=now;
        if(!local.hidden)local.hidden=this.advance(local.shot,dt,local.incident);
    }
    private position(local:LocalShot,now:number):Vec3Data {
        const p=local.shot.p,offset=local.offset;if(!offset)return p;
        const weight=Math.max(0,1-(now-offset.at)/100);
        if(!weight){local.offset=undefined;return p;}
        return{x:p.x+offset.p.x*weight,y:p.y+offset.p.y*weight,z:p.z+offset.p.z*weight};
    }
    render(state:readonly ChaosShot[],now:number):readonly ChaosShot[] {
        if(!this.shots.size&&!this.retired.size)return state;
        this.merged.length=0;
        for(const [id,local] of this.shots){
            if(local.confirmed===undefined&&now-local.fired>750){this.retire(id);continue;}
            if(local.first){local.first=false;local.updated=now;}else this.update(local,now);
            if(!local.hidden)this.merged.push(local.offset?{...local.shot,p:this.position(local,now)}:local.shot);
        }
        for(const shot of state){
            if(this.merged.length>=CHAOS_TUNING.maxShots)break;
            if(!this.shots.has(shot.id)&&!this.retired.has(shot.id))this.merged.push(shot);
        }
        return this.merged;
    }
    owns(id:string):boolean{return this.shots.has(id)||this.retired.has(id);}
}
