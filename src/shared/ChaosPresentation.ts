import { CHAOS_TUNING, type ChaosShot, type ChaosState, type PhysicalPose } from './chaosState';
import type { QuatData, Vec3Data, ServerMessage } from './networkProtocol';

export interface PresentationPose { p: Vec3Data; q: QuatData }
interface Sample { time:number; p:Vec3Data; v:Vec3Data; q:QuatData; charged:boolean; corner?:{time:number;p:Vec3Data} }
interface Track { samples:Sample[]; seen:number; blockExtrapolation:boolean; lastTime:number; clockCorrection:number; sampledAt:number; birth?:Sample; muzzleOffset?:{p:Vec3Data;at:number} }
const identity:QuatData={x:0,y:0,z:0,w:1};
const distance=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const speed=(v:Vec3Data)=>Math.hypot(v.x,v.y,v.z);
const HISTORY=32;
const MAX_EXTRAPOLATION=80;

/** Presentation only. One gently slewed, jitter-aware playback clock drives
 * balls, bodies and cases. New objects join without a second visual projectile. */
export class ChaosPresentation {
    private shots=new Map<string,Track>();
    private launches=new Map<string,{shot:ChaosShot;at:number;arrival:number}>();
    private seenLaunches=new Set<string>();
    private readonly mergedShots:ChaosShot[]=[];
    private renderedState?:readonly ChaosShot[];
    private renderDirty=true;
    private corpses=new Map<string,Track>();
    private caseTrack?:Track;
    private caseLifecycle='';
    private serial=0;
    private latestTime=-Infinity;
    private latestArrival=-Infinity;
    private interval=1000/30;
    private jitter=0;
    private clockAt=-Infinity;
    private clockValue=-Infinity;
    constructor(private readonly minimumDelay=100){}
    private get delayMs():number{return Math.min(350,Math.max(this.minimumDelay,this.interval*2+this.jitter));}
    clear():void {
        this.shots.clear();this.corpses.clear();this.caseTrack=undefined;this.caseLifecycle='';
        this.launches.clear();this.seenLaunches.clear();
        this.mergedShots.length=0;this.renderedState=undefined;this.renderDirty=true;
        this.latestTime=-Infinity;this.latestArrival=-Infinity;this.serial=0;
        this.interval=1000/30;this.jitter=0;this.clockAt=-Infinity;this.clockValue=-Infinity;
    }
    /** The server's real birth event joins the same ID/history used by snapshots.
     * Never manufacture a second local ball or guess an incident's direction. */
    launch(message:Extract<ServerMessage,{type:'playerShot'}>,arrival:number):void {
        const launch=message.launch;
        if(!launch||!Number.isFinite(arrival)||launch.at<this.latestTime-500)return;
        for(const ball of launch.balls){
            if(this.seenLaunches.has(ball.id))continue;
            this.seenLaunches.add(ball.id);
            if(this.seenLaunches.size>CHAOS_TUNING.maxShots*2)this.seenLaunches.delete(this.seenLaunches.values().next().value!);
            if(this.shots.has(ball.id))continue;
            if(this.shots.size>=CHAOS_TUNING.maxShots){
                const oldest=this.shots.keys().next().value!;this.shots.delete(oldest);this.launches.delete(oldest);
            }
            const shot:ChaosShot={id:ball.id,owner:message.shooterId,p:{...message.origin},v:{...ball.velocity},age:0};
            const track=this.push(undefined,launch.at,arrival,shot.p,shot.v,identity,false);
            track.birth=track.samples[0];this.shots.set(ball.id,track);
            this.launches.set(ball.id,{shot,at:launch.at,arrival});
            this.renderDirty=true;
        }
    }
    renderShots(state:readonly ChaosShot[],now:number):readonly ChaosShot[] {
        for(const [id,launch] of this.launches)if(now-launch.arrival>500){this.launches.delete(id);this.shots.delete(id);this.renderDirty=true;}
        if(!this.launches.size)return state;
        // Fresh real shots get a slot even when the preceding snapshot was full.
        // Rebuild only when membership changes, never allocate arrays per frame.
        if(this.renderDirty||state!==this.renderedState){
            this.mergedShots.length=0;
            for(const launch of this.launches.values())this.mergedShots.push(launch.shot);
            for(const shot of state){
                if(this.mergedShots.length===CHAOS_TUNING.maxShots)break;
                if(!this.launches.has(shot.id))this.mergedShots.push(shot);
            }
            this.renderedState=state;this.renderDirty=false;
        }
        return this.mergedShots;
    }
    apply(state:ChaosState,arrival:number):void {
        if(!Number.isFinite(state.time)||!Number.isFinite(arrival))return;
        const reset=!Number.isFinite(this.latestTime)||state.time<this.latestTime||arrival<this.latestArrival||
            state.time-this.latestTime>=1000||arrival-this.latestArrival>=1000;
        if(reset)this.clear();
        else {
            const sourceGap=state.time-this.latestTime,receiptGap=arrival-this.latestArrival;
            this.interval+=(Math.min(250,sourceGap)-this.interval)*.15;
            this.jitter=Math.max(this.jitter*.98,Math.min(250,Math.abs(receiptGap-sourceGap)));
        }
        this.latestTime=state.time;this.latestArrival=arrival;this.serial++;
        this.renderDirty=true;
        for(let i=0;i<Math.min(state.shots.length,CHAOS_TUNING.maxShots);i++){
            const shot=state.shots[i];
            this.shots.set(shot.id,this.push(this.shots.get(shot.id),state.time,arrival,shot.p,shot.v,identity,!!shot.wallBounced));
        }
        for(const [id,track] of this.shots)if(track.seen!==this.serial&&(this.launches.get(id)?.at??-Infinity)<=state.time)this.shots.delete(id);
        for(const [id,launch] of this.launches)if(this.shots.get(id)?.seen===this.serial||state.time>=launch.at)this.launches.delete(id);
        for(let i=0;i<Math.min(state.corpses.length,CHAOS_TUNING.maxCorpses);i++){
            const corpse=state.corpses[i];
            this.corpses.set(corpse.id,this.push(this.corpses.get(corpse.id),state.time,arrival,corpse.p,corpse.v,corpse.q,false));
        }
        for(const [id,track] of this.corpses)if(track.seen!==this.serial)this.corpses.delete(id);
        const lifecycle=`${state.case.owner??'loose'}:${state.case.returningUntil}`;
        if(lifecycle!==this.caseLifecycle){this.caseTrack=undefined;this.caseLifecycle=lifecycle;}
        if(state.case.owner)this.caseTrack=undefined;
        else this.caseTrack=this.push(this.caseTrack,state.time,arrival,state.case.p,state.case.v,state.case.q,false);
    }
    private push(track:Track|undefined,time:number,arrival:number,p:Vec3Data,v:Vec3Data,q:QuatData,charged:boolean):Track {
        const sample:Sample={time,p,v,q,charged};
        if(!track)return{samples:[sample],seen:this.serial,blockExtrapolation:false,lastTime:-Infinity,clockCorrection:time-this.clock(arrival),sampledAt:arrival};
        const previous=track.samples[track.samples.length-1],dt=Math.max(0,(time-previous.time)/1000);
        const oldSpeed=speed(previous.v),newSpeed=speed(v);
        const dot=previous.v.x*v.x+previous.v.y*v.y+previous.v.z*v.z;
        const bounce=charged!==previous.charged||(oldSpeed>2&&newSpeed>2&&dot/(oldSpeed*newSpeed)<.55);
        const teleport=distance(previous.p,p)>Math.max(8,Math.max(oldSpeed,newSpeed)*dt*1.8+3);
        if(bounce)track.muzzleOffset=undefined;
        if(bounce&&!teleport&&dt>0){
            // Reconstruct a single rebound between two observed endpoints. No
            // collision prediction: reject inconsistent/multiple-bounce fits.
            const dv={x:previous.v.x-v.x,y:previous.v.y-v.y,z:previous.v.z-v.z};
            const length=dv.x*dv.x+dv.y*dv.y+dv.z*dv.z;
            const at=((p.x-previous.p.x-v.x*dt)*dv.x+(p.y-previous.p.y-v.y*dt)*dv.y+(p.z-previous.p.z-v.z*dt)*dv.z)/length;
            if(at>0&&at<dt){
                const a={x:previous.p.x+previous.v.x*at,y:previous.p.y+previous.v.y*at,z:previous.p.z+previous.v.z*at};
                const b={x:p.x-v.x*(dt-at),y:p.y-v.y*(dt-at),z:p.z-v.z*(dt-at)};
                if(distance(a,b)<.6)sample.corner={time:previous.time+at*1000,p:{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2}};
            }
        }
        if((bounce&&track.birth)||teleport){
            track.samples.length=0;track.blockExtrapolation=true;track.lastTime=-Infinity;
            track.birth=undefined;track.muzzleOffset=undefined;track.sampledAt=arrival;
            track.clockCorrection=time-this.clock(arrival);
        } else if(time>previous.time)track.blockExtrapolation=bounce;
        if(track.samples.length&&time===previous.time)track.samples[track.samples.length-1]=sample;
        else {track.samples.push(sample);if(track.samples.length>HISTORY)track.samples.splice(track.birth?1:0,1);}
        track.seen=this.serial;return track;
    }
    private clock(now:number):number {
        if(now!==this.clockAt){
            // Keep the cursor in simulation time. Re-estimating an offset on
            // every packet moves the whole scene when delayed packets arrive.
            // Refill a 100–350 ms reserve at 90–110% speed, including recovery
            // from bursts; stop at the bounded prediction edge without debt.
            const elapsed=Math.max(0,now-this.clockAt);
            const target=this.latestTime+Math.min(MAX_EXTRAPOLATION,Math.max(0,now-this.latestArrival))-this.delayMs;
            const rate=1+Math.max(-.1,Math.min(.1,(target-this.clockValue-elapsed)/500));
            const proposed=Number.isFinite(this.clockValue)&&elapsed<1000?this.clockValue+elapsed*rate:target;
            this.clockValue=Math.max(this.clockValue,Math.min(this.latestTime+MAX_EXTRAPOLATION,proposed));
            this.clockAt=now;
        }
        return this.clockValue;
    }
    private sample(track:Track|undefined,now:number,out:PresentationPose,muzzle?:()=>Vec3Data):boolean {
        if(!track)return false;
        if(track.birth){
            // Anchor the first rendered sample, not its receipt callback. A
            // physics snapshot may arrive between that callback and the frame.
            const birth=track.birth;track.birth=undefined;
            track.lastTime=birth.time;track.clockCorrection=birth.time-this.clock(now);track.sampledAt=now;
            Object.assign(out.p,birth.p);Object.assign(out.q,birth.q);
            // Confirmation can arrive after the owner has moved/turned. Align
            // this one confirmed ball with the current animated barrel on its
            // first draw, then remove the small render offset over 100 ms.
            // The server origin, velocity and collision state never move.
            const origin=muzzle?.();
            if(origin&&distance(origin,birth.p)<=6){
                track.muzzleOffset={p:{x:origin.x-birth.p.x,y:origin.y-birth.p.y,z:origin.z-birth.p.z},at:now};
                Object.assign(out.p,origin);
            }
            return true;
        }
        const elapsed=Math.max(0,now-track.sampledAt);track.sampledAt=now;
        // Join the shared reserve gradually. A fixed 300 ms blend can stop a
        // new ball entirely when the jitter reserve is larger than that blend.
        const correction=track.clockCorrection;
        track.clockCorrection-=Math.sign(correction)*Math.min(Math.abs(correction),elapsed*.25);
        const samples=track.samples,last=samples[samples.length-1];
        const time=Math.max(track.lastTime,Math.min(last.time+(track.blockExtrapolation?0:MAX_EXTRAPOLATION),
            this.clock(now)+track.clockCorrection));
        track.lastTime=time;
        let a=samples[0],b=a;
        for(let i=1;i<samples.length;i++){
            b=samples[i];if(b.time>=time)break;a=b;
        }
        if(time>=last.time){
            const elapsed=track.blockExtrapolation?0:Math.min(MAX_EXTRAPOLATION/1000,Math.max(0,(time-last.time)/1000));
            out.p.x=last.p.x+last.v.x*elapsed;out.p.y=last.p.y+last.v.y*elapsed;out.p.z=last.p.z+last.v.z*elapsed;
            Object.assign(out.q,last.q);this.alignMuzzle(track,now,out);return true;
        }
        const t=a.time===b.time?0:Math.min(1,Math.max(0,(time-a.time)/(b.time-a.time)));
        out.p.x=a.p.x+(b.p.x-a.p.x)*t;out.p.y=a.p.y+(b.p.y-a.p.y)*t;out.p.z=a.p.z+(b.p.z-a.p.z)*t;
        if(b.corner&&a.time<b.corner.time&&b.corner.time<b.time){
            const before=time<=b.corner.time,from=before?a.p:b.corner.p,to=before?b.corner.p:b.p;
            const start=before?a.time:b.corner.time,end=before?b.corner.time:b.time;
            const u=Math.max(0,Math.min(1,(time-start)/(end-start)));
            out.p.x=from.x+(to.x-from.x)*u;out.p.y=from.y+(to.y-from.y)*u;out.p.z=from.z+(to.z-from.z)*u;
        }
        // Shortest-arc quaternion interpolation; normalize without allocating a
        // Three.js quaternion for each ragdoll on every presentation frame.
        const sign=a.q.x*b.q.x+a.q.y*b.q.y+a.q.z*b.q.z+a.q.w*b.q.w<0?-1:1;
        out.q.x=a.q.x+(b.q.x*sign-a.q.x)*t;out.q.y=a.q.y+(b.q.y*sign-a.q.y)*t;
        out.q.z=a.q.z+(b.q.z*sign-a.q.z)*t;out.q.w=a.q.w+(b.q.w*sign-a.q.w)*t;
        const norm=Math.hypot(out.q.x,out.q.y,out.q.z,out.q.w)||1;
        out.q.x/=norm;out.q.y/=norm;out.q.z/=norm;out.q.w/=norm;this.alignMuzzle(track,now,out);return true;
    }
    private alignMuzzle(track:Track,now:number,out:PresentationPose):void {
        const offset=track.muzzleOffset;if(!offset)return;
        const weight=Math.max(0,1-(now-offset.at)/100);
        out.p.x+=offset.p.x*weight;out.p.y+=offset.p.y*weight;out.p.z+=offset.p.z*weight;
        if(!weight)track.muzzleOffset=undefined;
    }
    shot(id:string,now:number,out:PresentationPose,muzzle?:()=>Vec3Data):boolean{return this.sample(this.shots.get(id),now,out,muzzle);}
    corpse(id:string,now:number,out:PresentationPose):boolean{return this.sample(this.corpses.get(id),now,out);}
    looseCase(now:number,out:PresentationPose):boolean{return this.sample(this.caseTrack,now,out);}
    diagnostics(){return{shots:this.shots.size,corpses:this.corpses.size,maxSamples:HISTORY,delayMs:this.delayMs};}
}

export function copyPresentationPose(pose:Pick<PhysicalPose,'p'|'q'>,out:PresentationPose):void {
    Object.assign(out.p,pose.p);Object.assign(out.q,pose.q);
}
