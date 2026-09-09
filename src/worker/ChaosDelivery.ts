import type { ChaosState, ChaosImpact, PressureLaunchEvent } from '../shared/chaosState';
import { ChaosEncoder, type PreparedChaos, type ChaosAck } from '../shared/chaosWire';
export const MAX_CHAOS_IN_FLIGHT=4;
export const CHAOS_ACK_TIMEOUT_MS=5000;

/** Per-socket bounded flow control. Only replaceable state is coalesced.
 * Cosmetic impacts retain only the newest bounded effects under congestion.
 * Launch cues remain queued; their overflow closes/resyncs the connection. */
export class ChaosDelivery {
  private readonly encoder:ChaosEncoder;
  constructor(deltaMotion=false){this.encoder=new ChaosEncoder(undefined,deltaMotion);}
  private outstanding:Array<{seq:number;at:number}>=[];
  private impacts:ChaosImpact[]=[];
  private launches:PressureLaunchEvent[]=[];
  private seenLaunches=new Set<string>();
  private lastAck=0;
  coalesced=0;
  acknowledge(ack:ChaosAck):void {
    if(ack.stream!==this.encoder.stream||ack.seq<=this.lastAck||!this.outstanding.some(f=>f.seq===ack.seq))return;
    this.lastAck=ack.seq;this.outstanding=this.outstanding.filter(f=>f.seq>ack.seq);
  }
  offer(state:ChaosState,now:number,prepared?:PreparedChaos):string|null {
    if(this.outstanding.length&&now-this.outstanding[0].at>CHAOS_ACK_TIMEOUT_MS)throw new Error('Snapshot acknowledgement timed out');
    this.impacts.push(...state.impacts);
    if(this.impacts.length>256)this.impacts.splice(0,this.impacts.length-256);
    for(const event of state.pressure?.launches??[])if(!this.seenLaunches.has(event.id)){
      this.seenLaunches.add(event.id);this.launches.push(event);
    }
    while(this.seenLaunches.size>256)this.seenLaunches.delete(this.seenLaunches.values().next().value!);
    if(this.launches.length>48)throw new Error('Pending snapshot events exceeded budget');
    if(this.outstanding.length>=MAX_CHAOS_IN_FLIGHT){this.coalesced++;return null;}
    const delivered:ChaosState={...state,impacts:this.impacts.slice(0,64),...(state.pressure?{pressure:{...state.pressure,launches:this.launches.slice(0,24)}}:{})};
    const frame=this.encoder.encode(delivered,prepared);
    this.impacts.splice(0,64);if(state.pressure)this.launches.splice(0,24);
    this.outstanding.push({seq:frame.seq,at:now});
    return frame.payload;
  }
  get inFlight():number{return this.outstanding.length;}
}
