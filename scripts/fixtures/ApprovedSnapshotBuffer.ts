/** Render-only poses. Optional server timestamps preserve simulation spacing
 * inside delayed message batches; older servers use monotonic receipt times. */
export interface SnapshotPose { x:number; y:number; z:number; qx:number; qy:number; qz:number; qw:number }
interface TimedPose extends SnapshotPose { time:number }
const MIN_DELAY=100;
const MAX_DELAY=350;
const MAX_SAMPLES=24;
const GAP_RESET=1000;

/** Bounded interpolation history. Never extrapolates a rat through a wall. */
export class SnapshotBuffer {
    private poses:TimedPose[]=[];
    /** Changes only when interpolation history is discarded. */
    generation=0;
    private interval=80;
    private jitter=0;
    private transitJitter=0;
    private renderedAt=-Infinity;
    private sampledAt:number|undefined;
    get size():number {return this.poses.length;}
    get delayMs():number {return Math.min(MAX_DELAY,Math.max(MIN_DELAY,this.interval*2+this.jitter*2+this.transitJitter));}

    private lastReceivedAt:number|undefined;
    private lastServerAt:number|undefined;
    private serverOffset:number|undefined;
    private resetServerBarrier:number|undefined;
    private serverMode=false;

    clear():void {
        this.generation++;this.poses.length=0;this.interval=80;this.jitter=0;this.transitJitter=0;this.renderedAt=-Infinity;this.sampledAt=undefined;
        this.lastReceivedAt=undefined;this.lastServerAt=undefined;this.serverOffset=undefined;
        this.resetServerBarrier=undefined;this.serverMode=false;
    }
    /** Respawn keeps the established clock and rejects already seen old-life samples. */
    reset(pose:SnapshotPose,receivedAt:number):void {
        this.generation++;this.poses=[{...pose,time:receivedAt}];this.renderedAt=-Infinity;this.sampledAt=undefined;
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
            const candidate=receivedAt-serverAt;
            // The lowest observed transit offset is the clock mapping baseline.
            // A delayed packet never moves that baseline or drags every rat back.
            if(this.serverOffset===undefined)this.serverOffset=candidate;
            else if(candidate<this.serverOffset) {
                const change=candidate-this.serverOffset;this.serverOffset=candidate;
                for(const old of this.poses)old.time+=change;
                if(Number.isFinite(this.renderedAt))this.renderedAt+=change;
            }
            time=serverAt+this.serverOffset;
            this.transitJitter=Math.max(this.transitJitter*.98,Math.min(250,receivedAt-time));
            this.lastServerAt=serverAt;
        } else if(this.serverMode) {
            // A legacy/reconnected sender has no source timeline to compare.
            this.generation++;this.poses.length=0;this.renderedAt=-Infinity;this.sampledAt=undefined;this.serverOffset=undefined;this.transitJitter=0;
            this.lastServerAt=undefined;this.resetServerBarrier=undefined;
        }
        this.serverMode=stamped;this.lastReceivedAt=receivedAt;
        const previous=this.poses[this.poses.length-1];
        const receiptGap=previousReceipt===undefined?0:receivedAt-previousReceipt;
        const sourceGap=stamped&&previousServer!==undefined?serverAt-previousServer:
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
        this.poses.push({...pose,time});
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
        if(time<=first.time)return this.copy(first);
        if(time>=last.time)return this.copy(last);
        let right=1;while(this.poses[right].time<time)right++;
        const a=this.poses[right-1],b=this.poses[right];
        const t=(time-a.time)/(b.time-a.time);
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
