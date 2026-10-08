import {BotNavigation} from './BotNavigation';
import type {BotWaypoint} from './BotLaunchRoutes';
import type {WorldSpec} from './worldSpec';
import type {PlayerData,Vec3Data} from './networkProtocol';
import {paperHash,windAt} from './paperWind';

/** `max` sheets published at once; `visible` the most a rat, human or bot, takes in at once; `range` how far it reads them. */
export const CLUES={max:128,visible:48,range:65} as const;
/** The document art a sheet can wear: `s` = family + 4·art + 16·shape (families: statement, form, receipt, photograph). */
export const PAPER_KINDS={families:4,arts:3,shapes:2} as const;
export const paperFamily=(s:number):number=>s&3;
export const paperArt=(s:number):number=>(s>>2)&3;
export const paperShape=(s:number):number=>(s>>4)&1;
/** One physical sheet. Everything here is fixed for the sheet's life: `id`, place `p`, birth `at` and look `s`.
 * `q`: a second resting spot a gust can carry it to and back (paperWind `looseLifts`); bots read `p`. */
export interface CaseClue {id:string;p:Vec3Data;at:number;s:number;q?:Vec3Data}
/** Paw prints (Tyler, 8 October: "sparse paw prints on the ground that go along with the papers", then "you put the paw
 * prints in the exact same spot as the papers"): a run of pairs across the gap from a paper group to the next, toes
 * pointing the way. `g`: the group's first sheet. `f`: x, y, z and heading
 * per print (atan2 of the toes' dx, dz, as a rat's look is measured), first nearest the papers, paws alternating from
 * the left. Fixed for its life; when the case has moved and the way from a group turns, the group gets a new run. */
export interface CasePrints {id:string;g:string;at:number;f:number[]}
/** Prints a run (at most); the stride within a pair, how far each paw falls to its side, pair to pair along the way,
 * how far short of the next group a run stops, and how far it reaches when the next group is not yet known. */
export const PRINTS={run:16,stride:.62,gait:.15,pairs:4.5,short:2.5,reach:24} as const;
export function validPrints(value:unknown):value is CasePrints[]{
    if(!Array.isArray(value)||value.length>CLUES.max)return false;
    const ids=new Set<string>();
    return value.every(r=>r&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=64&&!ids.has(r.id)&&(ids.add(r.id),true)&&
        typeof r.g==='string'&&r.g.length>0&&r.g.length<=64&&Number.isFinite(r.at)&&Array.isArray(r.f)&&r.f.length>=4&&r.f.length<=PRINTS.run*4&&
        r.f.length%4===0&&r.f.every((n:unknown)=>Number.isFinite(n)));
}
/** City-map facts: a starter spill at a fresh spawn, a rat's first route of a case placement, the trail cleared. */
export interface ClueEvent {what:'lead'|'route'|'clear';player?:string;p:Vec3Data;n?:number}
const finite=(p:unknown):p is Vec3Data=>!!p&&typeof p==='object'&&[(p as Vec3Data).x,(p as Vec3Data).y,(p as Vec3Data).z].every(Number.isFinite);
export function validClues(value:unknown):value is CaseClue[]{
    if(!Array.isArray(value)||value.length>CLUES.max)return false;
    const ids=new Set<string>();
    return value.every(c=>c&&typeof c.id==='string'&&c.id.length>0&&c.id.length<=64&&!ids.has(c.id)&&(ids.add(c.id),true)&&
        Number.isFinite(c.at)&&finite(c.p)&&Number.isInteger(c.s)&&c.s>=0&&c.s<64&&(c.q===undefined||finite(c.q)));
}
/** The sheets a rat can take in from `eye`: nearest first, within `range` (a flashlight's in a Blackout), only those
 * `canSee` admits, at most `visible`. */
export function visibleClues(clues:readonly CaseClue[],eye:Vec3Data,canSee:(p:Vec3Data)=>boolean,range:number=CLUES.range):CaseClue[]{
    const distance=(p:Vec3Data)=>Math.hypot(p.x-eye.x,p.y-eye.y,p.z-eye.z);
    const nearby=clues.filter(c=>distance(c.p)<=range).sort((a,b)=>distance(a.p)-distance(b.p));
    const visible:CaseClue[]=[];
    for(const c of nearby)if(canSee(c.p)){visible.push(c);if(visible.length===CLUES.visible)break;}
    return visible;
}

/** Route reading (P4 repair, 7 October): small groups where the way needs telling, not a stream of pages. */
const PLAN={
    /** A rat's route keeps its groups on the street this far ahead (route units)… */
    ahead:45,
    /** …and lets go of passed ones this far behind. */
    behind:16,
    /** The first group of a route, when no corner comes sooner. */
    first:[6,11],
    /** The longest stretch in sight without a group. */
    gap:[17,24],
    /** Groups closer than this along a route are one. */
    minGap:5,
    /** A wanted group this near an existing one on its floor, in sight of it, is that group: routes share. */
    merge:8,
    /** An unwanted group lies this long before it goes (a replan, a death or a respawn usually picks it up again). */
    graceMs:10000,
    /** After a restore, sheets wait this long for the new routes to claim them. */
    restoreMs:9000,
    /** A starter spill is let go once its rat is this far away (or dies). */
    leadLeave:22,
    /** Wait this long after a spawn for the rat's own facing to arrive. */
    facingMs:300,
    /** Sight rays per simulation step for reading routes into groups, and new groups per step. */
    rays:32,groups:3,
    /** Sight rays per step for placing groups (a support probe counts six): over it, the rest waits a step. */
    placeRays:300,
    /** A place whose spot is taken for now is tried again this much later. */
    retryMs:1000,
    /** Replan a route at most this often, once its rat strays this far from it or the case (carried: its carrier)
     * moves this far: routes that swing back and forth would lay papers and take them up again. */
    replanMs:2500,stray:12,moved:8,carriedMoved:14,
    /** Route search slices per step: a human's trail should be down before they have looked round. Extra slices stop
     * once this many walk-graph edges were probed this step. */
    humanSlices:4,sliceProbes:24,
    /** No two sheets closer than this: pages never overlap. */
    spacing:1.45,
    /** Sheets kept back for starter spills: a crowded city never leaves a fresh spawn without its lead. */
    leadReserve:16,
    /** Every route's last group is the one spill beside the case, shared from this far. */
    endMerge:10,
    /** A spot a sheet just blew away from stays bare this long: a new sheet landing there at once would read as a swap. */
    restMs:4000,
    /** Prints start this far past a group's farthest sheet along the way, keep this clear of any sheet's spot, of each
     * other and of another run's prints (two runs never tangle into one cluster), and turn to a new run only once the
     * case is this far from where they pointed and the way from the group has turned this much (radians). */
    printLead:.9,printClear:.75,printApart:.35,printRuns:1,printTurn:1.2,
    /** A starter's prints keep this far from where its rat stands. */
    printClearOf:1.8,
    /** A run lies at least this long before it may turn (a case thrown about would turn it back and forth). */
    printKeepMs:5000,
};
type AnchorKind='start'|'turn'|'level'|'launch'|'gap'|'end'|'lead';
/** `how`: how it was placed (diagnostics): `sheets` in sight of the previous group's sheets, `anchor` of its anchor,
 * `prints` of where the previous group's prints end, `own` only its own; `+n` slid n nodes. `prints`: its run of paw
 * prints; `toward`: where the trail led when they were laid; `printed`: its prints were tried. */
interface Group {id:number;kind:AnchorKind;anchor:Vec3Data;ids:string[];refs:Set<string>;idle?:number;how?:string;lead?:true;prints?:string;toward?:Vec3Data;printed?:true}
/** `step`, `bridge`, `tracks`: how far the search for a place to lay this group got (it resumes there on a later step, after
 * `prior`, the group it reads from, stays the same). */
interface Anchor {i:number;kind:AnchorKind;group?:number;retryAt?:number;step?:number;bridge?:number;tracks?:number;prior?:number}
interface Path {points:BotWaypoint[];dist:number[];target:Vec3Data;at:number;progress:number;anchors:Anchor[];scan:{a:number;j:number;last:number;gap:number;slope:boolean;slopeY:number;done:boolean};refs:Set<number>;carried:boolean}
interface Life {alive:boolean;since:number;pending:boolean;lead?:number;leadAt?:Vec3Data;announced:boolean}
type Clear=(a:Vec3Data,b:Vec3Data)=>boolean;
const distance=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const flat=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.z-b.z);
const isBot=(id:string)=>id.startsWith('rd-ai-');
const turnBetween=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const round3=(n:number)=>Math.round(n*1000)/1000;
const round2=(n:number)=>Math.round(n*100)/100;
/** Whether the ground at `p` is in sight of someone standing at `eye`: from a rat's own eyes (1.6, how bots see) and
 * from the shoulder camera's pivot (3.5, where a player's view never drops below). Awnings and arcades can block one
 * and not the other. `clear` lifts both ends by .8. */
const groundSeen=(clear:Clear,eye:Vec3Data,p:Vec3Data)=>clear({x:eye.x,y:eye.y+.8,z:eye.z},{x:p.x,y:p.y-.65,z:p.z})&&clear({x:eye.x,y:eye.y+2.7,z:eye.z},{x:p.x,y:p.y-.65,z:p.z});

/** Shared physical evidence toward the current case (Tyler, 7 October: an obvious lead at every spawn, papers that lead
 * to the case, no x-ray guidance; then: no blinking, fewer papers, varied, alive). Sheets belong to the city, not to a
 * rat: each keeps its id, place and look for life. A rat's route only says which groups must lie on the street; a group
 * nobody wants lingers briefly, then goes. Clearing (the case relocated, returning, reset) retires everything at once. */
export class CaseClues {
    items:CaseClue[]=[];
    prints:CasePrints[]=[];
    private readonly navigation?:BotNavigation;
    private groups=new Map<number,Group>();
    private paths=new Map<string,Path>();
    private lives=new Map<string,Life>();
    private events:ClueEvent[]=[];
    private pending?:{id:string;from:Vec3Data;target:Vec3Data;search:Generator<void,BotWaypoint[]>};
    private nextGroup=1;
    private nextSheet=1;
    private nextPrint=1;
    /** `prints` by 2-unit cell (`printNear`); undefined after a change. */
    private printCells?:Map<string,{x:number;y:number;z:number;run:CasePrints}[]>;
    /** Where the trail leads this step (the floor under the case or its carrier). */
    private aim?:Vec3Data;
    private restored:boolean;
    private resetLives=false;
    private rays=0;
    /** The last step's time: `clear()` is called without one. */
    private lastNow=0;
    /** Too full, or the spot was just vacated: try this place again on a later step. */
    private capped=false;
    /** A spot taken only for now (a sheet still lying there, or one just gone): worth trying again later. */
    private blocked=false;
    /** Sight rays spent laying groups this step: placement stops for the step past `PLAN.placeRays`. */
    private placeRays=0;
    /** The last placement stopped on that budget: its place is tried again next step. */
    private budgeted=false;
    /** Spots sheets just left. `cleared`: left in a clear, so they only keep new sheets off the very spot (a fresh
     * trail is not held back), where an ordinary retirement also holds back a whole group laid there. */
    private vacated:{p:Vec3Data;at:number;cleared?:true}[]=[];
    constructor(spec?:WorldSpec,saved?:CaseClue[],savedPrints?:CasePrints[]){
        if(spec)this.navigation=new BotNavigation(spec);
        this.restored=validClues(saved);
        if(this.restored){
            this.items=structuredClone(saved!);
            for(const c of this.items){const n=parseInt(c.id.slice(1),36);if(c.id[0]==='c'&&Number.isFinite(n))this.nextSheet=Math.max(this.nextSheet,n+1);}
            // Saved groups are not recorded: each saved run of prints keeps the sheet it leaves from as its group, then
            // sheets within a step of a group join it (or start their own), all waiting to be claimed.
            const claimed=new Set<string>();
            if(validPrints(savedPrints))for(const r of savedPrints){
                const c=this.items.find(c=>c.id===r.g);if(!c||claimed.has(c.id))continue;
                claimed.add(c.id);this.prints.push(structuredClone(r));this.printCells=undefined;
                const id=this.nextGroup++;this.groups.set(id,{id,kind:'gap',anchor:{...c.p},ids:[c.id],refs:new Set(),prints:r.id,printed:true});
                const n=parseInt(r.id.slice(1),36);if(r.id[0]==='p'&&Number.isFinite(n))this.nextPrint=Math.max(this.nextPrint,n+1);
            }
            for(const c of this.items){
                if(claimed.has(c.id))continue;
                const near=[...this.groups.values()].find(g=>Math.abs(g.anchor.y-c.p.y)<1.5&&flat(g.anchor,c.p)<3.5);
                if(near)near.ids.push(c.id);else{const id=this.nextGroup++;this.groups.set(id,{id,kind:'gap',anchor:{...c.p},ids:[c.id],refs:new Set()});}
            }
        }
    }
    /** Retire every sheet now. `reset`: a new round, so every living rat stands at a fresh spawn and gets a starter.
     * `at`: where the case was, for the fact. */
    clear(reset=false,at?:Vec3Data):void {
        if(this.items.length)this.events.push({what:'clear',p:{...(at??this.items[0]!.p)},n:this.items.length});
        for(const c of this.items)this.vacated.push({p:c.p,at:this.lastNow,cleared:true});
        this.items=[];this.prints=[];this.printCells=undefined;this.groups.clear();this.paths.clear();this.pending=undefined;
        for(const life of this.lives.values()){life.lead=undefined;life.leadAt=undefined;life.announced=false;}
        if(reset)this.resetLives=true;
    }
    /** One simulation step. `target`: the floor under the case (or its carrier); `carried` leaves the route's end bare. */
    guide(players:Iterable<PlayerData>,target:Vec3Data,now:number,clear?:Clear,carried=false):void {
        const nav=this.navigation;if(!nav)return;
        this.lastNow=now;this.placeRays=0;this.aim=target;
        const sight:Clear=clear??(()=>true);
        const all=[...players],living=all.filter(p=>p.hp>0).sort((a,b)=>Number(isBot(a.id))-Number(isBot(b.id)));
        this.rays=0;
        this.trackLives(all,living,now);
        // Restored sheets wait for the routes to claim them, then go like any other unwanted group.
        if(this.restored){for(const g of this.groups.values()){g.idle=now+PLAN.restoreMs-PLAN.graceMs;if(g.prints)g.toward={...target};}this.restored=false;}
        let made=0;
        for(const player of living){
            const life=this.lives.get(player.id)!;
            if(life.pending&&now-life.since>=PLAN.facingMs&&made<PLAN.groups){
                life.pending=false;made++;this.capped=false;this.blocked=false;
                const facing={x:2*(player.meshQx*player.meshQz+player.meshQw*player.meshQy),y:0,z:1-2*(player.meshQx*player.meshQx+player.meshQy*player.meshQy)};
                const points=nav.paperLead(player,facing,clear,3);
                if(points.length){
                    const group=this.groupAt(points[0]!,'lead',now,sight,{points,out:{x:facing.x,z:facing.z},count:2+paperHash(player.id,life.since)%2});
                    // Full, or its spot was just vacated: lay it on a later step, facing where the rat faces then.
                    if(group===undefined&&this.capped){life.pending=true;life.since=now+PLAN.retryMs-PLAN.facingMs;}
                    if(group!==undefined){
                        this.ref(group,'lead:'+player.id);life.lead=group;life.leadAt={...points[0]!};
                        this.events.push({what:'lead',player:player.id,p:{...points[0]!},n:this.groups.get(group)!.ids.length});
                    }
                }
            }
            if(life.lead!==undefined&&life.leadAt&&distance(player,life.leadAt)>PLAN.leadLeave){this.release(life.lead,'lead:'+player.id,now);life.lead=undefined;}
        }
        this.search(living,target,now,clear,carried);
        for(const player of living){
            const path=this.paths.get(player.id);if(!path?.points.length)continue;
            this.follow(path,player,now,sight,()=>made<PLAN.groups,()=>made++);
        }
        for(const g of [...this.groups.values()]){
            if(g.refs.size){g.idle=undefined;continue;}
            g.idle??=now;
            if(now-g.idle>=PLAN.graceMs)this.retire(g,now);
        }
        this.vacated=this.vacated.filter(v=>now-v.at<PLAN.restMs);
    }
    drain():ClueEvent[]{return this.events.splice(0);}
    /** Steps where no trail is laid (the case returning, the round closed, the case or its carrier high in the air) still
     * see deaths and respawns, so a rat respawned meanwhile gets its starter at the next step that lays papers. */
    track(players:Iterable<PlayerData>,now:number):void {const all=[...players];this.trackLives(all,all.filter(p=>p.hp>0),now);}

    /** Lives: a rat that comes alive (joins, respawns, a new round) gets one starter spill once its facing is known. */
    private trackLives(all:PlayerData[],living:PlayerData[],now:number):void {
        const present=new Set(all.map(p=>p.id));
        for(const [id,life] of this.lives)if(!present.has(id)){this.drop(id,life,now);this.lives.delete(id);}
        for(const p of all){
            const alive=p.hp>0;let life=this.lives.get(p.id);
            // Every rat first seen alive gets its starter, after a restore too: a wake from hibernation brings the human
            // whose join woke the room and fresh bots; a rat restored mid-life (an eviction) only gets one spill more.
            if(!life){this.lives.set(p.id,{alive,since:now,pending:alive,announced:false});continue;}
            if(alive&&!life.alive){life.alive=true;life.since=now;life.pending=true;life.announced=false;}
            else if(!alive&&life.alive){life.alive=false;life.pending=false;this.drop(p.id,life,now);}
        }
        if(this.resetLives){this.resetLives=false;for(const p of living){const life=this.lives.get(p.id)!;life.pending=true;life.since=now;}}
    }
    private drop(id:string,life:Life,now:number):void {
        if(life.lead!==undefined)this.release(life.lead,'lead:'+id,now);
        life.lead=undefined;life.leadAt=undefined;
        const path=this.paths.get(id);if(path){for(const g of path.refs)this.release(g,id,now);this.paths.delete(id);}
        if(this.pending?.id===id)this.pending=undefined;
    }

    /** One bounded slice of the shared walk graph per step; humans first. A failed search keeps a still-useful route. */
    private search(living:PlayerData[],target:Vec3Data,now:number,clear:Clear|undefined,carried:boolean):void {
        const nav=this.navigation!,ids=new Set(living.map(p=>p.id));
        if(this.pending&&(!ids.has(this.pending.id)||distance(living.find(p=>p.id===this.pending!.id)!,this.pending.from)>40))this.pending=undefined;
        if(this.pending&&isBot(this.pending.id)&&living.some(p=>!isBot(p.id)&&!this.paths.has(p.id)&&distance(p,target)>=6))this.pending=undefined;
        if(!this.pending)for(const player of living){
            const old=this.paths.get(player.id);
            if(distance(player,target)<6){if(old){for(const g of old.refs)this.release(g,player.id,now);this.paths.delete(player.id);}continue;}
            if(old&&now-old.at<(old.points.length?PLAN.replanMs:1000))continue;
            if(old&&old.carried===carried&&distance(old.target,target)<(carried?PLAN.carriedMoved:PLAN.moved)&&this.onRoute(old,player))continue;
            this.pending={id:player.id,from:{x:player.x,y:player.y,z:player.z},target:{...target},search:nav.paperRouteSteps(player,target,clear)};break;
        }
        if(!this.pending)return;
        // Extra slices for a human only while the walk graph is warm: a cold region costs edge probes, not expansions
        // (Workers' clocks freeze during CPU work, so the bound is work done, not time).
        const job=this.pending,probes=nav.work.edgeProbes;let result=job.search.next();
        for(let slice=1;slice<(isBot(job.id)?1:PLAN.humanSlices)&&!result.done&&nav.work.edgeProbes-probes<PLAN.sliceProbes;slice++)result=job.search.next();
        if(!result.done)return;
        this.pending=undefined;
        const old=this.paths.get(job.id),life=this.lives.get(job.id);
        if(!result.value.length){
            if(old&&old.points.length&&distance(old.target,job.target)<24){old.at=now;return;}
            if(old)for(const g of old.refs)this.release(g,job.id,now);
            this.paths.set(job.id,this.path([],job.target,now,carried));return;
        }
        if(old)for(const g of old.refs)this.release(g,job.id,now);
        this.paths.set(job.id,this.path(result.value,job.target,now,carried));
        if(life&&!life.announced){life.announced=true;this.events.push({what:'route',player:job.id,p:{...result.value[0]!},n:result.value.length});}
    }
    private path(points:BotWaypoint[],target:Vec3Data,now:number,carried:boolean):Path {
        const dist=[0];for(let i=1;i<points.length;i++)dist.push(dist[i-1]!+distance(points[i-1]!,points[i]!));
        return {points,dist,target:{...target},at:now,progress:0,anchors:[],scan:{a:0,j:1,last:-Infinity,gap:0,slope:false,slopeY:0,done:points.length<2},refs:new Set(),carried};
    }
    private onRoute(path:Path,player:Vec3Data):boolean {
        const from=Math.max(0,path.progress-4),to=Math.min(path.points.length,path.progress+16);
        for(let i=from;i<to;i++)if(distance(path.points[i]!,player)<PLAN.stray)return true;
        return false;
    }

    /** Advance a rat along its route (never backwards: jitter cannot toggle sheets), read more of the route into
     * anchors, and hold exactly the groups within its stretch of street. */
    private follow(path:Path,player:PlayerData,now:number,sight:Clear,canMake:()=>boolean,made:()=>void):void {
        const P=path.points;
        let best=path.progress,nearest=distance(P[best]!,player);
        for(let i=path.progress+1;i<Math.min(P.length,path.progress+13);i++){const d=distance(P[i]!,player);if(d<nearest-.01){nearest=d;best=i;}}
        path.progress=best;
        const here=path.dist[best]!;
        this.scan(path,here+PLAN.ahead+PLAN.gap[1],sight);
        // A starter's prints wait for its rat's route: from the spill across to the route's first group, never under the
        // rat (they would read as its own).
        const life=this.lives.get(player.id),lead=life?.lead!==undefined?this.groups.get(life.lead):undefined;
        if(lead&&P.length>1&&this.wantsPrints(lead)){
            let j=0;for(let k=1;k<Math.min(P.length,15);k++)if(Math.abs(P[k]!.y-lead.anchor.y)<1.5&&flat(P[k]!,lead.anchor)<flat(P[j]!,lead.anchor))j=k;
            const on=this.wayOn(path,j);
            this.printFor(lead,flat(P[j]!,lead.anchor)<1.5?on:[lead.anchor,...on],now,player);
        }
        const within=(anchor:Anchor)=>{const at=path.dist[anchor.i]!;return at>=here-PLAN.behind&&at<=here+PLAN.ahead;};
        for(const anchor of path.anchors)
            if(path.dist[anchor.i]!<here-PLAN.behind&&anchor.group&&path.refs.delete(anchor.group))this.release(anchor.group,player.id,now);
        // Groups for the stretch in order (a group can lay a bridge before itself), then hold every group in the stretch.
        for(const anchor of [...path.anchors]){
            if(path.dist[anchor.i]!>here+PLAN.ahead)break;
            if(!within(anchor)||anchor.group!==undefined||now<(anchor.retryAt??0))continue;
            if(!canMake())break;
            made();this.capped=false;this.blocked=false;this.budgeted=false;
            const group=this.anchorGroup(path,anchor,now,sight);
            // Out of this step's placement work: next step. Full, or the spot is taken for now: a little later. Nowhere
            // to lie at all: this place stays bare.
            if(group===undefined&&this.budgeted)break;
            if(group===undefined&&this.capped){anchor.retryAt=now+PLAN.retryMs;continue;}
            anchor.group=group??0;
        }
        for(const anchor of path.anchors){
            if(path.dist[anchor.i]!>here+PLAN.ahead)break;
            if(within(anchor)&&anchor.group&&!path.refs.has(anchor.group)&&this.groups.has(anchor.group)){path.refs.add(anchor.group);this.ref(anchor.group,player.id);}
        }
    }
    /** Read the route into the places that need telling: where sight breaks (the corner), a change of level (top and
     * bottom of a ramp or shaft), a launcher's pad and landing, a long stretch, and the case itself. */
    private scan(path:Path,until:number,sight:Clear):void {
        const P=path.points,s=path.scan,n=P.length;
        // Each stretch gets its own length from where it starts, so a replan reads the same street the same way.
        const stretch=(at:Vec3Data,first:boolean)=>{const [lo,hi]=first?PLAN.first:PLAN.gap;return lo+(paperHash(at.x+','+at.z,3)%1000)/1000*(hi-lo);};
        if(!s.gap)s.gap=stretch(P[0]!,true);
        const emit=(i:number,kind:AnchorKind,force=false)=>{
            if(!force&&path.dist[i]!-s.last<PLAN.minGap)return;
            if(path.anchors.length&&path.anchors[path.anchors.length-1]!.i===i)return;
            path.anchors.push({i,kind});s.last=path.dist[i]!;s.gap=stretch(P[i]!,false);
        };
        const since=(j:number)=>s.last===-Infinity?path.dist[j]!:path.dist[j]!-s.last;
        while(!s.done&&this.rays<PLAN.rays&&(s.last===-Infinity||s.last<until)){
            if(s.j>=n){if(!path.carried&&path.dist[n-1]!-s.last>PLAN.minGap)emit(n-1,'end',true);s.done=true;break;}
            const a=s.a,j=s.j,A=P[a]!,J=P[j]!,prev=P[j-1]!;
            if(prev.launch||prev.drop){emit(j-1,'launch',true);emit(j,'launch',true);s.a=j;s.j=j+1;s.slope=false;continue;}
            // A ramp, stairs or a shaft is one passage: papers at its top and its bottom, and along it if it is long.
            const slope=Math.abs(J.y-prev.y)>.05;
            if(!s.slope&&slope&&Math.abs(P[Math.min(n-1,j+3)]!.y-prev.y)>.6){emit(j-1,'level');s.slope=true;s.slopeY=prev.y;s.a=j-1;}
            else if(s.slope&&!slope&&Math.abs(P[Math.min(n-1,j+2)]!.y-prev.y)<.05){
                if(Math.abs(prev.y-s.slopeY)>.6)emit(j-1,'level',true);
                s.slope=false;s.a=j-1;
            }
            if(s.slope){if(since(j)>s.gap){emit(j,'gap',true);s.a=j;}s.j++;continue;}
            // Along the street: the next group lies where a player at the last one stops being able to see the way
            // (the corner), or at the end of a long stretch in plain sight. Sight is a player's: eye to the ground.
            this.rays+=2;
            if(!groundSeen(sight,A,J)){
                if(j-1>a){emit(j-1,'turn');s.a=j-1;s.j=j;}else{s.a=j;s.j=j+1;}
                continue;
            }
            if(since(j)>s.gap){emit(j,s.last===-Infinity?'start':'gap',true);s.a=j;}
            s.j++;
        }
    }
    private anchorGroup(path:Path,anchor:Anchor,now:number,sight:Clear):number|undefined {
        // The group a player reads before this one: the last earlier anchor that has sheets (a bare place is skipped).
        const P=path.points,i=anchor.i,A=P[i]!,earlier=path.anchors.slice(0,path.anchors.indexOf(anchor));
        const before=[...earlier].reverse().find(a=>a.group&&this.groups.has(a.group))??earlier[earlier.length-1];
        const back=P[Math.max(0,i-2)]!,ahead=P[Math.min(P.length-1,i+2)]!;
        const dir=(a:Vec3Data,b:Vec3Data)=>{const d=flat(a,b);return d>.01?{x:(b.x-a.x)/d,z:(b.z-a.z)/d}:undefined;};
        const out=dir(A,ahead)??dir(back,A)??{x:0,z:1},into=dir(back,A)??out;
        const h=paperHash(A.x+','+A.y+','+A.z,7);
        const count=anchor.kind==='end'?3:anchor.kind==='gap'||anchor.kind==='start'?1+Number(h%9>=5):2;
        // Where a player stands to look for this group: on the previous group's sheets (for a route's first group, its
        // rat's starter spill), else at the previous anchor.
        const lead=before?undefined:[...this.lives.entries()].find(([id])=>this.paths.get(id)===path)?.[1].lead;
        const prior=before?.group?this.groups.get(before.group):lead!==undefined?this.groups.get(lead):undefined;
        const from=prior?prior.ids.map(id=>this.items.find(c=>c.id===id)?.p).filter((p):p is Vec3Data=>!!p):before?[P[before.i]!]:[];
        // In sight of the previous group's sheets, sliding a few nodes along the route if the anchor itself has no such
        // spot; only failing that, anywhere in sight of the anchor. A trail must read from one group to the next.
        // In sight from one of the previous group's sheets (a player reads each), else from the previous anchor. A corner
        // group never slides back up the street it turns from: from there nobody sees round the corner.
        // Best: in sight from every one of them, wherever a player finishes reading the last group.
        const ladder:{sources:Vec3Data[];every:boolean;how:string}[]=[...(from.length>1?[{sources:from,every:true,how:'all-sheets'}]:[]),{sources:from,every:false,how:'sheets'}];
        if(before&&prior)ladder.push({sources:[P[before.i]!],every:false,how:'anchor'});
        const shifts=anchor.kind==='turn'?[0,1,2,3]:[0,-1,1,-2,2,-3];
        const counted:Clear=(a,b)=>{this.placeRays++;return sight(a,b);};
        // The search resumes where a busy step left it, unless the group it reads from has changed.
        if(anchor.prior!==prior?.id){anchor.prior=prior?.id;anchor.step=0;anchor.bridge=undefined;anchor.tracks=undefined;}
        const tries=ladder.flatMap(l=>shifts.map(shift=>({...l,shift})));
        for(let t=anchor.step??0;t<tries.length;t++){
            const {sources,every,shift,how}=tries[t]!,k=i+shift;if(k<1||k>=P.length)continue;
            if(this.placeRays>PLAN.placeRays){anchor.step=t;this.capped=this.budgeted=true;return undefined;}
            // Cheap first: if the route node itself is out of sight from there, so are the sheets around it.
            if(sources.length&&!(every?sources.every(f=>groundSeen(counted,f,P[k]!)):sources.some(f=>groundSeen(counted,f,P[k]!))))continue;
            // The way on (a few nodes past this place) must be in sight from the group's first sheet.
            const next=P[Math.min(P.length-1,k+3)]!;
            const group=this.groupAt(P[k]!,anchor.kind,now,sight,{out,into,count,from:sources,every,strict:true,next,way:this.wayOn(path,k),...(prior?{not:prior.id}:{})});
            if(group!==undefined){const g=this.groups.get(group);if(g&&!g.how)g.how=how+(shift?(shift>0?'+':'')+shift:'');return group;}
            if(this.capped){anchor.step=t;return undefined;}
        }
        anchor.step=tries.length;
        // Nothing near this place reads from the last group: a single sheet where the last group's view of the route
        // ends bridges the two (rare: a wall corner or a doorway between them), then this group reads from the bridge.
        if(prior&&before&&from.length)for(let m=anchor.bridge??i-1;m>before.i;m--){
            if(this.placeRays>PLAN.placeRays){anchor.bridge=m;this.capped=this.budgeted=true;return undefined;}
            if(!from.some(f=>groundSeen(counted,f,P[m]!)))continue;
            const bridge=this.groupAt(P[m]!,'turn',now,sight,{out:dir(P[m]!,A)??out,count:1,from,strict:true,next:A,way:this.wayOn(path,m),not:prior.id});
            if(bridge===undefined){if(this.capped){anchor.bridge=m;return undefined;}continue;}
            const b=this.groups.get(bridge)!;b.how??='bridge';
            path.anchors.splice(path.anchors.indexOf(anchor),0,{i:m,kind:'turn',group:bridge});
            const sheets=b.ids.map(id=>this.items.find(c=>c.id===id)?.p).filter((p):p is Vec3Data=>!!p);
            for(const shift of shifts){
                const k=i+shift;if(k<1||k>=P.length)continue;
                const group=this.groupAt(P[k]!,anchor.kind,now,sight,{out,into,count,from:sheets,strict:true,next:P[Math.min(P.length-1,k+3)]!,way:this.wayOn(path,k),not:bridge});
                if(group!==undefined){const g=this.groups.get(group);if(g&&!g.how)g.how='bridged';return group;}
                if(this.capped)return undefined;
            }
            break;
        }
        // No bridge either: in sight from where the previous group's prints end (a player follows them there and looks
        // again).
        const tracks=prior?.prints!==undefined?this.prints.find(r=>r.id===prior.prints)?.f:undefined;
        if(tracks){
            const end={x:tracks[tracks.length-4]!,y:tracks[tracks.length-3]!,z:tracks[tracks.length-2]!};
            for(let t=anchor.tracks??0;t<shifts.length;t++){
                if(this.placeRays>PLAN.placeRays){anchor.tracks=t;this.capped=this.budgeted=true;return undefined;}
                const k=i+shifts[t]!;if(k<1||k>=P.length||!groundSeen(counted,end,P[k]!))continue;
                const group=this.groupAt(P[k]!,anchor.kind,now,sight,{out,into,count,from:[end],strict:true,next:P[Math.min(P.length-1,k+3)]!,way:this.wayOn(path,k),...(prior?{not:prior.id}:{})});
                if(group!==undefined){const g=this.groups.get(group);if(g&&!g.how)g.how='prints'+(shifts[t]?(shifts[t]!>0?'+':'')+shifts[t]:'');return group;}
                if(this.capped){anchor.tracks=t;return undefined;}
            }
            anchor.tracks=shifts.length;
        }
        const group=this.groupAt(A,anchor.kind,now,sight,{out,into,count,way:this.wayOn(path,i),...(prior?{not:prior.id}:{})});
        const g=group!==undefined?this.groups.get(group):undefined;if(g&&!g.how)g.how='own';
        return group;
    }
    /** The group for an anchor: an existing one close by on the same floor and in sight, else a new spill of `count`
     * supported sheets around it. A turn puts its second sheet into the new street. */
    private groupAt(A:Vec3Data,kind:AnchorKind,now:number,sight:Clear,shape:{points?:Vec3Data[];out?:{x:number;z:number};into?:{x:number;z:number};from?:Vec3Data[];every?:boolean;strict?:boolean;not?:number;next?:Vec3Data;way?:readonly Vec3Data[];count:number}):number|undefined {
        // A player's eye (1.6) to a sheet on the ground (.15); the authority's `clear` lifts both ends by .8.
        // Starters are never held back by the step's placement work: a fresh spawn's lead comes first.
        if(kind!=='lead'&&this.placeRays>PLAN.placeRays){this.capped=this.budgeted=true;return undefined;}
        const counted:Clear=(a,b)=>{this.placeRays++;return sight(a,b);};
        const seen=(eye:Vec3Data,p:Vec3Data)=>flat(eye,p)<.5||groundSeen(counted,eye,p);
        // Routes share groups. A starter is always its own spill in its rat's view; a group never folds into the one it
      // must be read from.
        // A starter adopts a starter spill nobody holds any more that it would lie on (a rat respawning where another
        // just left): the papers stay instead of one spill blowing away in front of it as the next lands.
        if(kind==='lead'){
            const idle=[...this.groups.values()].find(g=>!g.refs.size&&g.lead&&Math.abs(g.anchor.y-A.y)<1.5&&flat(g.anchor,A)<2.5);
            if(idle)return idle.id;
        }
        // Every route ends at the same case: the nearest spill in sight of it serves them all.
        if(kind==='end'){
            let best:Group|undefined;
            for(const g of this.groups.values())
                if(g.id!==shape.not&&g.ids.length&&Math.abs(g.anchor.y-A.y)<1.5&&flat(g.anchor,A)<PLAN.endMerge&&(!best||flat(g.anchor,A)<flat(best.anchor,A))&&(flat(g.anchor,A)<.5||counted(g.anchor,A)))best=g;
            if(best)return best.id;
        }
        if(kind!=='lead'&&kind!=='end')for(const g of this.groups.values()){
            // A corner is shared only by a group at that corner: a step back up the street, nobody sees round it.
            const reach=kind==='turn'?2:PLAN.merge;
            if(g.id===shape.not||!g.ids.length||Math.abs(g.anchor.y-A.y)>=1.5||flat(g.anchor,A)>=reach||!(flat(g.anchor,A)<.5||counted(g.anchor,A)))continue;
            // Shared only if it still reads from where this route's player stands.
            const first=this.items.find(c=>c.id===g.ids[0]);
            if(shape.strict&&shape.from?.length&&first&&!shape.from.some(f=>seen(f,first.p)))continue;
            if(this.wantsPrints(g))this.printFor(g,shape.way,now);
            return g.id;
        }
        if(this.items.length+shape.count>CLUES.max-(kind==='lead'?0:PLAN.leadReserve)){this.capped=true;return undefined;}
        if(this.vacated.some(v=>!v.cleared&&now-v.at<PLAN.restMs&&Math.abs(v.p.y-A.y)<1.5&&flat(v.p,A)<4)){this.capped=true;return undefined;}
        const nav=this.navigation!,h=paperHash(A.x+','+A.y+','+A.z,kind.length);
        const out=shape.out??{x:0,z:1},side=(h&1)?1:-1,perp={x:-out.z*side,z:out.x*side};
        const bases:Vec3Data[]=shape.points?shape.points.map(p=>({...p})):[];
        for(let k=bases.length;k<shape.count;k++){
            const r=(paperHash(String(h),k)%1000)/1000,along=kind==='turn'&&k===1?2.2+r*.8:k===0?(r-.5)*.8:(k%2?1:-1)*(1.7+r*.7);
            const lateral=(k===0?.5+r*.8:(k%2?-1:1)*(.3+r*.9));
            bases.push({x:A.x+out.x*along+perp.x*lateral,y:A.y,z:A.z+out.z*along+perp.z*lateral});
        }
        const sheets:CaseClue[]=[],group:Group={id:this.nextGroup++,kind,anchor:{...A},ids:[],refs:new Set()};
        for(const [k,base] of bases.slice(0,shape.count).entries()){
            let placed:Vec3Data|undefined,crowded=false;
            // First choice: in sight from a sheet of the previous group, so the way reads from where a player stands.
            const from=shape.from??[];
            for(let attempt=0;attempt<12&&!placed&&(kind==='lead'||this.placeRays<=PLAN.placeRays);attempt++){
                const turn=attempt*1.3,r=(attempt%4)*.4,strict=from.length>0&&(attempt<8||!!shape.strict&&k===0);
                const c={x:base.x+Math.cos(turn+h)*r,y:base.y,z:base.z+Math.sin(turn+h)*r};
                this.placeRays+=6;
                const p=nav.paperPlacement(c,paperHash(String(h),k*31+attempt))??(attempt%4===0?nav.paperPlacement(c,0):undefined);
                // A group reads as one: every further sheet is in sight of its first.
                if(p&&!this.roomFor(p,sheets))crowded=true;
                if(p&&Math.abs(p.y-A.y)<.7&&this.roomFor(p,sheets)&&seen(A,p)&&(!strict||(shape.every?from.every(f=>seen(f,p)):from.some(f=>seen(f,p))))&&(!sheets[0]||seen(sheets[0].p,p))
                    &&(k>0||!strict||!shape.next||seen(p,shape.next)))placed=p;
            }
            // Out of this step's work before an answer: try again next step.
            if(!placed&&kind!=='lead'&&this.placeRays>PLAN.placeRays){this.capped=this.budgeted=true;return undefined;}
            // `strict`: the first sheet must be in sight from the previous group, or this place will not do.
            if(!placed&&k===0&&shape.strict)return undefined;
            if(!placed){if(crowded)this.blocked=true;continue;}
            const p={x:placed.x,y:Math.round((placed.y+.018)*1000)/1000,z:placed.z};
            const sheet:CaseClue={id:'c'+(this.nextSheet++).toString(36),p,at:Math.round(now),s:this.look(p,sheets,h+k)};
            if(kind!=='lead'&&shape.count>1&&k===shape.count-1){const q=this.looseSpot(p,sheets,h,sight);if(q)sheet.q=q;}
            sheets.push(sheet);
        }
        if(!sheets.length){if(this.blocked)this.capped=true;return undefined;}
        for(const s of sheets){group.ids.push(s.id);this.items.push(s);}
        if(kind==='lead')group.lead=true;
        this.groups.set(group.id,group);
        if(kind!=='lead')this.printFor(group,shape.way,now);
        return group.id;
    }
    /** Whether a group still needs its prints looked at: never tried, or the case has moved well away from where they
     * pointed (the trail's end has no prints: the case lies beside it). */
    private wantsPrints(g:Group):boolean {
        return g.kind!=='end'&&!!this.aim&&(!g.printed||!!g.prints&&!!g.toward&&flat(g.toward,this.aim)>PLAN.moved);
    }
    /** The route on from node `k` to the next group's place (the next anchor more than a few units on: a group slid a
     * node or two back from its own anchor must not stop there), or `PRINTS.reach` on when that stretch is not read yet:
     * the gap a group's prints cross. */
    private wayOn(path:Path,k:number):BotWaypoint[] {
        const from=path.dist[k]!,next=path.anchors.find(a=>path.dist[a.i]!>from+PLAN.minGap),limit=from+PRINTS.reach;
        let end=next?next.i:k;
        if(!next)while(end<path.points.length-1&&path.dist[end]!<limit)end++;
        return path.points.slice(k,end+1);
    }
    /** Lay a group's prints across the gap to the next group along `way`: from just past its farthest sheet, a pair of
     * paws every `PRINTS.pairs` units, stopping `PRINTS.short` before the way's end, each on supported ground clear of
     * every sheet and print (and of `clearOf`, a rat standing there). A pair that will not fit slides on a little. Two
     * prints at least, or none. */
    private printFor(g:Group,way:readonly Vec3Data[]|undefined,now:number,clearOf?:Vec3Data):void {
        if(!way||!this.wantsPrints(g))return;
        const line=this.printLine(g,way);
        // Laid already: turn to a new run only once it has lain a while and the way from here has turned. The old run
        // stays unless the new one can be laid.
        let old:CasePrints|undefined;
        if(g.printed){
            old=this.prints.find(r=>r.id===g.prints);
            if(old&&now-old.at<PLAN.printKeepMs)return;
            g.toward={...this.aim!};
            if(!old||!line||turnBetween(line.heading(line.start+1),old.f[3]!)<=PLAN.printTurn)return;
        }
        g.printed=true;g.toward={...this.aim!};
        if(!line)return;
        const f:number[]=[],end=Math.max(line.start+PRINTS.stride,line.total-PRINTS.short);
        for(let base=line.start;base+PRINTS.stride<=end+.01&&f.length<PRINTS.run*4;base+=PRINTS.pairs){
            let best:number[]=[];
            for(const nudge of [0,.6,1.2]){
                if(base+nudge+PRINTS.stride>end+.01)break;
                const pair=this.printPair(line,base+nudge,f,old,clearOf);
                if(pair.length>best.length)best=pair;
                if(best.length===8)break;
            }
            f.push(...best);
        }
        if(f.length<8)return;
        if(old)this.prints=this.prints.filter(r=>r!==old);
        const run:CasePrints={id:'p'+(this.nextPrint++).toString(36),g:g.ids[0]!,at:Math.round(now),f};this.prints.push(run);g.prints=run.id;this.printCells=undefined;
    }
    /** A left and a right paw at `s` along the line (those that fit), as x, y, z, heading each. */
    private printPair(line:{at:(s:number)=>Vec3Data;heading:(s:number)=>number},s0:number,fresh:readonly number[],old?:CasePrints,clearOf?:Vec3Data):number[] {
        const nav=this.navigation!,out:number[]=[];
        for(let k=0;k<2;k++){
            const s=s0+k*PRINTS.stride;
            // Smoothed over the walk graph's two-unit steps, so the prints follow the street round a corner.
            const a=line.at(s-.7),b=line.at(s),c=line.at(s+.7),h=line.heading(s),side=k?-1:1;
            // A rat facing h has its left at (cos h, −sin h).
            const p={x:(a.x+b.x+c.x)/3+Math.cos(h)*PRINTS.gait*side,y:b.y,z:(a.z+b.z+c.z)/3-Math.sin(h)*PRINTS.gait*side};
            this.placeRays+=2;
            const y=nav.printGround(p,h);if(y===undefined)continue;
            // Checked where it will lie (two decimals on the wire), so a print a unit from another stays a unit away.
            const q={x:round2(p.x),y:round3(y+.012),z:round2(p.z)};
            if(clearOf&&Math.abs(clearOf.y-y)<1.5&&flat(clearOf,q)<PLAN.printClearOf||!this.printRoom(q,[...fresh,...out],old))continue;
            out.push(q.x,q.y,q.z,round2(h));
        }
        return out;
    }
    /** The way on from a group as a line to lay prints along: stops at a launcher (the way flies from there). `start`:
     * just past the farthest of its sheets along the way. `heading(s)`: the line's direction around `s`. */
    private printLine(g:Group,way:readonly Vec3Data[]):{total:number;start:number;at:(s:number)=>Vec3Data;heading:(s:number)=>number}|undefined {
        const pts:Vec3Data[]=[];
        for(const p of way){pts.push(p);if((p as BotWaypoint).launch||(p as BotWaypoint).drop)break;}
        if(pts.length<2)return undefined;
        const arc=[0];for(let i=1;i<pts.length;i++)arc.push(arc[i-1]!+flat(pts[i-1]!,pts[i]!));
        const total=arc[arc.length-1]!;
        const at=(s:number):Vec3Data=>{
            s=Math.max(0,Math.min(total,s));let i=1;while(i<pts.length-1&&arc[i]!<s)i++;
            const a=pts[i-1]!,b=pts[i]!,len=arc[i]!-arc[i-1]!,u=len>1e-6?(s-arc[i-1]!)/len:0;
            return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u};
        };
        const heading=(s:number)=>{const a=at(s-1.2),b=at(s+2);return Math.atan2(b.x-a.x,b.z-a.z);};
        let start=0;
        for(const id of g.ids){
            const c=this.items.find(c=>c.id===id);if(!c)continue;
            let best=Infinity,along=0;
            for(let i=1;i<pts.length;i++){
                const a=pts[i-1]!,b=pts[i]!,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,u=l2>1e-9?Math.max(0,Math.min(1,((c.p.x-a.x)*dx+(c.p.z-a.z)*dz)/l2)):0;
                const d=Math.hypot(a.x+dx*u-c.p.x,a.z+dz*u-c.p.z);if(d<best){best=d;along=arc[i-1]!+u*(arc[i]!-arc[i-1]!);}
            }
            start=Math.max(start,along);
        }
        return start+PLAN.printLead+PRINTS.stride<total?{total,start:start+PLAN.printLead,at,heading}:undefined;
    }
    /** Whether a print (of a run other than `skip`) lies within `reach` (at most 2) of `p` on its floor, looking only in
     * the 2-unit cells around it: a city of runs is not scanned whole for each spot tried. Cells are rebuilt after
     * prints change. */
    private printNear(p:Vec3Data,reach:number,skip?:CasePrints):boolean {
        if(!this.printCells){
            this.printCells=new Map();
            for(const run of this.prints)for(let i=0;i+3<run.f.length;i+=4){
                const x=run.f[i]!,z=run.f[i+2]!,key=Math.floor(x/2)+','+Math.floor(z/2);
                let cell=this.printCells.get(key);if(!cell)this.printCells.set(key,cell=[]);
                cell.push({x,y:run.f[i+1]!,z,run});
            }
        }
        const cx=Math.floor(p.x/2),cz=Math.floor(p.z/2);
        for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
            const cell=this.printCells.get((cx+dx)+','+(cz+dz));if(!cell)continue;
            for(const q of cell)if(q.run!==skip&&Math.abs(q.y-p.y)<1&&Math.hypot(q.x-p.x,q.z-p.z)<reach)return true;
        }
        return false;
    }
    /** No print on or beside a sheet's spot (either of a loose sheet's), nor on another print (`replacing` aside). */
    private printRoom(p:Vec3Data,fresh:readonly number[],replacing?:CasePrints):boolean {
        for(const c of this.items)for(const q of [c.p,c.q])if(q&&Math.abs(q.y-p.y)<1&&flat(q,p)<PLAN.printClear)return false;
        const near=(f:readonly number[],apart:number)=>{for(let i=0;i+3<f.length;i+=4)if(Math.abs(f[i+1]!-p.y)<1&&Math.hypot(f[i]!-p.x,f[i+2]!-p.z)<apart)return true;return false;};
        if(near(fresh,PLAN.printApart))return false;
        if(this.printNear(p,PLAN.printRuns,replacing))return false;
        return true;
    }
    private roomFor(p:Vec3Data,fresh:readonly CaseClue[]):boolean {
        // A spot a sheet just blew away from counts as taken until it has rested (PLAN.restMs).
        for(const v of this.vacated)if(Math.abs(v.p.y-p.y)<1&&flat(v.p,p)<PLAN.spacing)return false;
        for(const c of [...this.items,...fresh]){
            if(Math.abs(c.p.y-p.y)<1&&flat(c.p,p)<PLAN.spacing)return false;
            if(c.q&&Math.abs(c.q.y-p.y)<1&&flat(c.q,p)<PLAN.spacing)return false;
        }
        // Nor on prints.
        if(this.printNear(p,PLAN.printClear))return false;
        return true;
    }
    /** A look unlike its neighbours: a family not yet in the group, the least-seen art nearby. */
    private look(p:Vec3Data,group:readonly CaseClue[],h:number):number {
        const near=this.items.filter(c=>flat(c.p,p)<14);
        const used=new Set(group.map(c=>paperFamily(c.s)));
        let family=0,best=Infinity;
        for(let k=0;k<PAPER_KINDS.families;k++){
            const f=(h+k)%PAPER_KINDS.families;if(used.has(f))continue;
            const score=near.filter(c=>paperFamily(c.s)===f).length;
            if(score<best){best=score;family=f;}
        }
        let art=0;best=Infinity;
        for(let k=0;k<PAPER_KINDS.arts;k++){
            const a=((h>>>3)+k)%PAPER_KINDS.arts,score=[...near,...group].filter(c=>paperFamily(c.s)===family&&paperArt(c.s)===a).length;
            if(score<best){best=score;art=a;}
        }
        return family+4*art+16*((h>>>7)%PAPER_KINDS.shapes);
    }
    /** Where a gust may carry this sheet: a supported spot a couple of units downwind on the same floor, in plain sight,
     * open to the sky (interiors and the sewers are calm). */
    private looseSpot(p:Vec3Data,fresh:readonly CaseClue[],h:number,sight:Clear):Vec3Data|undefined {
        const nav=this.navigation!,w=windAt(p.x,p.z);
        if(!sight(p,{x:p.x,y:p.y+6,z:p.z}))return undefined;
        for(const [turn,reach] of [[0,1.6+(h%100)/100*1.2],[.35,1.8],[-.35,1.8]] as const){
            const c=Math.cos(turn),s=Math.sin(turn),d={x:w.x*c-w.z*s,z:w.x*s+w.z*c};
            const q=nav.paperPlacement({x:p.x+d.x*reach,y:p.y,z:p.z+d.z*reach},h+11);
            if(q&&Math.abs(q.y-p.y)<.25&&this.roomFor(q,fresh)&&sight(p,q))return {x:q.x,y:Math.round((q.y+.018)*1000)/1000,z:q.z};
        }
        return undefined;
    }
    private ref(group:number,by:string):void {const g=this.groups.get(group);if(g){g.refs.add(by);g.idle=undefined;}}
    private release(group:number,by:string,now:number):void {
        const g=this.groups.get(group);if(!g)return;
        g.refs.delete(by);if(!g.refs.size)g.idle??=now;
    }
    private retire(g:Group,now:number):void {
        const gone=new Set(g.ids);
        for(const c of this.items)if(gone.has(c.id))this.vacated.push({p:c.p,at:now});
        this.items=this.items.filter(c=>!gone.has(c.id));this.groups.delete(g.id);
        if(g.prints){this.prints=this.prints.filter(r=>r.id!==g.prints);this.printCells=undefined;}
        for(const path of this.paths.values()){path.refs.delete(g.id);for(const a of path.anchors)if(a.group===g.id)a.group=undefined;}
    }
}
