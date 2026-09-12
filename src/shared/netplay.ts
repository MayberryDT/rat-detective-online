import type {Vec3Data} from './networkProtocol';

export const NETPLAY_HISTORY_MS=500;
export const NETPLAY_COMPENSATION_MS=250;
export const INTERACTION_SWEEP_MS=350;
export const INTERACTION_SWEEP_DISTANCE=6;

export interface MovementPoint {seq:number;at:number;p:Vec3Data}

export function closestPointOnSegment(from:Vec3Data,to:Vec3Data,point:Vec3Data):Vec3Data {
    const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
    const length=dx*dx+dy*dy+dz*dz;
    if(length<=1e-9)return{...to};
    const t=Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy+(point.z-from.z)*dz)/length));
    return{x:from.x+dx*t,y:from.y+dy*t,z:from.z+dz*t};
}

export function percentile(values:readonly number[],fraction:number):number {
    if(!values.length)return 0;
    const sorted=[...values].sort((a,b)=>a-b);
    return sorted[Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*fraction)))];
}

/** Bounded client-side interaction evidence. It never retains names, tokens,
 * socket frames or world snapshots and is exported only with normal diagnostics. */
export class NetplayAuditLog {
    private readonly pending=new Map<string,{kind:string;at:number}>();
    private readonly durations:Record<string,number[]>={};
    private readonly counts:Record<string,number>={};
    private readonly recent:Array<{at:number;kind:string;result:string;ms?:number;detail?:string}>=[];
    begin(id:string,kind:string,at=performance.now()):void {
        this.pending.set(id,{kind,at});
        if(this.pending.size>128)this.pending.delete(this.pending.keys().next().value!);
        this.counts[`${kind}:began`]=(this.counts[`${kind}:began`]??0)+1;
    }
    end(id:string,result:string,detail?:string,at=performance.now()):void {
        const pending=this.pending.get(id),kind=pending?.kind??'unknown',ms=pending?Math.max(0,at-pending.at):undefined;
        this.pending.delete(id);this.counts[`${kind}:${result}`]=(this.counts[`${kind}:${result}`]??0)+1;
        if(ms!==undefined)for(const key of [kind,`${kind}:${result}`]){const samples=this.durations[key]??=[];samples.push(ms);if(samples.length>256)samples.shift();}
        this.recent.push({at:Date.now(),kind,result,...(ms===undefined?{}:{ms:Math.round(ms*100)/100}),...(detail?{detail:detail.slice(0,80)}:{})});
        if(this.recent.length>64)this.recent.shift();
    }
    lap(id:string,result:string,detail?:string,at=performance.now()):void {
        const pending=this.pending.get(id);if(!pending)return;
        const ms=Math.max(0,at-pending.at),key=`${pending.kind}:${result}`,samples=this.durations[key]??=[];
        samples.push(ms);if(samples.length>256)samples.shift();this.counts[key]=(this.counts[key]??0)+1;
        this.recent.push({at:Date.now(),kind:pending.kind,result,ms:Math.round(ms*100)/100,...(detail?{detail:detail.slice(0,80)}:{})});
        if(this.recent.length>64)this.recent.shift();
    }
    count(kind:string,result:string,detail?:string):void {
        this.counts[`${kind}:${result}`]=(this.counts[`${kind}:${result}`]??0)+1;
        this.recent.push({at:Date.now(),kind,result,...(detail?{detail:detail.slice(0,80)}:{})});
        if(this.recent.length>64)this.recent.shift();
    }
    snapshot():unknown {
        const latency:Record<string,{samples:number;p50:number;p95:number;p99:number;max:number}>={};
        for(const [kind,values] of Object.entries(this.durations))latency[kind]={samples:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:Math.max(0,...values)};
        return{counts:{...this.counts},pending:this.pending.size,latency,recent:[...this.recent]};
    }
    clear():void {this.pending.clear();}
}
