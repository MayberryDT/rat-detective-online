import type { ChaosState, ChaosImpact, PressureLaunchEvent } from '../shared/chaosState';
import { ChaosEncoder, type PreparedChaos, type ChaosAck } from '../shared/chaosWire';
import { serializeServerMessage } from './serializeServerMessage';
import { wireBytes } from '../shared/deliveryWire';
export const MAX_CHAOS_IN_FLIGHT=8;
export const CHAOS_ACK_TIMEOUT_MS=5000;

/** Per-socket bounded flow control. Only replaceable state is coalesced.
 * Cosmetic impacts retain only the newest bounded effects under congestion.
 * Launch cues remain queued; their overflow closes/resyncs the connection. */
export class ChaosDelivery {
  private readonly encoder:ChaosEncoder;
  private legacySeq=0;
  constructor(deltaMotion=false,private readonly legacy=false){this.encoder=new ChaosEncoder(undefined,deltaMotion);}
  private outstanding:Array<{seq:number;at:number}>=[];
  private impacts:ChaosImpact[]=[];
  private launches:PressureLaunchEvent[]=[];
  private seenLaunches=new Set<string>();
  private lastAck=0;
  private resumeUntil=0;
  resumed(now:number):void { this.resumeUntil=now+250; }
  coalesced=0;
  lastFrame: ReturnType<ChaosEncoder['encode']> | undefined;
  acknowledge(ack:ChaosAck):void {
    if(ack.stream!==this.encoder.stream||ack.seq<=this.lastAck||!this.outstanding.some(f=>f.seq===ack.seq))return;
    this.lastAck=ack.seq;this.outstanding=this.outstanding.filter(f=>f.seq>ack.seq);
  }
  offer(state:ChaosState,now:number,prepared?:PreparedChaos,ready=true,legacyFrame?:{payload:string;bytes:number}):string|null {
    if(now>=this.resumeUntil&&this.outstanding.length&&now-this.outstanding[0].at>CHAOS_ACK_TIMEOUT_MS)throw new Error('Snapshot acknowledgement timed out');
    const freshImpacts=this.impacts.length===0 && state.impacts.length<=64;
    this.impacts.push(...state.impacts);
    if(this.impacts.length>256)this.impacts.splice(0,this.impacts.length-256);
    for(const event of state.pressure?.launches??[])if(!this.seenLaunches.has(event.id)){
      this.seenLaunches.add(event.id);this.launches.push(event);
    }
    while(this.seenLaunches.size>256)this.seenLaunches.delete(this.seenLaunches.values().next().value!);
    if(this.launches.length>48)throw new Error('Pending snapshot events exceeded budget');
    if(!ready||this.outstanding.length>=MAX_CHAOS_IN_FLIGHT){this.coalesced++;return null;}
    const launches=this.launches.slice(0,24);
    const sameLaunches=state.pressure?.launches.length===launches.length&&launches.every((event,i)=>event===state.pressure!.launches[i]);
    const delivered:ChaosState={...state,impacts:freshImpacts?state.impacts:this.impacts.slice(0,64),...(state.pressure?{pressure:sameLaunches?state.pressure:{...state.pressure,launches}}:{})};
    const frame=this.legacy ? (() => {
      const shared=freshImpacts&&(!state.pressure||sameLaunches)?legacyFrame:undefined;
      const seq=++this.legacySeq,payload=shared?.payload??serializeServerMessage({type:'chaos',state:delivered});
      return {payload,seq,bytes:shared?.bytes??wireBytes(payload),ack:{type:'chaosAck' as const,stream:this.encoder.stream,seq}};
    })() : this.encoder.encode(delivered,prepared);
    this.lastFrame=frame;
    this.impacts.splice(0,64);if(state.pressure)this.launches.splice(0,24);
    this.outstanding.push({seq:frame.seq,at:now});
    return frame.payload;
  }
  get inFlight():number{return this.outstanding.length;}
}
