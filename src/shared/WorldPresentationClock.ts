import {SnapshotBuffer,type SnapshotPose} from './SnapshotBuffer';

const MIN_DELAY=100;
const MAX_DELAY=350;
const MAX_EXTRAPOLATION=80;
const RESET_GAP=1000;

/** One mapping from room source time to a buffered display time. Remote rats,
 * cheese balls, bodies and cases all sample this cursor, so a single room
 * second means one presented second everywhere. The cursor stays in simulation
 * time: it refills a 100-350 ms reserve at 90-110% speed, including recovery
 * from delivery bursts, and stops at the bounded prediction edge without
 * accumulating future debt. */
export class WorldPresentationClock {
    private latest=-Infinity;
    private receipt=-Infinity;
    private interval=1000/30;
    private jitter=0;
    private clockAt=-Infinity;
    private clockValue=-Infinity;
    generation=0;
    constructor(private readonly minimumDelay=MIN_DELAY){}
    get latestTime():number{return this.latest;}
    get delayMs():number{return Math.min(MAX_DELAY,Math.max(this.minimumDelay,this.interval*2+this.jitter));}
    clear():void{
        this.latest=this.receipt=this.clockAt=this.clockValue=-Infinity;
        this.interval=1000/30;this.jitter=0;this.generation++;
    }
    /** Latest-source wins. A delayed or reordered observation must never pull
     * balls, bodies, cases or rats backward, so it is simply ignored. */
    observe(sourceTime:number,receivedAt:number):void {
        if(!Number.isFinite(sourceTime)||!Number.isFinite(receivedAt))return;
        if(!Number.isFinite(this.latest)){this.latest=sourceTime;this.receipt=receivedAt;return;}
        if(sourceTime<this.latest||receivedAt<this.receipt)return;
        const sourceGap=sourceTime-this.latest,receiptGap=receivedAt-this.receipt;
        if(sourceGap>=RESET_GAP||receiptGap>=RESET_GAP){this.reanchor(sourceTime,receivedAt);return;}
        if(sourceGap>0){
            this.interval+=(Math.min(250,sourceGap)-this.interval)*.15;
            this.jitter=Math.max(this.jitter*.98,Math.min(250,Math.abs(receiptGap-sourceGap)));
        }
        this.latest=sourceTime;this.receipt=receivedAt;
    }
    /** Start a new source epoch (round reset or reconnect) without a warp. */
    reanchor(sourceTime:number,receivedAt:number):void {
        this.clear();this.latest=sourceTime;this.receipt=receivedAt;
    }
    sample(now:number):number{
        if(now!==this.clockAt){
            const elapsed=Math.max(0,now-this.clockAt);
            const target=this.latest+Math.min(MAX_EXTRAPOLATION,Math.max(0,now-this.receipt))-this.delayMs;
            let proposed=target;
            if(Number.isFinite(this.clockValue)&&elapsed<RESET_GAP){
                // Ease the cursor toward the reserve instead of jumping the whole
                // scene when a burst lands late.
                const rate=1+Math.max(-.1,Math.min(.1,(target-this.clockValue-elapsed)/500));
                proposed=this.clockValue+elapsed*rate;
            }
            this.clockValue=Math.max(this.clockValue,Math.min(this.latest+MAX_EXTRAPOLATION,proposed));
            this.clockAt=now;
        }
        return this.clockValue;
    }
    diagnostics(now:number){const at=this.sample(now);return{delayMs:this.delayMs,latestTime:this.latest,presentedTime:at,sourceReserveMs:this.latest-at};}
}

/** Raw source history sampled on the room clock. There is no AI-only floor and
 * no second per-rat receipt clock. Lifecycle barriers remain in SnapshotBuffer. */
export class WorldSnapshotBuffer extends SnapshotBuffer {
    constructor(private readonly clock:WorldPresentationClock){super();}
    override get delayMs():number{return this.clock.delayMs;}
    override push(pose:SnapshotPose,receivedAt:number,serverAt?:number):boolean {
        const at=serverAt??this.clock.latestTime;
        if(!Number.isFinite(receivedAt)||!Number.isFinite(at))return false;
        return super.push(pose,at,at);
    }
    override reset(pose:SnapshotPose,receivedAt:number,sourceAt?:number):void {
        super.reset(pose,sourceAt??(Number.isFinite(this.clock.latestTime)?this.clock.latestTime:receivedAt));
    }
    override sample(now:number):SnapshotPose|undefined{return this.sampleAt(this.clock.sample(now));}
}
