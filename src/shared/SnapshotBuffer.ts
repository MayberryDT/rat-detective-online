/** Render-only poses. Optional server timestamps preserve simulation spacing
 * inside delayed message batches; older servers use monotonic receipt times. */
export interface SnapshotPose { x:number; y:number; z:number; qx:number; qy:number; qz:number; qw:number }
interface TimedPose extends SnapshotPose { time:number; sourceTime?:number }
const MIN_DELAY=100;
const MAX_DELAY=350;
const MAX_SAMPLES=24;
const GAP_RESET=1000;

/** Bounded interpolation history. Never extrapolates a rat through a wall. */
export class SnapshotBuffer {
    protected poses:TimedPose[]=[];
    /** Changes only when interpolation history is discarded. */
    generation=0;
    private interval=80;
    private jitter=0;
    private transitJitter=0;
    protected renderedAt=-Infinity;
    private sampledAt:number|undefined;
    get size():number {return this.poses.length;}
    get delayMs():number {return Math.min(MAX_DELAY,Math.max(MIN_DELAY,this.interval*2+this.jitter*2+this.transitJitter));}

    protected lastReceivedAt:number|undefined;
    private lastServerAt:number|undefined;
    private serverOffset:number|undefined;
    private resetServerBarrier:number|undefined;
    private serverMode=false;
    private clockScale=1;
    private clockWindow?:{server:number;received:number;started:number};
    private clockAnchors:Array<{server:number;received:number}>=[];
    private presentedSource:number|undefined;
    /** Server time represented by the pose returned from the most recent sample. */
    get presentedSourceTime():number|undefined{return this.presentedSource;}

    /** Fit long-window clock rate separately from short packet jitter. Some
     * server runtimes advance their exposed clock more slowly under CPU load.
     * Remapping the cursor and history together preserves the rendered pose. */
    private observeClock(server:number,received:number):void {
        const window=this.clockWindow;
        if(!window){this.clockWindow={server,received,started:received};return;}
        if(received-window.started<1000){
            if(received-server*this.clockScale<window.received-window.server*this.clockScale){window.server=server;window.received=received;}
            return;
        }
        this.clockAnchors.push({server:window.server,received:window.received});
        if(this.clockAnchors.length>8)this.clockAnchors.shift();
        this.clockWindow={server,received,started:received};
        const slopes:number[]=[];
        for(let i=0;i<this.clockAnchors.length;i++)for(let j=i+1;j<this.clockAnchors.length;j++){
            const a=this.clockAnchors[i],b=this.clockAnchors[j];
            if(b.received-a.received>=2000&&b.server>a.server)slopes.push((b.received-a.received)/(b.server-a.server));
        }
        if(slopes.length<3||this.serverOffset===undefined)return;
        slopes.sort((a,b)=>a-b);
        const target=Math.max(.5,Math.min(2,slopes[Math.floor(slopes.length/2)]));
        const scale=this.clockScale+Math.max(-.05,Math.min(.05,target-this.clockScale));
        const offset=Math.min(...this.clockAnchors.map(p=>p.received-p.server*scale));
        const remap=(time:number)=>(time-this.serverOffset!)/this.clockScale*scale+offset;
        for(const pose of this.poses)pose.time=remap(pose.time);
        if(Number.isFinite(this.renderedAt))this.renderedAt=remap(this.renderedAt);
        this.clockScale=scale;this.serverOffset=offset;
    }

    clear():void {
        this.generation++;this.poses.length=0;this.interval=80;this.jitter=0;this.transitJitter=0;this.renderedAt=-Infinity;this.sampledAt=undefined;
        this.lastReceivedAt=undefined;this.lastServerAt=undefined;this.serverOffset=undefined;this.presentedSource=undefined;
        this.resetServerBarrier=undefined;this.serverMode=false;this.clockScale=1;this.clockWindow=undefined;this.clockAnchors.length=0;
    }
    /** Respawn keeps the established clock and rejects already seen old-life samples. */
    reset(pose:SnapshotPose,receivedAt:number):void {
        this.generation++;this.poses=[{...pose,time:receivedAt}];this.renderedAt=-Infinity;this.sampledAt=undefined;this.presentedSource=undefined;
        this.lastReceivedAt=receivedAt;this.resetServerBarrier=this.lastServerAt;
    }
    push(pose:SnapshotPose,receivedAt:number,serverAt?:number):boolean {
        if(!Number.isFinite(receivedAt)||!Object.values(pose).every(Number.isFinite))return false;
        if(this.lastReceivedAt!==undefined&&receivedAt<this.lastReceivedAt)return false;
        const stamped=serverAt!==undefined&&Number.isFinite(serverAt);
        if(stamped&&((this.lastServerAt!==undefined&&serverAt<this.lastServerAt)||
            (this.resetServerBarrier!==undefined&&serverAt<=this.resetServerBarrier)))return false;
        const previousReceipt=this.lastReceivedAt;
        const previousServer=this.lastServerAt;
        let time=receivedAt;
        if(stamped) {
            this.observeClock(serverAt,receivedAt);
            const candidate=receivedAt-serverAt*this.clockScale;
            // The lowest observed transit offset is the clock mapping baseline.
            // A delayed packet never moves that baseline or drags every rat back.
            if(this.serverOffset===undefined)this.serverOffset=candidate;
            else if(candidate<this.serverOffset) {
                const change=candidate-this.serverOffset;this.serverOffset=candidate;
                for(const old of this.poses)old.time+=change;
                if(Number.isFinite(this.renderedAt))this.renderedAt+=change;
            }
            time=serverAt*this.clockScale+this.serverOffset;
            this.transitJitter=Math.max(this.transitJitter*.98,Math.min(250,receivedAt-time));
            this.lastServerAt=serverAt;
        } else if(this.serverMode) {
            // A legacy/reconnected sender has no source timeline to compare.
            this.generation++;this.poses.length=0;this.renderedAt=-Infinity;this.sampledAt=undefined;this.serverOffset=undefined;this.transitJitter=0;
            this.lastServerAt=undefined;this.resetServerBarrier=undefined;this.clockScale=1;this.clockWindow=undefined;this.clockAnchors.length=0;
        }
        this.serverMode=stamped;this.lastReceivedAt=receivedAt;
        const previous=this.poses[this.poses.length-1];
        const receiptGap=previousReceipt===undefined?0:receivedAt-previousReceipt;
        const sourceGap=stamped&&previousServer!==undefined?(serverAt-previousServer)*this.clockScale:
            previous?time-previous.time:0;
        if(!previous||receiptGap>=GAP_RESET||sourceGap>=GAP_RESET||
            Math.hypot(pose.x-previous.x,pose.y-previous.y,pose.z-previous.z)>60) {
            this.generation++;this.poses=[{...pose,time}];this.renderedAt=-Infinity;this.sampledAt=undefined;return true;
        }
        // A first post-respawn packet can map just before the local reset pose;
        // preserve the fresh position rather than interpolate back into the old life.
        if(time<=previous.time) {
            this.poses[this.poses.length-1]={...pose,time:Math.max(time,previous.time)};
            return true;
        }
        if(sourceGap>=1) {
            const deviation=stamped&&previousServer!==undefined?
                Math.abs(receiptGap-sourceGap):Math.abs(sourceGap-this.interval);
            this.interval+=(Math.min(250,sourceGap)-this.interval)*.15;
            this.jitter+=(Math.min(150,deviation)-this.jitter)*.12;
        }
        this.poses.push({...pose,time,...(stamped?{sourceTime:serverAt}:{})});
        if(this.poses.length>MAX_SAMPLES)this.poses.shift();
        return true;
    }
    sample(now:number):SnapshotPose|undefined {
        if(!this.poses.length)return undefined;
        // A rising adaptive delay must never make the animation run backwards.
        const target=now-this.delayMs;
        const elapsed=this.sampledAt===undefined?0:Math.max(0,now-this.sampledAt);
        // Adjust playback speed gently instead of freezing when delay grows or
        // jumping forward when jitter subsides. Never invent a future pose.
        const error=target-(this.renderedAt+elapsed);
        const rate=1+Math.max(-.1,Math.min(.1,error/1000));
        const proposed=Number.isFinite(this.renderedAt)&&elapsed<1000?
            this.renderedAt+elapsed*rate:target;
        // Stop the playback clock at the newest known pose on underrun. Let
        // arriving samples refill history instead of accumulating catch-up debt.
        const latest=this.poses[this.poses.length-1].time;
        const time=Math.max(this.poses[0].time,Math.min(proposed,Math.max(this.renderedAt,latest)));
        this.sampledAt=now;this.renderedAt=time;
        while(this.poses.length>2&&this.poses[1].time<=time)this.poses.shift();
        const first=this.poses[0],last=this.poses[this.poses.length-1];
        if(time<=first.time){this.presentedSource=first.sourceTime;return this.copy(first);}
        if(time>=last.time){this.presentedSource=last.sourceTime;return this.copy(last);}
        let right=1;while(this.poses[right].time<time)right++;
        const a=this.poses[right-1],b=this.poses[right];
        const t=(time-a.time)/(b.time-a.time);
        this.presentedSource=a.sourceTime!==undefined&&b.sourceTime!==undefined?a.sourceTime+(b.sourceTime-a.sourceTime)*t:undefined;
        let bx=b.qx,by=b.qy,bz=b.qz,bw=b.qw;
        let dot=a.qx*bx+a.qy*by+a.qz*bz+a.qw*bw;
        if(dot<0){dot=-dot;bx=-bx;by=-by;bz=-bz;bw=-bw;}
        let u=1-t,v=t;
        if(dot<.9995){const angle=Math.acos(Math.min(1,dot)),s=Math.sin(angle);u=Math.sin((1-t)*angle)/s;v=Math.sin(t*angle)/s;}
        const qx=a.qx*u+bx*v,qy=a.qy*u+by*v,qz=a.qz*u+bz*v,qw=a.qw*u+bw*v;
        const length=Math.hypot(qx,qy,qz,qw)||1;
        return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,qx:qx/length,qy:qy/length,qz:qz/length,qw:qw/length};
    }
    private copy(p:SnapshotPose):SnapshotPose {return {x:p.x,y:p.y,z:p.z,qx:p.qx,qy:p.qy,qz:p.qz,qw:p.qw};}
}

/** AI timestamps describe fixed simulation steps, not a stable wall clock.
 * Render these streams on monotonic delivery time. Distinct steps delivered in
 * one batch retain source spacing; authoritative stale/lifecycle guards remain.
 * A 250 ms floor covers five ordinary AI updates without extrapolation. */
export class BotSnapshotBuffer extends SnapshotBuffer {
    private sourceSeen:number|undefined;
    private sourceBarrier:number|undefined;
    private renderedPose:SnapshotPose|undefined;
    override get delayMs():number {return Math.max(250,super.delayMs);}
    override clear():void {super.clear();this.sourceSeen=undefined;this.sourceBarrier=undefined;this.renderedPose=undefined;}
    override reset(pose:SnapshotPose,receivedAt:number):void {
        super.reset(pose,receivedAt);this.sourceBarrier=this.sourceSeen;this.renderedPose=undefined;
    }
    override sample(now:number):SnapshotPose|undefined {
        // Suppressed stationary updates arrive as sparse heartbeats. Advancing
        // through identical known poses changes no displayed position/rotation
        // and prevents a stopped rat carrying old clock debt into its next move.
        if(this.renderedPose&&Number.isFinite(this.renderedAt)){
            const target=now-this.delayMs;
            for(const pose of this.poses){
                if(pose.time<=this.renderedAt)continue;
                const p=this.renderedPose;
                if(pose.x!==p.x||pose.y!==p.y||pose.z!==p.z||pose.qx!==p.qx||pose.qy!==p.qy||pose.qz!==p.qz||pose.qw!==p.qw)break;
                this.renderedAt=Math.max(this.renderedAt,Math.min(target,pose.time));
                if(this.renderedAt>=target)break;
            }
        }
        this.renderedPose=super.sample(now);return this.renderedPose;
    }
    override push(pose:SnapshotPose,receivedAt:number,serverAt?:number):boolean {
        if(!Number.isFinite(receivedAt)||!Object.values(pose).every(Number.isFinite)||
            (this.lastReceivedAt!==undefined&&receivedAt<this.lastReceivedAt))return false;
        const stamped=serverAt!==undefined&&Number.isFinite(serverAt);
        if(stamped&&((this.sourceSeen!==undefined&&serverAt<this.sourceSeen)||
            (this.sourceBarrier!==undefined&&serverAt<=this.sourceBarrier)))return false;
        if(stamped&&this.sourceSeen!==undefined&&serverAt-this.sourceSeen>=GAP_RESET){
            super.reset(pose,receivedAt);this.sourceSeen=serverAt;return true;
        }
        const receiptGap=this.lastReceivedAt===undefined?Infinity:receivedAt-this.lastReceivedAt;
        const sourceGap=stamped&&this.sourceSeen!==undefined?serverAt-this.sourceSeen:0;
        if(receiptGap>250&&receiptGap<GAP_RESET&&this.renderedPose&&Number.isFinite(this.renderedAt)){
            // On recovery from a delivery gap, interpolate from the pose already
            // displayed over the normal reserve. Replaying the empty time span
            // would retain avoidable delay after packets have resumed.
            this.renderedAt=Math.max(this.renderedAt,receivedAt-this.delayMs);
            this.poses=[{...this.renderedPose,time:this.renderedAt}];
        }
        // WebSocket bursts can span several receipt milliseconds. Preserve their
        // simulation spacing without treating ordinary delivery jitter as a batch.
        if(sourceGap>0&&receiptGap<=Math.min(10,sourceGap*.25)){
            let nextTime=receivedAt,nextSource=serverAt!;
            for(let i=this.poses.length-1;i>=0;i--){
                const old=this.poses[i];
                const spacing=Math.min(250,Math.max(0,nextSource-(old.sourceTime??nextSource-sourceGap)));
                const target=nextTime-spacing;
                if(old.time<=target)break;
                old.time=target;nextTime=target;nextSource=old.sourceTime??nextSource-spacing;
            }
            // Reflow only the pending poses. Moving the playback clock backward
            // on every burst accumulates seconds of lag and eventually skips at
            // the history limit. Anchor the pose already shown at its same time.
            if(Number.isFinite(this.renderedAt)&&this.renderedPose){
                this.poses=this.poses.filter(p=>p.time>this.renderedAt);
                this.poses.unshift({...this.renderedPose,time:this.renderedAt});
            }
        }
        const accepted=super.push(pose,receivedAt);
        if(accepted){this.sourceSeen=stamped?serverAt:undefined;this.poses[this.poses.length-1].sourceTime=this.sourceSeen;if(!stamped)this.sourceBarrier=undefined;}
        return accepted;
    }
}
