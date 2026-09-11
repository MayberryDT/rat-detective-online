import type {Vec3Data} from './networkProtocol';

export const SHOT_END_REASONS=['contact','expired','capacity','split','reset'] as const;
export const SHOT_REJECT_REASONS=['dead','roundOver','implausible','duplicate','rateLimited'] as const;
export type ShotRejectReason=typeof SHOT_REJECT_REASONS[number];
export interface ShotOutcome {
    /** Unique within a simulation epoch; independent of client supplied shot IDs. */
    id:string; shotId:string; at:number; reason:typeof SHOT_END_REASONS[number];
    p:Vec3Data; victimId?:string; part?:'head'|'body';
}
export const SHOT_OUTCOME_BATCH=32;

/** A bounded receipt journal. Reset at connection/round boundaries. */
export class ActionJournal {
    private entries:Array<{type:string;receivedAt:number;detail:Record<string,unknown>}>=[];
    private seen=new Set<string>();
    record(type:string,receivedAt:number,detail:Record<string,unknown>,id?:string):boolean {
        if(id&&this.seen.has(id))return false;
        if(id){this.seen.add(id);if(this.seen.size>1024)this.seen.delete(this.seen.values().next().value!);}
        this.entries.push({type,receivedAt,detail});if(this.entries.length>256)this.entries.shift();return true;
    }
    snapshot(){return this.entries.map(entry=>({...entry,detail:{...entry.detail}}));}
    /** Bounded projection for the periodic diagnostics report: a total plus the
     * newest few entries. The full journal is retained locally for the F8
     * export but is never serialized onto the wire. */
    summary(recent=8){
        const size=Math.max(0,Math.min(32,Math.floor(recent)||0));
        const tail=size?this.entries.slice(-size):[];
        return {total:this.entries.length,recent:tail.map(entry=>({...entry,detail:{...entry.detail}}))};
    }
    clear(){this.entries.length=0;this.seen.clear();}
}
