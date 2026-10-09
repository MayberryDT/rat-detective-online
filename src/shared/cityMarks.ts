import type {Vec3Data} from './networkProtocol';
import type {PlayerData} from './networkProtocol';

/** Evidence the chaos leaves (Tyler, 8–9 October). Every mark is true: laid by the server from what really happened,
 * never invented. Marks belong to the round: a reset clears them all.
 *
 * - A chalk outline (`ChalkMark`) where a body came to rest, its fedora beside it. Laid when the body goes.
 * - Sewer muck (`MuckRun`): a rat climbing out of the sewer tracks a few olive prints onto the ground above.
 * - Hot wax (`WaxRun`): the carried case is red-hot; it drips sealing wax along the carrier's real path, glowing when
 *   fresh and cooling dark (the client shows the age), so a fresh drip says the carrier passed moments ago.
 * - Pigeons (`Flock`): the hot case spooks them. In the open the carrier flushes a flock now and then; it rises high
 *   over the roofs and circles, seen from across the city. Where the carrier was, never where it is. */
export const MARKS={
    chalk:24,
    muck:32,muckMs:30_000,muckReach:12,muckRun:6,muckStride:.62,muckGait:.15,
    wax:40,waxMs:25_000,waxStride:1.6,waxRun:8,waxRunMs:3_000,
    flocks:6,flockMs:9_000,flockEveryMs:[12_000,18_000] as readonly [number,number],flockSky:40,
} as const;

/** `p`: the floor under the body; `h`: the body's heading; `c`: its hat colour; `at`: when it was drawn. */
export interface ChalkMark {id:string;p:Vec3Data;h:number;c:number;at:number}
/** Prints laid as a rat left the sewer: `f` is x, y, z and heading per print, as `CasePrints.f`. */
export interface MuckRun {id:string;at:number;f:number[]}
/** Wax drips from the carried case: `f` is x, y, z and the drip's own time (ms after `at`) per drip; `c` the carrier. */
export interface WaxRun {id:string;at:number;c:string;f:number[]}
/** A flock flushed by the carrier at `p` (floor) at `at`; `c` the carrier. */
export interface Flock {id:string;p:Vec3Data;at:number;c:string}

const finite=(p:unknown):p is Vec3Data=>!!p&&typeof p==='object'&&[(p as Vec3Data).x,(p as Vec3Data).y,(p as Vec3Data).z].every(Number.isFinite);
const idOk=(id:unknown,ids:Set<string>)=>typeof id==='string'&&id.length>0&&id.length<=64&&!ids.has(id)&&(ids.add(id),true);
const ratId=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=64;
export function validChalk(value:unknown):value is ChalkMark[]{
    const ids=new Set<string>();
    return Array.isArray(value)&&value.length<=MARKS.chalk&&value.every(m=>m&&idOk(m.id,ids)&&finite(m.p)&&Number.isFinite(m.h)&&
        Number.isInteger(m.c)&&m.c>=0&&m.c<=0xffffff&&Number.isFinite(m.at));
}
export function validMuck(value:unknown):value is MuckRun[]{
    const ids=new Set<string>();
    return Array.isArray(value)&&value.length<=MARKS.muck&&value.every(r=>r&&idOk(r.id,ids)&&Number.isFinite(r.at)&&Array.isArray(r.f)&&
        r.f.length>=4&&r.f.length<=MARKS.muckRun*4&&r.f.length%4===0&&r.f.every((n:unknown)=>Number.isFinite(n)));
}
export function validWax(value:unknown):value is WaxRun[]{
    const ids=new Set<string>();
    return Array.isArray(value)&&value.length<=MARKS.wax&&value.every(r=>r&&idOk(r.id,ids)&&Number.isFinite(r.at)&&ratId(r.c)&&Array.isArray(r.f)&&
        r.f.length>=4&&r.f.length<=MARKS.waxRun*4&&r.f.length%4===0&&r.f.every((n:unknown)=>Number.isFinite(n)));
}
export function validFlocks(value:unknown):value is Flock[]{
    const ids=new Set<string>();
    return Array.isArray(value)&&value.length<=MARKS.flocks&&value.every(f=>f&&idOk(f.id,ids)&&finite(f.p)&&Number.isFinite(f.at)&&ratId(f.c));
}

/** Sight between two points (a clear line), and the floor under a point (undefined off the ground). */
export interface MarkWorld {
    sees(a:Vec3Data,b:Vec3Data):boolean;
    floor(p:Vec3Data):number|undefined;
    /** Ground for a print at `p` facing `heading` (BotNavigation.printGround). */
    printGround(p:Vec3Data,heading:number):number|undefined;
}
interface Trail {left:number;last:{x:number;z:number};f:number[];side:number;at:number}
interface Drips {carrier:string;last:{x:number;z:number};f:number[];at:number}

const r2=(n:number)=>Math.round(n*100)/100,r3=(n:number)=>Math.round(n*1000)/1000;

export class CityMarks {
    chalk:ChalkMark[]=[];
    muck:MuckRun[]=[];
    wax:WaxRun[]=[];
    flocks:Flock[]=[];
    private readonly trails=new Map<string,Trail>();
    /** Each rat's floor last step: true in the sewer. */
    private readonly below=new Map<string,boolean>();
    private drips?:Drips;
    private nextFlock=0;
    private next=1;
    constructor(private readonly world:MarkWorld,saved?:{chalk?:unknown;muck?:unknown;wax?:unknown;flocks?:unknown},private readonly random:()=>number=Math.random){
        if(validChalk(saved?.chalk))this.chalk=structuredClone(saved.chalk);
        if(validMuck(saved?.muck))this.muck=structuredClone(saved.muck);
        if(validWax(saved?.wax))this.wax=structuredClone(saved.wax);
        if(validFlocks(saved?.flocks))this.flocks=structuredClone(saved.flocks);
        for(const m of [...this.chalk,...this.muck,...this.wax,...this.flocks]){const n=parseInt(m.id.slice(1),36);if(Number.isFinite(n))this.next=Math.max(this.next,n+1);}
    }
    private id(kind:string):string{return kind+(this.next++).toString(36);}

    /** A body has gone: chalk where it lay (`p`, its middle), facing `h`. Nothing off the ground. */
    body(p:Vec3Data,h:number,hatColor:number,now:number):void {
        const y=this.world.floor(p);if(y===undefined)return;
        this.chalk.push({id:this.id('k'),p:{x:r2(p.x),y:r3(y+.014),z:r2(p.z)},h:r2(h),c:hatColor,at:Math.round(now)});
        if(this.chalk.length>MARKS.chalk)this.chalk.splice(0,this.chalk.length-MARKS.chalk);
    }
    /** One step while the round plays: muck out of the sewer, the carrier's wax and pigeons, old marks retired.
     * Returns a flock flushed this step, if any (the police scanner reports it). */
    step(players:Iterable<PlayerData>,carrier:PlayerData|undefined,now:number):Flock|undefined {
        const living:PlayerData[]=[];for(const p of players)if(p.hp>0)living.push(p);
        if(this.muck.length&&now-this.muck[0]!.at>=MARKS.muckMs)this.muck=this.muck.filter(r=>now-r.at<MARKS.muckMs);
        if(this.wax.length&&now-this.wax[0]!.at>=MARKS.waxMs)this.wax=this.wax.filter(r=>now-r.at<MARKS.waxMs);
        if(this.flocks.length&&now-this.flocks[0]!.at>=MARKS.flockMs)this.flocks=this.flocks.filter(f=>now-f.at<MARKS.flockMs);
        this.stepMuck(living,now);
        this.stepWax(carrier,now);
        return this.stepFlocks(carrier,now);
    }
    private stepMuck(living:readonly PlayerData[],now:number):void {
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
            const done=trail.left<=0||now-trail.at>6000||sewer;
            if(trail.f.length>=MARKS.muckRun*4||done){
                if(trail.f.length>=8){this.muck.push({id:this.id('m'),at:Math.round(now),f:trail.f});if(this.muck.length>MARKS.muck)this.muck.splice(0,this.muck.length-MARKS.muck);}
                trail.f=[];
            }
            if(done)this.trails.delete(rat.id);
        }
        for(const id of this.below.keys())if(!ids.has(id)){this.below.delete(id);this.trails.delete(id);}
    }
    /** A drip every `waxStride` of the carrier's travel on the ground, grouped into runs (one wire item each). */
    private stepWax(carrier:PlayerData|undefined,now:number):void {
        let drips=this.drips;
        if(drips&&(!carrier||drips.carrier!==carrier.id||drips.f.length>=MARKS.waxRun*4||now-drips.at>=MARKS.waxRunMs)){this.flushWax();drips=undefined;}
        if(!carrier)return;
        drips??=this.drips={carrier:carrier.id,last:{x:carrier.x,z:carrier.z},f:[],at:now};
        const d=Math.hypot(carrier.x-drips.last.x,carrier.z-drips.last.z);
        if(d<MARKS.waxStride)return;
        drips.last={x:carrier.x,z:carrier.z};
        if(d>6)return;// a launch or a teleport, not a walk
        // It hangs at the carrier's side: a drip lands a little off the line, never exactly on it.
        const p={x:carrier.x+(this.random()-.5)*.6,y:carrier.y+.5,z:carrier.z+(this.random()-.5)*.6};
        const y=this.world.floor(p);if(y===undefined||Math.abs(y-carrier.y)>1.2)return;
        drips.f.push(r2(p.x),r3(y+.01),r2(p.z),Math.round(now-drips.at));
    }
    private flushWax():void {
        const drips=this.drips;this.drips=undefined;
        if(!drips||drips.f.length<4)return;
        this.wax.push({id:this.id('w'),at:Math.round(drips.at),c:drips.carrier,f:drips.f});
        if(this.wax.length>MARKS.wax)this.wax.splice(0,this.wax.length-MARKS.wax);
    }
    /** Now and then, in the open (clear sky above), the carrier flushes a flock where it stands. */
    private stepFlocks(carrier:PlayerData|undefined,now:number):Flock|undefined {
        if(!carrier){this.nextFlock=0;return undefined;}
        const [low,high]=MARKS.flockEveryMs;
        if(!this.nextFlock){this.nextFlock=now+low*.5+this.random()*(high-low)*.5;return undefined;}
        if(now<this.nextFlock)return undefined;
        const p={x:carrier.x,y:carrier.y+1,z:carrier.z};
        if(carrier.y< -2||!this.world.sees(p,{x:p.x,y:p.y+MARKS.flockSky,z:p.z})){this.nextFlock=now+1500;return undefined;}
        this.nextFlock=now+low+this.random()*(high-low);
        const y=this.world.floor(p)??carrier.y;
        const flock={id:this.id('f'),p:{x:r2(carrier.x),y:r3(y),z:r2(carrier.z)},at:Math.round(now),c:carrier.id};
        this.flocks.push(flock);if(this.flocks.length>MARKS.flocks)this.flocks.splice(0,this.flocks.length-MARKS.flocks);
        return flock;
    }
    /** A new round: every mark goes. */
    clear():void {this.chalk=[];this.muck=[];this.wax=[];this.flocks=[];this.trails.clear();this.below.clear();this.drips=undefined;this.nextFlock=0;}
}
