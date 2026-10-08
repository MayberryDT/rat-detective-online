import {DISPATCH_STATIONS,LAUNCH_MACHINES} from './chaosState';
import { CITY_BOUNDS, GRAYBOX_SPAWNS, grayboxBoxes, type GrayboxBox } from './grayboxLayout';
import { LANDMARK_INTERIORS, landmarkExitPoint } from './landmarkLayout';
import { pier9ExitPoint } from './city/kit/parts/docksWarehouse';
import { SEWER_LIGHTS,SEWER_PIPE_ENTRANCES,sewerPipePoint,sewerRampTravelPoint } from './sewerLayout';
import type { Vec3Data } from './networkProtocol';
import type { WorldSpec } from './worldSpec';
import { boxBasis, boxHalfExtents, type Basis } from './boxFrame';
import {BOT_LAUNCH_LINKS,type BotLaunchLink,type BotWaypoint} from './BotLaunchRoutes';

// Share ONE navigator across the bots. route() queues/caches a route; call update()
// once per frame to give all pending searches a shared, bounded CPU budget.
// Positions are rat feet. An empty route means pending or unreachable, never a
// permission to walk directly through an obstruction.
const GRID = 2;
const BUCKET = 8;
/** Numeric bucket key; the city spans far fewer than 1024 buckets per axis. */
const bucketKey=(x:number,z:number)=>(x+1024)*2048+(z+1024);
/** The player body's three spheres: foot offset and radius. */
const BODY_OFFSETS=[.6,1.3,1.9],BODY_RADII=[.58,.43,.26];
/** `m` is the box's row-major basis (boxFrame); `n` its top normal (the basis' second column). */
interface Solid { box: GrayboxBox; m:Basis; nx:number; ny:number; nz:number; minX:number; maxX:number; minZ:number; maxZ:number }
interface Node extends Vec3Data { id:string; gx:number; gz:number }
/** A reverse breadth-first flow field visits each cell once. Grid edges differ
 * by at most sqrt(2), so routes favor few clear steps without an expensive
 * independent priority-queue search for every rat chasing the same objective. */
interface FlowField {
    goal:Node;
    frontier:Node[];
    head:number;
    next:Map<string,Node>;
    requestedAt:number;
}
const MAX_FIELDS=6;
const ACTIVE_TICKS=120;
/** Static walk graph: a pure function of the world spec, filled lazily as fields
 * explore. Round-replacement controllers reuse it instead of re-probing the city. */
interface WalkGraph {
    buckets:Map<number,Solid[]>;
    columns:Map<string,Node[]>;
    edges:Map<string,Node[]>;
    targets:Vec3Data[];
    launchEdges:Map<string,{from:Node;to:Node;link:BotLaunchLink}>;
}
const graphs=new WeakMap<WorldSpec,WalkGraph>();

export class BotNavigation {
    private readonly buckets:Map<number,Solid[]>;
    private readonly columns:Map<string,Node[]>;
    private readonly edges:Map<string,Node[]>;
    private fields=new Map<string,FlowField>();
    private tick=0;
    private cursor=0;
    private readonly targets:Vec3Data[];
    private readonly launchEdges:Map<string,{from:Node;to:Node;link:BotLaunchLink}>;
    /** Deterministic work counts for diagnostics; Workers clocks freeze during CPU work. */
    readonly work={expansions:0,edgeProbes:0};

    constructor(spec:WorldSpec) {
        const shared=graphs.get(spec);
        this.buckets=shared?.buckets??new Map();this.columns=shared?.columns??new Map();this.edges=shared?.edges??new Map();
        this.targets=shared?.targets??[];this.launchEdges=shared?.launchEdges??new Map();
        if(shared)return;
        // These controls are physical obstacles in both human and server bot worlds.
        // Omitting them from navigation sends routes through machines near objectives.
        const controls=[...DISPATCH_STATIONS,...LAUNCH_MACHINES].flatMap(c=>[c.box,c.target])
            .map(box=>({...box,rx:0,ry:0,rz:0,color:0}));
        for(const box of [...grayboxBoxes(spec),...controls]) {
            const m=boxBasis(box),{hx:dx,hz:dz}=boxHalfExtents(box);
            const solid:Solid={box,m,nx:m[1],ny:m[4],nz:m[7],minX:box.x-dx,maxX:box.x+dx,minZ:box.z-dz,maxZ:box.z+dz};
            for(let x=Math.floor((solid.minX-1)/BUCKET);x<=Math.floor((solid.maxX+1)/BUCKET);x++)for(let z=Math.floor((solid.minZ-1)/BUCKET);z<=Math.floor((solid.maxZ+1)/BUCKET);z++) {
                const key=bucketKey(x,z),bucket=this.buckets.get(key);if(bucket)bucket.push(solid);else this.buckets.set(key,[solid]);
            }
        }
        this.targets.push(...GRAYBOX_SPAWNS.map(p=>({...p,y:0})),...SEWER_LIGHTS.map(p=>({...p,y:-7})),
            ...LANDMARK_INTERIORS.flatMap(h=>h.levels.flatMap(y=>[
                {x:h.cx-h.w/2+4,y,z:h.cz+h.d/2-4},
                {x:h.cx+h.w/2-4,y,z:h.cz-h.d/2+5},
            ])));
        for(const link of BOT_LAUNCH_LINKS){
            const from=this.nearest(link.machine.pad),to=this.nearest(link.landing);
            if(from&&to&&Math.abs(from.y-link.machine.pad.y)<1&&Math.abs(to.y-link.landing.y)<1)
                this.launchEdges.set(`${from.id}>${to.id}`,{from,to,link});
        }
        graphs.set(spec,{buckets:this.buckets,columns:this.columns,edges:this.edges,targets:this.targets,launchEdges:this.launchEdges});
    }
    travelPoint(from:Vec3Data,to:Vec3Data):Vec3Data {return sewerRampTravelPoint(from,to)??pier9ExitPoint(from,to)??landmarkExitPoint(from,to);}
    /** Spawn/landing feet can have support before Cannon publishes its next contact. */
    supported(from:Vec3Data):boolean {return this.surfaces(from.x,from.z).some(y=>Math.abs(y-from.y)<.65);}
    explorationTargets():Vec3Data[] {return this.targets.map(p=>({...p}));}
    private nearby(x:number,z:number):Solid[] {return this.buckets.get(bucketKey(Math.floor(x/BUCKET),Math.floor(z/BUCKET)))??[];}
    /** Same three-sphere silhouette as the normal player body, with a small floor tolerance.
     * Probed thousands of times while fields explore: scalar math, no allocation. */
    private clear(x:number,y:number,z:number):boolean {
        for(const s of this.nearby(x,z)) {
            if(x<s.minX-.65||x>s.maxX+.65||z<s.minZ-.65||z>s.maxZ+.65)continue;
            const b=s.box,m=s.m,dx=x-b.x,dz=z-b.z;
            for(let k=0;k<3;k++) {
                // The solid's local frame (the transposed basis), as in surfaces().
                const dy=y+BODY_OFFSETS[k]+.035-b.y;
                const ox=Math.max(0,Math.abs(m[0]*dx+m[3]*dy+m[6]*dz)-b.w/2),oy=Math.max(0,Math.abs(m[1]*dx+m[4]*dy+m[7]*dz)-b.h/2),oz=Math.max(0,Math.abs(m[2]*dx+m[5]*dy+m[8]*dz)-b.d/2);
                if(ox*ox+oy*oy+oz*oz<BODY_RADII[k]*BODY_RADII[k])return false;
            }
        }return true;
    }
    private surfaces(x:number,z:number):number[] {
        if(x<CITY_BOUNDS.min+1||x>CITY_BOUNDS.max-1||z<CITY_BOUNDS.min+1||z>CITY_BOUNDS.max-1)return [];
        const heights:number[]=[];
        for(const s of this.nearby(x,z)) {
            const b=s.box;if(s.ny<.85||x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
            const y=b.y+(b.h/2-s.nx*(x-b.x)-s.nz*(z-b.z))/s.ny;
            // Solid upper masses have walkable roofs even though they are not thin floor slabs.
            if(b.h>1.1&&y<24)continue;
            if(y < -7.2||y>36.3)continue;
            let duplicate=false;for(const h of heights)if(Math.abs(h-y)<.08){duplicate=true;break;}
            if(duplicate)continue;
            const dx=x-b.x,dy=y-b.y,dz=z-b.z,m=s.m;
            if(Math.abs(m[0]*dx+m[3]*dy+m[6]*dz)>b.w/2+.001||Math.abs(m[2]*dx+m[5]*dy+m[8]*dz)>b.d/2+.001)continue;
            if(this.clear(x,y,z))heights.push(y);
        }
        return heights;
    }
    private column(gx:number,gz:number):Node[] {
        const key=`${gx},${gz}`;let nodes=this.columns.get(key);if(nodes)return nodes;
        nodes=this.surfaces(gx*GRID,gz*GRID).map(y=>({id:`${key},${Math.round(y*100)}`,gx,gz,x:gx*GRID,y,z:gz*GRID}));
        this.columns.set(key,nodes);return nodes;
    }
    private nearest(p:Vec3Data,accept?:(n:Vec3Data)=>boolean):Node|undefined {
        let best:Node|undefined,score=Infinity;
        const gx=Math.round(p.x/GRID),gz=Math.round(p.z/GRID);
        for(let radius=0;radius<=3;radius++) {
            for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++) {
                if(radius&&Math.abs(dx)!==radius&&Math.abs(dz)!==radius)continue;
                for(const n of this.column(gx+dx,gz+dz)) {
                    if(Math.abs(p.y-n.y)>4||accept&&!accept(n))continue;
                    const d=Math.hypot(n.x-p.x,n.z-p.z)+Math.abs(n.y-p.y)*2;
                    if(d<score){score=d;best=n;}
                }
            }if(best&&score<radius*GRID)break;
        }return best;
    }
    /** Probe the whole rat and its support between graph nodes, not merely their endpoints. */
    private connected(a:Vec3Data,b:Vec3Data):boolean {
        if(Math.abs(a.y-b.y)>1.2)return false;
        const steps=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.5);
        for(let i=1;i<steps;i++) {
            const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
            if(!this.surfaces(x,z).some(h=>Math.abs(h-y)<.32)){
                // Stair cutouts extend a quarter unit past the ramp. The rat's
                // feet bridge that seam physically; a center-only support test
                // incorrectly disconnects the entire upper floor. Probe only
                // within the foot radius, retaining body and height clearance.
                const length=Math.hypot(b.x-a.x,b.z-a.z)||1,dx=(b.x-a.x)/length*.3,dz=(b.z-a.z)/length*.3;
                if(!this.clear(x,y+.32,z)||![...this.surfaces(x+dx,z+dz),...this.surfaces(x-dx,z-dz)].some(h=>Math.abs(h-y)<.32))return false;
            }
        }return true;
    }
    private neighbors(node:Node):Node[] {
        let out=this.edges.get(node.id);if(out)return out;
        out=[];this.work.edgeProbes++;
        for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(dx||dz) {
            for(const other of this.column(node.gx+dx,node.gz+dz)) {
                // Walking clearance is symmetric. Reuse the reverse edge's
                // completed result instead of sweeping the same segment twice.
                const reverse=this.edges.get(other.id);
                if(reverse?reverse.some(n=>n.id===node.id):this.connected(node,other))out.push(other);
            }
        }
        this.edges.set(node.id,out);return out;
    }
    /** Whether the whole rat can walk the straight segment from `from` (feet) to `to` on supported floor, up to
     * 12 units: the route follower's corner-cutting check. */
    walkable(from:Vec3Data,to:Vec3Data):boolean {
        if(Math.hypot(to.x-from.x,to.z-from.z)>12)return false;
        let support:number|undefined,best=.65;
        for(const y of this.surfaces(from.x,from.z))if(Math.abs(y-from.y)<best){best=Math.abs(y-from.y);support=y;}
        return support!==undefined&&this.connected({x:from.x,y:support,z:from.z},to);
    }
    /** A short supported step while a city route is still being discovered.
     * Every candidate sweeps the complete body; a clear eye ray is insufficient
     * for walls, stair openings, floor gaps and the lip of a sewer shaft. */
    localStep(from:Vec3Data,to:Vec3Data):Vec3Data|undefined {
        const support=this.surfaces(from.x,from.z).filter(y=>Math.abs(y-from.y)<.65)
            .sort((a,b)=>Math.abs(a-from.y)-Math.abs(b-from.y))[0];
        if(support===undefined)return undefined;
        const start={x:from.x,y:support,z:from.z};
        const dx=to.x-from.x,dz=to.z-from.z,length=Math.min(2.5,Math.hypot(dx,dz));
        if(length<.15)return undefined;
        const heading=Math.atan2(dz,dx);
        for(const turn of [0,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3,Math.PI/2,-Math.PI/2]) {
            const x=start.x+Math.cos(heading+turn)*length,z=start.z+Math.sin(heading+turn)*length;
            const heights=this.surfaces(x,z).filter(y=>Math.abs(y-support)<=1.2)
                .sort((a,b)=>Math.abs(a-support)-Math.abs(b-support));
            for(const y of heights){const end={x,y,z};if(this.connected(start,end))return end;}
        }
        return undefined;
    }
    /** Precise final approach to a visible case. The case center may hug a
     * wall or occupy a gap without a grid node; the rat only needs pickup reach.
     * Shorten a blocked step rather than diverting around to the wrong side. */
    approachStep(from:Vec3Data,to:Vec3Data):Vec3Data|undefined {
        const support=this.surfaces(from.x,from.z).find(y=>Math.abs(y-from.y)<.65);
        if(support===undefined||Math.abs(to.y-support-.8)>1.4)return undefined;
        const start={x:from.x,y:support,z:from.z},dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz);
        if(Math.hypot(d,to.y-support-.8)<1.6)return start;
        for(const limit of [2.5,1,.4]){
            const length=Math.min(limit,Math.max(0,d-.9));
            if(length<.1)continue;
            const end={x:from.x+dx/d*length,y:support,z:from.z+dz/d*length};
            if(this.surfaces(end.x,end.z).some(y=>Math.abs(y-support)<.32)&&this.connected(start,end))return end;
        }
        return undefined;
    }
    /** Bounded street-obstacle hop. Require a supported landing, a low solid
     * obstruction and clearance through the ordinary jump's upper envelope.
     * This does not add arbitrary gap, wall or rooftop edges to the flow graph. */
    jumpStep(from:Vec3Data,to:Vec3Data):Vec3Data|undefined {
        const support=this.surfaces(from.x,from.z).find(y=>Math.abs(y-from.y)<.65);
        if(support===undefined)return undefined;
        const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz);
        if(d<3)return undefined;
        for(const length of [4,6]){
            if(length>d+1)continue;
            const end={x:from.x+dx/d*length,y:support,z:from.z+dz/d*length};
            if(!this.surfaces(end.x,end.z).some(y=>Math.abs(y-support)<.32))continue;
            const steps=Math.ceil(length/.4);let blocked=false,safe=true;
            for(let i=0;i<=steps&&safe;i++){
                const t=i/steps,x=from.x+dx/d*length*t,z=from.z+dz/d*length*t;
                if(!this.clear(x,support,z)){
                    blocked=true;
                    // Only low obstacles; a clear endpoint cannot authorize
                    // passing through a wall whose other side happens to be open.
                    if(!this.clear(x,support+2.4,z)){safe=false;break;}
                }
                const low=3.8*4*t*(1-t);
                for(let y=low;y<=7+.001;y+=.5)if(!this.clear(x,support+y,z)){safe=false;break;}
            }
            if(safe&&blocked)return end;
        }
        return undefined;
    }
    route(from:Vec3Data,to:Vec3Data):BotWaypoint[] {
        const start=this.nearest(from),goal=this.nearest(to);if(!start||!goal)return [];
        let field=this.fields.get(goal.id);
        if(!field) {
            if(this.fields.size>=MAX_FIELDS) {
                const oldest=[...this.fields.values()].sort((a,b)=>a.requestedAt-b.requestedAt)[0];
                // Preserve progress when a crowd briefly requests many separate
                // destinations; abandoned fields become replaceable in 0.5 sec.
                if(this.tick-oldest.requestedAt<30&&oldest.head<oldest.frontier.length)return [];
                this.fields.delete(oldest.goal.id);
            }
            field={goal,frontier:[goal],head:0,next:new Map([[goal.id,goal]]),requestedAt:this.tick};
            this.fields.set(goal.id,field);
        }
        field.requestedAt=this.tick;
        if(!field.next.has(start.id))return [];
        const path:BotWaypoint[]=[];
        let node=start;
        // Every next pointer leads to an earlier discovered cell, so the field
        // cannot cycle. The cap additionally bounds malformed/future-map output.
        for(let i=0;i<2048;i++) {
            const next=field.next.get(node.id);
            const launch=next?this.launchEdges.get(`${node.id}>${next.id}`)?.link:undefined;
            const descent=next?this.launchEdges.get(`${next.id}>${node.id}`):undefined;
            path.push({x:node.x,y:node.y,z:node.z,...(launch?{launch}:{}),...(descent?{drop:descent.link.machine.pad}:{})});
            if(node.id===goal.id)return path;
            if(!next)return [];
            node=next;
        }
        return [];
    }
    /** Deterministic offset, accepted only when the entire page has continuous support. */
    paperPlacement(from:Vec3Data,seed:number):Vec3Data|undefined {
        const find=(x:number,z:number)=>this.surfaces(x,z).filter(y=>Math.abs(y-from.y)<.7)
            .sort((a,b)=>Math.abs(a-from.y)-Math.abs(b-from.y))[0];
        for(const offset of [1,0]){
            const x=from.x+(((seed>>>2)%101)/100-.5)*.8*offset;
            const z=from.z+(((seed>>>10)%101)/100-.5)*.8*offset;
            const y=find(x,z);if(y===undefined)continue;
            const left=find(x-.72,z),right=find(x+.72,z),back=find(x,z-.72),front=find(x,z+.72);
            if([left,right,back,front].some(v=>v===undefined))continue;
            const dx=(right!-left!)/1.44,dz=(front!-back!)/1.44;
            let supported=true;
            for(const [ox,oz] of [[-.51,-.51],[-.51,.51],[.51,-.51],[.51,.51]]){
                const h=find(x+ox,z+oz);
                if(h===undefined||Math.abs(h-(y+dx*ox+dz*oz))>.035){supported=false;break;}
            }
            if(supported&&Math.abs(left!+right!-2*y)<.035&&Math.abs(back!+front!-2*y)<.035)
                return {x:Math.round(x*100)/100,y,z:Math.round(z*100)/100};
        }
        return undefined;
    }
    /** A bounded A* route for physical paperwork. Reuses the same support/body-clearance
     * graph as rat navigation; never invents a straight segment through the city. */
    *paperRouteSteps(from:Vec3Data,to:Vec3Data,clear?:(a:Vec3Data,b:Vec3Data)=>boolean):Generator<void,BotWaypoint[]> {
        const start=this.nearest(from,clear?n=>clear(from,n):undefined),goal=this.nearest(to,clear?n=>clear(to,n):undefined);if(!start||!goal)return [];
        type Entry={node:Node;cost:number;rank:number};
        const heap:Entry[]=[],costs=new Map<string,number>([[start.id,0]]),parents=new Map<string,Node>();
        const push=(e:Entry)=>{let i=heap.length;heap.push(e);while(i){const p=(i-1)>>1;if(heap[p]!.rank<=e.rank)break;heap[i]=heap[p]!;i=p;}heap[i]=e;};
        const pop=()=>{const first=heap[0]!,last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1]!.rank<heap[c]!.rank)c++;if(heap[c]!.rank>=last.rank)break;heap[i]=heap[c]!;i=c;}heap[i]=last;}return first;};
        // A high roof is approached through its existing launcher, not by searching
        // every street cell directly below an unreachable vertical destination.
        const entrance=goal.y>24&&start.y<goal.y-4?[...this.launchEdges.values()]
            .filter(e=>Math.abs(e.to.y-goal.y)<2&&Math.hypot(e.to.x-goal.x,e.to.z-goal.z)<50)
            .sort((a,b)=>Math.hypot(a.to.x-goal.x,a.to.z-goal.z)-Math.hypot(b.to.x-goal.x,b.to.z-goal.z))[0]?.from:undefined;
        const distance=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.z-b.z)+Math.abs(a.y-b.y);
        const portals=SEWER_PIPE_ENTRANCES.map(e=>{
            const top=sewerPipePoint(e,0),bottom=sewerPipePoint(e,30);
            return {top:{x:top.x,y:top.floorY,z:top.z},bottom:{x:bottom.x,y:bottom.floorY,z:bottom.z}};
        });
        const estimate=(p:Vec3Data)=>{
            // Reach the actual ramp before searching toward a different floor.
            // Otherwise the heuristic spends its whole budget under/over the case.
            if(goal.y < -5 && p.y > -1)return Math.min(...portals.map(e=>distance(p,e.top)+distance(e.top,e.bottom)+distance(e.bottom,goal)));
            if(goal.y > -1 && p.y < -5)return Math.min(...portals.map(e=>distance(p,e.bottom)+distance(e.bottom,e.top)+distance(e.top,goal)));
            const aim=entrance&&p.y<goal.y-4?entrance:goal;return distance(p,aim);
        };
        push({node:start,cost:0,rank:estimate(start)});
        for(let expanded=0;heap.length&&expanded<12000;expanded++){
            if(expanded&&expanded%64===0)yield;
            const e=pop(),node=e.node;if(e.cost!==costs.get(node.id))continue;
            if(node.id===goal.id){
                const path:BotWaypoint[]=[];let at:Node|undefined=node;
                while(at){path.push({x:at.x,y:at.y,z:at.z});at=parents.get(at.id);}path.reverse();
                for(let i=0;i+1<path.length;i++){
                    const a=path[i]!,b=path[i+1]!;
                    for(const edge of this.launchEdges.values()){
                        if(a.x===edge.from.x&&a.y===edge.from.y&&a.z===edge.from.z&&b.x===edge.to.x&&b.y===edge.to.y&&b.z===edge.to.z)a.launch=edge.link;
                        if(b.x===edge.from.x&&b.y===edge.from.y&&b.z===edge.from.z&&a.x===edge.to.x&&a.y===edge.to.y&&a.z===edge.to.z)a.drop=edge.link.machine.pad;
                    }
                }
                const approach=this.approachStep(goal,{x:to.x,y:to.y+.8,z:to.z});
                if(approach&&Math.hypot(approach.x-goal.x,approach.z-goal.z)>.1)path.push(approach);
                return path;
            }
            const neighbors=[...this.neighbors(node)];
            for(const edge of this.launchEdges.values()){
                if(edge.from.id===node.id)neighbors.push(edge.to);
                if(edge.to.id===node.id)neighbors.push(edge.from);
            }
            for(const next of neighbors){
                const cost=e.cost+Math.hypot(next.x-node.x,next.y-node.y,next.z-node.z);
                if(cost>=(costs.get(next.id)??Infinity))continue;
                costs.set(next.id,cost);parents.set(next.id,node);push({node:next,cost,rank:cost+estimate(next)*2});
            }
        }
        return [];
    }
    /** Bound wall time AND expansions: Workers clocks can freeze within a turn. */
    update(budgetMs=2,maxExpansions=96):void {
        this.tick++;
        const active=[...this.fields.values()].filter(f=>this.tick-f.requestedAt<=ACTIVE_TICKS&&f.head<f.frontier.length);
        if(!active.length)return;
        const deadline=performance.now()+Math.max(0,Math.min(20,budgetMs));
        let remaining=Math.max(0,Math.min(1024,Math.floor(maxExpansions)));
        while(remaining>0&&active.length&&performance.now()<deadline) {
            this.cursor%=active.length;
            const field=active[this.cursor];
            const node=field.frontier[field.head++];
            remaining--;this.work.expansions++;
            for(const neighbor of this.neighbors(node)) {
                if(field.next.has(neighbor.id))continue;
                field.next.set(neighbor.id,node);field.frontier.push(neighbor);
            }
            // Explicit traversal links retain their launch/drop actions in the
            // returned path. Ordinary walking edges still require support.
            for(const edge of this.launchEdges.values())if(edge.to.id===node.id&&!field.next.has(edge.from.id)){
                field.next.set(edge.from.id,node);field.frontier.push(edge.from);
            }
            for(const edge of this.launchEdges.values())if(edge.from.id===node.id&&!field.next.has(edge.to.id)){
                field.next.set(edge.to.id,node);field.frontier.push(edge.to);
            }
            if(field.head===field.frontier.length)active.splice(this.cursor,1);
            else this.cursor++;
        }
    }
}
