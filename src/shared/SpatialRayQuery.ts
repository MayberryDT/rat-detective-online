import * as C from 'cannon-es';
import {sweepSphereBody} from './sweepSphere';
import {StaticCityBroadphase} from './StaticCityBroadphase';

type Node = { bounds:C.AABB; bodies?:C.Body[]; left?:Node; right?:Node };
const NO_BODIES:readonly C.Body[]=[];
/** A flat bounding-volume tree: 6 bounds per node; an inner node's children in left/right; a leaf (count > 0)
 * holds `count` bodies from index `right` of `bodies`, whose boxes are copied into `bodyBounds`. */
interface SightTree { bounds:Float64Array; left:Int32Array; right:Int32Array; count:Int32Array; bodies:C.Body[]; bodyBounds:Float64Array }
const SIGHT_TREE_EMPTY:SightTree={bounds:new Float64Array(0),left:new Int32Array(0),right:new Int32Array(0),count:new Int32Array(0),bodies:[],bodyBounds:new Float64Array(0)};
const BINS=12,LEAF=4;
/** Builds a SightTree by the binned surface-area heuristic over the bodies' current boxes. */
function sightTree(input:readonly C.Body[]):SightTree{
    const bounds:number[]=[],left:number[]=[],right:number[]=[],count:number[]=[],bodies:C.Body[]=[];
    const area=(b:readonly number[]|Float64Array,o:number)=>{const x=b[o+3]!-b[o]!,y=b[o+4]!-b[o+1]!,z=b[o+5]!-b[o+2]!;return x*y+y*z+z*x;};
    const binBox=new Float64Array(BINS*6),binCount=new Int32Array(BINS),below=new Float64Array(BINS),sweep=new Float64Array(6);
    const empty=(b:Float64Array,o:number)=>{b[o]=b[o+1]=b[o+2]=Infinity;b[o+3]=b[o+4]=b[o+5]=-Infinity;};
    const grow=(b:Float64Array,o:number,from:readonly number[]|Float64Array,f:number)=>{for(let a=0;a<3;a++){b[o+a]=Math.min(b[o+a]!,from[f+a]!);b[o+a+3]=Math.max(b[o+a+3]!,from[f+a+3]!);}};
    const build=(items:C.Body[]):number=>{
        const node=count.length;count.push(0);left.push(-1);right.push(-1);
        const box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity],centre=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
        for(const body of items){
            const lo=body.aabb.lowerBound,hi=body.aabb.upperBound,c=[(lo.x+hi.x)/2,(lo.y+hi.y)/2,(lo.z+hi.z)/2];
            box[0]=Math.min(box[0]!,lo.x);box[1]=Math.min(box[1]!,lo.y);box[2]=Math.min(box[2]!,lo.z);box[3]=Math.max(box[3]!,hi.x);box[4]=Math.max(box[4]!,hi.y);box[5]=Math.max(box[5]!,hi.z);
            for(let a=0;a<3;a++){centre[a]=Math.min(centre[a]!,c[a]!);centre[a+3]=Math.max(centre[a+3]!,c[a]!);}
        }
        bounds.push(...box);
        if(items.length<=LEAF){right[node]=bodies.length;count[node]=items.length;bodies.push(...items);return node;}
        // Each axis in BINS slices of the centres; split where boxes' area times bodies is least on both sides.
        let best=Infinity,bestAxis=-1,bestBin=0;
        const binOf=(body:C.Body,a:number)=>{
            const lo=body.aabb.lowerBound,hi=body.aabb.upperBound,c=a===0?(lo.x+hi.x)/2:a===1?(lo.y+hi.y)/2:(lo.z+hi.z)/2;
            return Math.min(BINS-1,Math.max(0,Math.floor((c-centre[a]!)/(centre[a+3]!-centre[a]!)*BINS)||0));
        };
        for(let a=0;a<3;a++){
            if(!(centre[a+3]!>centre[a]!))continue;
            binCount.fill(0);for(let k=0;k<BINS;k++)empty(binBox,k*6);
            for(const body of items){const k=binOf(body,a),lo=body.aabb.lowerBound,hi=body.aabb.upperBound;binCount[k]!++;grow(binBox,k*6,[lo.x,lo.y,lo.z,hi.x,hi.y,hi.z],0);}
            empty(sweep,0);let n=0;
            for(let k=0;k<BINS-1;k++){grow(sweep,0,binBox,k*6);n+=binCount[k]!;below[k]=n?area(sweep,0)*n:0;}
            empty(sweep,0);n=0;
            for(let k=BINS-1;k>0;k--){
                grow(sweep,0,binBox,k*6);n+=binCount[k]!;
                const cost=below[k-1]!+(n?area(sweep,0)*n:0);
                if(n&&n<items.length&&cost<best){best=cost;bestAxis=a;bestBin=k;}
            }
        }
        let low:C.Body[],high:C.Body[];
        if(bestAxis<0){const middle=items.length>>1;low=items.slice(0,middle);high=items.slice(middle);}
        else{low=[];high=[];for(const body of items)(binOf(body,bestAxis)<bestBin?low:high).push(body);}
        left[node]=build(low);right[node]=build(high);
        return node;
    };
    if(input.length)build([...input]);
    const bodyBounds=new Float64Array(bodies.length*6);
    bodies.forEach((body,i)=>{const lo=body.aabb.lowerBound,hi=body.aabb.upperBound;bodyBounds.set([lo.x,lo.y,lo.z,hi.x,hi.y,hi.z],i*6);});
    return {bounds:new Float64Array(bounds),left:Int32Array.from(left),right:Int32Array.from(right),count:Int32Array.from(count),bodies,bodyBounds};
}
/** A static-body BVH for ray broadphase only. Cannon still performs every exact
 * shape intersection, filter, backface check and closest-hit decision. */
export class SpatialRayQuery {
    private root:Node|undefined;
    private statics=new Map<C.Body,number[]>();
    private moving:C.Body[]=[];
    private ranks=new Map<C.Body,number>();
    private readonly rankOrder:C.Body[]=[];
    private ranksDirty=true;
    private changed=true;
    private readonly present=new Set<C.Body>();
    // Flat copy of `statics` so an unchanged step compares poses without map lookups.
    private staticList:C.Body[]=[];
    private staticPose=new Float64Array(0);
    private readonly ray=new C.Ray();
    private readonly bounds=new C.AABB();
    private readonly candidates:C.Body[]=[];
    private readonly onChange=()=>{this.changed=true;this.ranksDirty=true;};
    /** Fixed city bodies (StaticCityBroadphase, outside world.bodies): they join
     * the BVH and never take the per-step pose check. Ranked after moving bodies. */
    private city=new Map<C.Body,number>();
    private cityVersion=-1;
    private cityFixed:readonly C.Body[]=NO_BODIES;
    /** Ray/sphere query count for diagnostics; callers may reset it. */
    queries=0;
    constructor(private readonly world:C.World){
        world.addEventListener('addBody',this.onChange);world.addEventListener('removeBody',this.onChange);
    }
    dispose():void {
        this.world.removeEventListener('addBody',this.onChange);this.world.removeEventListener('removeBody',this.onChange);
        this.root=undefined;this.statics.clear();this.moving.length=0;this.candidates.length=0;this.ranks.clear();this.rankOrder.length=0;this.present.clear();
        this.staticList=[];this.staticPose=new Float64Array(0);this.flatRoot=undefined;this.sight=SIGHT_TREE_EMPTY;
    }
    /** Call once per simulation step, not once per ball. Also notices edited
     * static fixtures and changed body types, even after updateAABB() was called. */
    refresh(){
        const broadphase=this.world.broadphase,fixed=broadphase instanceof StaticCityBroadphase?broadphase.fixed:NO_BODIES;
        const version=broadphase instanceof StaticCityBroadphase?broadphase.fixedVersion:0;
        if(!this.changed&&version===this.cityVersion&&this.unchanged()){this.updateRanks();return;}
        let rebuild=false;this.moving.length=0;
        const present=this.present;present.clear();
        for(const body of this.world.bodies){
            if(body.type!==C.Body.STATIC){this.moving.push(body);continue;}
            present.add(body);
            const p=body.position,q=body.quaternion;
            const previous=this.statics.get(body);
            if(body.aabbNeedsUpdate||!previous||p.x!==previous[0]||p.y!==previous[1]||p.z!==previous[2]||
                q.x!==previous[3]||q.y!==previous[4]||q.z!==previous[5]||q.w!==previous[6]||body.shapes.length!==previous[7]){
                body.updateAABB();this.statics.set(body,[p.x,p.y,p.z,q.x,q.y,q.z,q.w,body.shapes.length]);rebuild=true;
            }
        }
        const cityChanged=version!==this.cityVersion||fixed!==this.cityFixed;
        if(cityChanged){
            this.city=new Map(fixed.map((body,i)=>[body,1e9+i]));this.cityVersion=version;this.cityFixed=fixed;
            for(const body of fixed){
                present.add(body);
                if(!this.statics.has(body)){this.statics.set(body,[]);rebuild=true;}
            }
            for(const body of this.statics.keys())if(!present.has(body)){this.statics.delete(body);rebuild=true;}
        }
        // The same city: only world statics (all in staticList) can have gone, so a rat or ball coming
        // or going costs a scan of world.bodies, not of every city body.
        else for(const body of this.staticList)if(!present.has(body)){this.statics.delete(body);rebuild=true;}
        if(rebuild)this.root=this.build([...this.statics.keys()]);
        if(rebuild||cityChanged){
            this.staticList=[...this.statics.keys()].filter(body=>!this.city.has(body));this.staticPose=new Float64Array(this.staticList.length*8);
            let k=0;for(const body of this.staticList)for(const value of this.statics.get(body)!)this.staticPose[k++]=value;
        }
        this.changed=false;
        this.updateRanks();
    }
    /** True when no static moved, resized or changed type since the last full scan.
     * Added/removed bodies are reported separately through `changed`. */
    private unchanged():boolean{
        const pose=this.staticPose;let k=0;
        for(const body of this.staticList){
            const p=body.position,q=body.quaternion;
            if(body.type!==C.Body.STATIC||body.aabbNeedsUpdate||p.x!==pose[k]||p.y!==pose[k+1]||p.z!==pose[k+2]||
                q.x!==pose[k+3]||q.y!==pose[k+4]||q.z!==pose[k+5]||q.w!==pose[k+6]||body.shapes.length!==pose[k+7])return false;
            k+=8;
        }
        for(const body of this.moving)if(body.type===C.Body.STATIC)return false;
        return true;
    }
    private updateRanks(){
        const broadphase=this.world.broadphase;
        if(!(broadphase instanceof C.SAPBroadphase))return;
        if(broadphase.dirty){broadphase.sortList();broadphase.dirty=false;}
        const list=broadphase.axisList,order=this.rankOrder;
        if(this.ranksDirty||list.length!==order.length){
            this.ranks.clear();order.length=list.length;
            for(let i=0;i<list.length;i++){order[i]=list[i];this.ranks.set(list[i],i);}
            this.ranksDirty=false;return;
        }
        // Insertion sort moves only a few bodies per step; rewrite just those ranks.
        for(let i=0;i<list.length;i++)if(order[i]!==list[i]){order[i]=list[i];this.ranks.set(list[i],i);}
    }
    private build(bodies:C.Body[]):Node|undefined{
        if(!bodies.length)return;
        const bounds=bodies[0].aabb.clone();for(let i=1;i<bodies.length;i++)bounds.extend(bodies[i].aabb);
        if(bodies.length<=8)return {bounds,bodies};
        const size=bounds.upperBound.vsub(bounds.lowerBound);
        const axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
        bodies.sort((a,b)=>(a.aabb.lowerBound[axis]+a.aabb.upperBound[axis])-(b.aabb.lowerBound[axis]+b.aabb.upperBound[axis]));
        const middle=bodies.length>>1;
        return {bounds,left:this.build(bodies.slice(0,middle)),right:this.build(bodies.slice(middle))};
    }
    private collect(node:Node|undefined){
        if(!node||!node.bounds.overlaps(this.bounds))return;
        if(node.bodies){for(const body of node.bodies)if(body.aabb.overlaps(this.bounds))this.candidates.push(body);}
        else{this.collect(node.left);this.collect(node.right);}
    }
    private readonly byRank=(a:C.Body,b:C.Body)=>(this.ranks.get(a)??this.city.get(a)!)-(this.ranks.get(b)??this.city.get(b)!);
    /** `result` is reset and filled; pass a kept one where the hit is read before the next query. */
    closest(from:C.Vec3,to:C.Vec3,mask:number,accept?:(body:C.Body)=>boolean,group=16,result=new C.RaycastResult()):C.RaycastResult{
        const broadphase=this.world.broadphase;result.reset();this.queries++;
        if(!(broadphase instanceof C.SAPBroadphase)&&!accept){
            this.world.raycastClosest(from,to,{collisionFilterGroup:group,collisionFilterMask:mask,skipBackfaces:true},result);return result;
        }
        if(this.changed||broadphase instanceof StaticCityBroadphase&&broadphase.fixedVersion!==this.cityVersion)this.refresh();else if(broadphase.dirty)this.updateRanks();
        this.bounds.lowerBound.set(Math.min(from.x,to.x),Math.min(from.y,to.y),Math.min(from.z,to.z));
        this.bounds.upperBound.set(Math.max(from.x,to.x),Math.max(from.y,to.y),Math.max(from.z,to.z));
        this.candidates.length=0;this.collect(this.root);
        for(const body of this.moving){if(body.aabbNeedsUpdate)body.updateAABB();if(body.aabb.overlaps(this.bounds))this.candidates.push(body);}
        if(accept){let count=0;for(const body of this.candidates)if(accept(body))this.candidates[count++]=body;this.candidates.length=count;}
        // Equal-distance hits keep precisely SAP's original traversal order.
        if(broadphase instanceof C.SAPBroadphase)this.candidates.sort(this.byRank);
        const ray=this.ray;ray.from.copy(from);ray.to.copy(to);ray.mode=C.Ray.CLOSEST;
        ray.hasHit=false;ray.skipBackfaces=true;ray.checkCollisionResponse=true;
        ray.collisionFilterGroup=group;ray.collisionFilterMask=mask;
        ray.intersectBodies(this.candidates,result);return result;
    }
    /** Reuse the static BVH for the larger Big Cheese collision volume. */
    sphere(from:C.Vec3,to:C.Vec3,radius:number,mask:number,accept:(body:C.Body)=>boolean):C.RaycastResult {
        const broadphase=this.world.broadphase;
        if(this.changed||broadphase instanceof StaticCityBroadphase&&broadphase.fixedVersion!==this.cityVersion)this.refresh();this.queries++;
        this.bounds.lowerBound.set(Math.min(from.x,to.x)-radius,Math.min(from.y,to.y)-radius,Math.min(from.z,to.z)-radius);
        this.bounds.upperBound.set(Math.max(from.x,to.x)+radius,Math.max(from.y,to.y)+radius,Math.max(from.z,to.z)+radius);
        this.candidates.length=0;this.collect(this.root);
        for(const body of this.moving){if(body.aabbNeedsUpdate)body.updateAABB();if(body.aabb.overlaps(this.bounds))this.candidates.push(body);}
        let result=new C.RaycastResult();
        for(const body of this.candidates){
            if(!(body.collisionFilterGroup&mask)||!(body.collisionFilterMask&16)||!body.collisionResponse||!accept(body))continue;
            const hit=sweepSphereBody(from,to,radius,body);
            if(hit.hasHit&&(!result.hasHit||hit.distance<result.distance))result=hit;
        }
        return result;
    }
    /** Whether anything blocks the segment: `closest(from,to,mask).hasHit` without the nearest hit, so
     * line-of-sight checks visit only bodies whose boxes the segment crosses, in any order, and stop at the first. */
    blocked(from:C.Vec3,to:C.Vec3,mask:number,group=16):boolean{
        const result=this.anyResult,broadphase=this.world.broadphase;result.reset();this.queries++;
        if(!(broadphase instanceof C.SAPBroadphase)){this.world.raycastAny(from,to,{collisionFilterGroup:group,collisionFilterMask:mask,skipBackfaces:true},result);return result.hasHit;}
        if(this.changed||broadphase instanceof StaticCityBroadphase&&broadphase.fixedVersion!==this.cityVersion)this.refresh();
        const s=this.segment;s[0]=from.x;s[1]=from.y;s[2]=from.z;s[3]=to.x-from.x;s[4]=to.y-from.y;s[5]=to.z-from.z;s[6]=1/s[3];s[7]=1/s[4];s[8]=1/s[5];
        const ray=this.ray;ray.from.copy(from);ray.to.copy(to);ray.mode=C.Ray.ANY;
        ray.hasHit=false;ray.skipBackfaces=true;ray.checkCollisionResponse=true;
        ray.collisionFilterGroup=group;ray.collisionFilterMask=mask;
        for(const body of this.moving){
            if(body.aabbNeedsUpdate)body.updateAABB();
            const lo=body.aabb.lowerBound,hi=body.aabb.upperBound;
            if(this.crosses(lo.x,lo.y,lo.z,hi.x,hi.y,hi.z)){ray.intersectBody(body,result);if(result.hasHit)return true;}
        }
        if(!this.root)return false;
        if(this.flatRoot!==this.root)this.flatten(this.root);
        const {bounds,left,right,count,bodies,bodyBounds}=this.sight,stack=this.stack;let top=0;stack[top++]=0;
        while(top>0){
            const i=stack[--top]!;let o=i*6;
            if(!this.crosses(bounds[o]!,bounds[o+1]!,bounds[o+2]!,bounds[o+3]!,bounds[o+4]!,bounds[o+5]!))continue;
            const n=count[i]!;
            if(!n){stack[top++]=left[i]!;stack[top++]=right[i]!;continue;}
            for(let k=right[i]!,end=k+n;k<end;k++){
                o=k*6;
                if(this.crosses(bodyBounds[o]!,bodyBounds[o+1]!,bodyBounds[o+2]!,bodyBounds[o+3]!,bodyBounds[o+4]!,bodyBounds[o+5]!)){ray.intersectBody(bodies[k]!,result);if(result.hasHit)return true;}
            }
        }
        return false;
    }
    private readonly anyResult=new C.RaycastResult();
    /** The segment being tested: origin x,y,z, extent x,y,z, then 1/extent. */
    private readonly segment=new Float64Array(9);
    // A second tree over the same static bodies, for `blocked` only (`closest` and `sphere` keep `root`, whose
    // order decides ties): built by surface area so thin street slabs and tall blocks part early, and flat.
    private flatRoot:Node|undefined;
    private sight=SIGHT_TREE_EMPTY;
    private stack=new Int32Array(0);
    private flatten(root:Node){
        const bodies:C.Body[]=[],nodes=[root];
        for(let i=0;i<nodes.length;i++){const n=nodes[i]!;if(n.bodies)bodies.push(...n.bodies);else nodes.push(n.left!,n.right!);}
        this.sight=sightTree(bodies);this.stack=new Int32Array(this.sight.count.length+1);this.flatRoot=root;
    }
    /** Slab test of the segment against a box grown by a millimetre, so rounding never drops a box a hit lies on. */
    private crosses(lx:number,ly:number,lz:number,hx:number,hy:number,hz:number):boolean{
        const s=this.segment,m=1e-3;
        let t0=0,t1=1,a:number,b:number;
        if(s[3]===0){if(s[0]!<lx-m||s[0]!>hx+m)return false;}
        else{a=(lx-m-s[0]!)*s[6]!;b=(hx+m-s[0]!)*s[6]!;if(a>b){const t=a;a=b;b=t;}if(a>t0)t0=a;if(b<t1)t1=b;if(t0>t1)return false;}
        if(s[4]===0){if(s[1]!<ly-m||s[1]!>hy+m)return false;}
        else{a=(ly-m-s[1]!)*s[7]!;b=(hy+m-s[1]!)*s[7]!;if(a>b){const t=a;a=b;b=t;}if(a>t0)t0=a;if(b<t1)t1=b;if(t0>t1)return false;}
        if(s[5]===0){if(s[2]!<lz-m||s[2]!>hz+m)return false;}
        else{a=(lz-m-s[2]!)*s[8]!;b=(hz+m-s[2]!)*s[8]!;if(a>b){const t=a;a=b;b=t;}if(a>t0)t0=a;if(b<t1)t1=b;if(t0>t1)return false;}
        return true;
    }
}
