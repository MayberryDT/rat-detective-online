import {BALL_GRAVITY,BALL_LIFETIME,BALL_RESTITUTION} from './ballTuning';
import {CHAOS_TUNING,type ChaosShot,type ChaosState} from './chaosState';
import {resolveShotPattern} from './shotPattern';
import type {IncidentId} from './incidentCatalog';
import type {ServerMessage,ShotDescriptor,Vec3Data} from './networkProtocol';

export type ShotTrace=(from:Vec3Data,to:Vec3Data)=>{p:Vec3Data;n:Vec3Data;rat:boolean;reflect?:boolean}|undefined;
interface LocalShot {
    shot:ChaosShot; trigger:string; fired:number; updated:number; first:boolean;
    confirmed?:number; hidden:boolean; incident?:IncidentId;
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
    fire(owner:string,shot:ShotDescriptor,incident:IncidentId|undefined,now:number):void {
        for(const ball of resolveShotPattern(shot,incident)){
            if(this.shots.has(ball.id)||this.retired.has(ball.id))continue;
            while(this.shots.size>=CHAOS_TUNING.maxShots)this.retire(this.shots.keys().next().value!);
            this.shots.set(ball.id,{shot:{id:ball.id,owner,p:{...shot.origin},v:{...ball.velocity},age:0,original:true},
                trigger:shot.shotId,fired:now,updated:now,first:true,hidden:false,incident});
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
            const expectedVelocity=resolveShotPattern(message,local.incident).find(b=>b.id===ball.id)?.velocity;
            if(!expectedVelocity||distance(expectedVelocity,ball.velocity)>.01){
                const state={...local.shot,p:{...message.origin},v:{...ball.velocity},age:0};
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
            local.incident=state.dispatch.phase==='active'?state.dispatch.incident:undefined;
            if(local.first)continue; // first display frame still starts at muzzle
            this.update(local,now);
            const age=local.shot.age,elapsed=Math.max(0,age-authoritative.age);
            // Normal RTT fits this bound. A very stale sample cannot drag a
            // responsive local shot backwards across half the city.
            if(elapsed>.5)continue;
            const corrected=clone(authoritative);
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
        // Match the authoritative semi-implicit 60 Hz integration. At most
        // 30 replay steps reconcile a received snapshot; no per-ball world copy.
        for(let remaining=elapsed;remaining>1e-8;remaining-=STEP){
            const dt=Math.min(STEP,remaining);shot.age+=dt;
            if(shot.age>BALL_LIFETIME)return true;
            if(shot.stuckUntil){shot.age+=Math.max(0,remaining-dt);return shot.age>BALL_LIFETIME;}
            shot.v.y+=BALL_GRAVITY*dt;
            const next={x:shot.p.x+shot.v.x*dt,y:shot.p.y+shot.v.y*dt,z:shot.p.z+shot.v.z*dt};
            const hit=this.trace?.(shot.p,next);
            if(!hit){shot.p=next;continue;}
            shot.p={x:hit.p.x+hit.n.x*.05,y:hit.p.y+hit.n.y*.05,z:hit.p.z+hit.n.z*.05};
            // A reflective coat bounces the ball instead of consuming it, and it
            // stays a rat contact: it never counts as a wall bounce for incidents.
            if(hit.rat&&!hit.reflect)return true;
            if(!hit.rat)shot.wallBounced=true;
            if(!hit.rat&&incident==='delayed-reaction'&&!shot.delayed){shot.delayed=true;shot.stuckUntil=Number.MAX_SAFE_INTEGER;shot.age+=Math.max(0,remaining-dt);return false;}
            const dot=shot.v.x*hit.n.x+shot.v.y*hit.n.y+shot.v.z*hit.n.z;
            shot.v={x:(shot.v.x-2*dot*hit.n.x)*BALL_RESTITUTION,y:(shot.v.y-2*dot*hit.n.y)*BALL_RESTITUTION,z:(shot.v.z-2*dot*hit.n.z)*BALL_RESTITUTION};
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
