import * as C from 'cannon-es';
import {sweepSphereBody} from './sweepSphere';

type Node = { bounds:C.AABB; bodies?:C.Body[]; left?:Node; right?:Node };
/** A static-body BVH for ray broadphase only. Cannon still performs every exact
 * shape intersection, filter, backface check and closest-hit decision. */
export class SpatialRayQuery {
    private root:Node|undefined;
    private statics=new Map<C.Body,number[]>();
    private moving:C.Body[]=[];
    private ranks=new Map<C.Body,number>();
    private changed=true;
    private readonly present=new Set<C.Body>();
    private readonly ray=new C.Ray();
    private readonly bounds=new C.AABB();
    private readonly candidates:C.Body[]=[];
    private readonly onChange=()=>{this.changed=true;};
    constructor(private readonly world:C.World){
        world.addEventListener('addBody',this.onChange);world.addEventListener('removeBody',this.onChange);
    }
    dispose():void {
        this.world.removeEventListener('addBody',this.onChange);this.world.removeEventListener('removeBody',this.onChange);
        this.root=undefined;this.statics.clear();this.moving.length=0;this.candidates.length=0;this.ranks.clear();this.present.clear();
    }
    /** Call once per simulation step, not once per ball. Also notices edited
     * static fixtures and changed body types, even after updateAABB() was called. */
    refresh(){
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
        for(const body of this.statics.keys())if(!present.has(body)){this.statics.delete(body);rebuild=true;}
        if(rebuild)this.root=this.build([...this.statics.keys()]);
        this.changed=false;
        this.updateRanks();
    }
    private updateRanks(){
        const broadphase=this.world.broadphase;
        if(!(broadphase instanceof C.SAPBroadphase))return;
        if(broadphase.dirty){broadphase.sortList();broadphase.dirty=false;}
        this.ranks.clear();broadphase.axisList.forEach((body,i)=>this.ranks.set(body,i));
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
    closest(from:C.Vec3,to:C.Vec3,mask:number,accept?:(body:C.Body)=>boolean,group=16):C.RaycastResult{
        const result=new C.RaycastResult(),broadphase=this.world.broadphase;
        if(!(broadphase instanceof C.SAPBroadphase)&&!accept){
            this.world.raycastClosest(from,to,{collisionFilterGroup:group,collisionFilterMask:mask,skipBackfaces:true},result);return result;
        }
        if(this.changed)this.refresh();else if(broadphase.dirty)this.updateRanks();
        this.bounds.lowerBound.set(Math.min(from.x,to.x),Math.min(from.y,to.y),Math.min(from.z,to.z));
        this.bounds.upperBound.set(Math.max(from.x,to.x),Math.max(from.y,to.y),Math.max(from.z,to.z));
        this.candidates.length=0;this.collect(this.root);
        for(const body of this.moving){if(body.aabbNeedsUpdate)body.updateAABB();if(body.aabb.overlaps(this.bounds))this.candidates.push(body);}
        if(accept){let count=0;for(const body of this.candidates)if(accept(body))this.candidates[count++]=body;this.candidates.length=count;}
        // Equal-distance hits keep precisely SAP's original traversal order.
        if(broadphase instanceof C.SAPBroadphase)this.candidates.sort((a,b)=>this.ranks.get(a)!-this.ranks.get(b)!);
        const ray=this.ray;ray.from.copy(from);ray.to.copy(to);ray.mode=C.Ray.CLOSEST;
        ray.hasHit=false;ray.skipBackfaces=true;ray.checkCollisionResponse=true;
        ray.collisionFilterGroup=group;ray.collisionFilterMask=mask;
        ray.intersectBodies(this.candidates,result);return result;
    }
    /** Reuse the static BVH for the larger Big Cheese collision volume. */
    sphere(from:C.Vec3,to:C.Vec3,radius:number,mask:number,accept:(body:C.Body)=>boolean):C.RaycastResult {
        if(this.changed)this.refresh();
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
}
