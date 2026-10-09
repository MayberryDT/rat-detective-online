import type {Vec3Data} from './networkProtocol';
import type {PlayerData} from './networkProtocol';

/** Evidence the chaos leaves (Tyler, 8 October: chalk outlines, dead rats talk, sewer muck). Every mark is true: laid by
 * the server from what really happened, never invented. Marks belong to the round: a reset clears them all.
 *
 * - A chalk outline (`ChalkMark`) where a body came to rest, its fedora beside it. Laid when the body goes.
 * - A tip (`CaseTip`): a rat that saw the carrier within `MARKS.witnessMs` of dying leaves a note where it fell, with a
 *   chalk arrow to where it saw them. Gone once that rat no longer carries the case, or after `tipMs`.
 * - Sewer muck (`MuckRun`): a rat climbing out of the sewer tracks a few dark prints onto the ground above. */
export const MARKS={
    chalk:24,
    tips:8,tipMs:45_000,witnessMs:6_000,witnessEveryMs:250,witnessRange:80,
    muck:32,muckMs:30_000,muckReach:12,muckRun:6,muckStride:.62,muckGait:.15,
} as const;

/** `p`: the floor under the body; `h`: the body's heading; `c`: its hat colour; `at`: when it was drawn. */
export interface ChalkMark {id:string;p:Vec3Data;h:number;c:number;at:number}
/** `p`: where the witness fell (floor); `to`: where it last saw `carrier` (floor), at `seen`; `at`: when it fell. */
export interface CaseTip {id:string;p:Vec3Data;to:Vec3Data;carrier:string;seen:number;at:number}
/** Prints laid as a rat left the sewer: `f` is x, y, z and heading per print, as `CasePrints.f`. */
export interface MuckRun {id:string;at:number;f:number[]}

const finite=(p:unknown):p is Vec3Data=>!!p&&typeof p==='object'&&[(p as Vec3Data).x,(p as Vec3Data).y,(p as Vec3Data).z].every(Number.isFinite);
const idOk=(id:unknown,ids:Set<string>)=>typeof id==='string'&&id.length>0&&id.length<=64&&!ids.has(id)&&(ids.add(id),true);
export function validChalk(value:unknown):value is ChalkMark[]{
    const ids=new Set<string>();
    return Array.isArray(value)&&value.length<=MARKS.chalk&&value.every(m=>m&&idOk(m.id,ids)&&finite(m.p)&&Number.isFinite(m.h)&&
        Number.isInteger(m.c)&&m.c>=0&&m.c<=0xffffff&&Number.isFinite(m.at));
}
export function validTips(value:unknown):value is CaseTip[]{
    const ids=new Set<string>();
    return Array.isArray(value)&&value.length<=MARKS.tips&&value.every(t=>t&&idOk(t.id,ids)&&finite(t.p)&&finite(t.to)&&
        typeof t.carrier==='string'&&t.carrier.length>0&&t.carrier.length<=64&&Number.isFinite(t.seen)&&Number.isFinite(t.at));
}
export function validMuck(value:unknown):value is MuckRun[]{
    const ids=new Set<string>();
    return Array.isArray(value)&&value.length<=MARKS.muck&&value.every(r=>r&&idOk(r.id,ids)&&Number.isFinite(r.at)&&Array.isArray(r.f)&&
        r.f.length>=4&&r.f.length<=MARKS.muckRun*4&&r.f.length%4===0&&r.f.every((n:unknown)=>Number.isFinite(n)));
}

/** Sight between two rats' eyes (a clear line), and the floor under a point (undefined off the ground). */
export interface MarkWorld {
    sees(a:Vec3Data,b:Vec3Data):boolean;
    floor(p:Vec3Data):number|undefined;
    /** Ground for a print at `p` facing `heading` (BotNavigation.printGround). */
    printGround(p:Vec3Data,heading:number):number|undefined;
}
interface Sighting {at:number;p:Vec3Data;carrier:string}
interface Trail {left:number;last:{x:number;z:number};f:number[];side:number;at:number}

const r2=(n:number)=>Math.round(n*100)/100,r3=(n:number)=>Math.round(n*1000)/1000;

export class CityMarks {
    chalk:ChalkMark[]=[];
    tips:CaseTip[]=[];
    muck:MuckRun[]=[];
    private readonly sightings=new Map<string,Sighting>();
    private readonly trails=new Map<string,Trail>();
    /** Each rat's floor last step: true in the sewer. */
    private readonly below=new Map<string,boolean>();
    private witnessAt=-Infinity;
    private next=1;
    constructor(private readonly world:MarkWorld,saved?:{chalk?:unknown;tips?:unknown;muck?:unknown}){
        if(validChalk(saved?.chalk))this.chalk=structuredClone(saved.chalk);
        if(validTips(saved?.tips))this.tips=structuredClone(saved.tips);
        if(validMuck(saved?.muck))this.muck=structuredClone(saved.muck);
        for(const m of [...this.chalk,...this.tips,...this.muck]){const n=parseInt(m.id.slice(1),36);if(Number.isFinite(n))this.next=Math.max(this.next,n+1);}
    }
    private id(kind:string):string{return kind+(this.next++).toString(36);}

    /** A body has gone: chalk where it lay (`p`, its middle), facing `h`. Nothing off the ground. */
    body(p:Vec3Data,h:number,hatColor:number,now:number):void {
        const y=this.world.floor(p);if(y===undefined)return;
        this.chalk.push({id:this.id('k'),p:{x:r2(p.x),y:r3(y+.014),z:r2(p.z)},h:r2(h),c:hatColor,at:Math.round(now)});
        if(this.chalk.length>MARKS.chalk)this.chalk.splice(0,this.chalk.length-MARKS.chalk);
    }
    /** A rat died at `p` (its feet): if it saw the carrier lately, it leaves a tip. */
    death(id:string,p:Vec3Data,carrier:string|null,now:number):void {
        const seen=this.sightings.get(id);this.sightings.delete(id);this.trails.delete(id);
        if(!seen||!carrier||seen.carrier!==carrier||carrier===id||now-seen.at>MARKS.witnessMs)return;
        const y=this.world.floor({x:p.x,y:p.y+.5,z:p.z});if(y===undefined)return;
        this.tips.push({id:this.id('t'),p:{x:r2(p.x),y:r3(y+.016),z:r2(p.z)},to:{x:r2(seen.p.x),y:r3(seen.p.y),z:r2(seen.p.z)},carrier,seen:Math.round(seen.at),at:Math.round(now)});
        if(this.tips.length>MARKS.tips)this.tips.splice(0,this.tips.length-MARKS.tips);
    }
    /** One step while the round plays: who sees the carrier, tips going stale, prints out of the sewer. */
    step(players:Iterable<PlayerData>,carrier:PlayerData|undefined,now:number):void {
        const living:PlayerData[]=[];for(const p of players)if(p.hp>0)living.push(p);
        if(this.tips.length)this.tips=this.tips.filter(t=>t.carrier===carrier?.id&&now-t.at<MARKS.tipMs);
        if(this.muck.length&&now-this.muck[0]!.at>=MARKS.muckMs)this.muck=this.muck.filter(r=>now-r.at<MARKS.muckMs);
        if(!carrier)this.sightings.clear();
        else if(now-this.witnessAt>=MARKS.witnessEveryMs){
            this.witnessAt=now;
            let floor:number|undefined;
            for(const rat of living){
                if(rat.id===carrier.id)continue;
                if(Math.hypot(rat.x-carrier.x,rat.y-carrier.y,rat.z-carrier.z)>MARKS.witnessRange)continue;
                if(!this.world.sees({x:rat.x,y:rat.y+1.5,z:rat.z},{x:carrier.x,y:carrier.y+1,z:carrier.z}))continue;
                floor??=this.world.floor({x:carrier.x,y:carrier.y+.5,z:carrier.z})??carrier.y;
                this.sightings.set(rat.id,{at:now,p:{x:carrier.x,y:floor,z:carrier.z},carrier:carrier.id});
            }
        }
        const ids=new Set<string>();
        for(const rat of living){
            ids.add(rat.id);
            const sewer=rat.y< -2,was=this.below.get(rat.id);this.below.set(rat.id,sewer);
            if(was&&!sewer)this.trails.set(rat.id,{left:MARKS.muckReach,last:{x:rat.x,z:rat.z},f:[],side:1,at:now});
            const trail=this.trails.get(rat.id);if(!trail)continue;
            const dx=rat.x-trail.last.x,dz=rat.z-trail.last.z,d=Math.hypot(dx,dz);
            if(d>=MARKS.muckStride){
                trail.left-=d;trail.last={x:rat.x,z:rat.z};
                const h=Math.atan2(dx,dz),side=trail.side;trail.side=-side;
                // A rat facing h has its left at (cos h, −sin h).
                const p={x:rat.x+Math.cos(h)*MARKS.muckGait*side,y:rat.y,z:rat.z-Math.sin(h)*MARKS.muckGait*side};
                const y=d<3?this.world.printGround(p,h):undefined;
                if(y!==undefined)trail.f.push(r2(p.x),r3(y+.012),r2(p.z),r2(h));
            }
            if(trail.f.length>=MARKS.muckRun*4||trail.left<=0||now-trail.at>6000||sewer){this.flush(trail,now);if(trail.left<=0||now-trail.at>6000||sewer)this.trails.delete(rat.id);}
        }
        for(const id of this.below.keys())if(!ids.has(id)){this.below.delete(id);this.trails.delete(id);}
    }
    private flush(trail:Trail,now:number):void {
        if(trail.f.length>=8){
            this.muck.push({id:this.id('m'),at:Math.round(now),f:trail.f});
            if(this.muck.length>MARKS.muck)this.muck.splice(0,this.muck.length-MARKS.muck);
        }
        trail.f=[];
    }
    /** A new round: every mark goes. */
    clear():void {this.chalk=[];this.tips=[];this.muck=[];this.sightings.clear();this.trails.clear();this.below.clear();}
}
