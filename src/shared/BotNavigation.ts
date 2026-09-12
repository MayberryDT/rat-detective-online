import {DISPATCH_STATIONS,LAUNCH_MACHINES} from './chaosState';
import { CITY_BOUNDS, GRAYBOX_SPAWNS, grayboxBoxes, type GrayboxBox } from './grayboxLayout';
import { LANDMARK_INTERIORS } from './landmarkLayout';
import { SEWER_LIGHTS } from './sewerLayout';
import type { Vec3Data } from './networkProtocol';
import type { WorldSpec } from './worldSpec';

// Share ONE navigator across the bots. route() queues/caches a route; call update()
// once per frame to give all pending searches a shared, bounded CPU budget.
// Positions are rat feet. An empty route means pending or unreachable, never a
// permission to walk directly through an obstruction.
const GRID = 2;
const BUCKET = 8;
interface Solid { box: GrayboxBox; cx:number; sx:number; cz:number; sz:number; nx:number; ny:number; nz:number; minX:number; maxX:number; minZ:number; maxZ:number }
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

export class BotNavigation {
    private buckets=new Map<string,Solid[]>();
    private columns=new Map<string,Node[]>();
    private edges=new Map<string,Node[]>();
    private fields=new Map<string,FlowField>();
    private tick=0;
    private cursor=0;
    private targets:Vec3Data[];

    constructor(spec:WorldSpec) {
        // These controls are physical obstacles in both human and server bot worlds.
        // Omitting them from navigation sends routes through machines near objectives.
        const controls=[...DISPATCH_STATIONS,...LAUNCH_MACHINES].flatMap(c=>[c.box,c.target])
            .map(box=>({...box,rx:0,rz:0,color:0}));
        for(const box of [...grayboxBoxes(spec),...controls]) {
            const cx=Math.cos(box.rx),sx=Math.sin(box.rx),cz=Math.cos(box.rz),sz=Math.sin(box.rz);
            const dx=Math.abs(cz)*box.w/2+Math.abs(sz*cx)*box.h/2+Math.abs(sz*sx)*box.d/2;
            const dz=Math.abs(sx)*box.h/2+Math.abs(cx)*box.d/2;
            const solid:Solid={box,cx,sx,cz,sz,nx:-sz*cx,ny:cz*cx,nz:sx,minX:box.x-dx,maxX:box.x+dx,minZ:box.z-dz,maxZ:box.z+dz};
            for(let x=Math.floor((solid.minX-1)/BUCKET);x<=Math.floor((solid.maxX+1)/BUCKET);x++)for(let z=Math.floor((solid.minZ-1)/BUCKET);z<=Math.floor((solid.maxZ+1)/BUCKET);z++) {
                const key=`${x},${z}`,bucket=this.buckets.get(key);if(bucket)bucket.push(solid);else this.buckets.set(key,[solid]);
            }
        }
        this.targets=[...GRAYBOX_SPAWNS.map(p=>({...p,y:0})),...SEWER_LIGHTS.map(p=>({...p,y:-7})),
            ...LANDMARK_INTERIORS.flatMap(h=>h.levels.flatMap(y=>[
                {x:h.cx-h.w/2+4,y,z:h.cz+h.d/2-4},
                {x:h.cx+h.w/2-4,y,z:h.cz-h.d/2+5},
            ]))];
    }
    explorationTargets():Vec3Data[] {return this.targets.map(p=>({...p}));}
    private local(s:Solid,x:number,y:number,z:number) {
        const dx=x-s.box.x,dy=y-s.box.y,dz=z-s.box.z;
        const a=s.cz*dx+s.sz*dy,b=-s.sz*dx+s.cz*dy;
        return {x:a,y:s.cx*b+s.sx*dz,z:-s.sx*b+s.cx*dz};
    }
    private nearby(x:number,z:number):Solid[] {return this.buckets.get(`${Math.floor(x/BUCKET)},${Math.floor(z/BUCKET)}`)??[];}
    /** Same three-sphere silhouette as the normal player body, with a small floor tolerance. */
    private clear(x:number,y:number,z:number):boolean {
        for(const s of this.nearby(x,z)) {
            if(x<s.minX-.65||x>s.maxX+.65||z<s.minZ-.65||z>s.maxZ+.65)continue;
            for(const [offset,radius] of [[.6,.58],[1.3,.43],[1.9,.26]]) {
                const p=this.local(s,x,y+offset+.035,z),b=s.box;
                const dx=Math.max(0,Math.abs(p.x)-b.w/2),dy=Math.max(0,Math.abs(p.y)-b.h/2),dz=Math.max(0,Math.abs(p.z)-b.d/2);
                if(dx*dx+dy*dy+dz*dz<radius*radius)return false;
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
            if(y < -7.2||y>36.3||heights.some(h=>Math.abs(h-y)<.08))continue;
            const p=this.local(s,x,y,z);
            if(Math.abs(p.x)>b.w/2+.001||Math.abs(p.z)>b.d/2+.001)continue;
            if(this.clear(x,y,z))heights.push(y);
        }
        return heights;
    }
    private column(gx:number,gz:number):Node[] {
        const key=`${gx},${gz}`;let nodes=this.columns.get(key);if(nodes)return nodes;
        nodes=this.surfaces(gx*GRID,gz*GRID).map(y=>({id:`${key},${Math.round(y*100)}`,gx,gz,x:gx*GRID,y,z:gz*GRID}));
        this.columns.set(key,nodes);return nodes;
    }
    private nearest(p:Vec3Data):Node|undefined {
        let best:Node|undefined,score=Infinity;
        const gx=Math.round(p.x/GRID),gz=Math.round(p.z/GRID);
        for(let radius=0;radius<=3;radius++) {
            for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++) {
                if(radius&&Math.abs(dx)!==radius&&Math.abs(dz)!==radius)continue;
                for(const n of this.column(gx+dx,gz+dz)) {
                    if(Math.abs(p.y-n.y)>4)continue;
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
            if(!this.surfaces(x,z).some(h=>Math.abs(h-y)<.32))return false;
        }return true;
    }
    private neighbors(node:Node):Node[] {
        let out=this.edges.get(node.id);if(out)return out;
        out=[];
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
    route(from:Vec3Data,to:Vec3Data):Vec3Data[] {
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
        const path:Vec3Data[]=[];
        let node=start;
        // Every next pointer leads to an earlier discovered cell, so the field
        // cannot cycle. The cap additionally bounds malformed/future-map output.
        for(let i=0;i<2048;i++) {
            path.push({x:node.x,y:node.y,z:node.z});
            if(node.id===goal.id)return path;
            const next=field.next.get(node.id);if(!next)return [];
            node=next;
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
            remaining--;
            for(const neighbor of this.neighbors(node)) {
                if(field.next.has(neighbor.id))continue;
                field.next.set(neighbor.id,node);field.frontier.push(neighbor);
            }
            if(field.head===field.frontier.length)active.splice(this.cursor,1);
            else this.cursor++;
        }
    }
}
