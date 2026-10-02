import * as C from 'cannon-es';
import {boxQuaternion,CITY_BARS_GROUP,type BoxPose} from './boxFrame';

const CELL=8;
const cellKey=(x:number,z:number)=>(x+1024)*2048+(z+1024);

/** The city's fixed boxes live in this broadphase, not in `world.bodies`.
 * Cannon's solver, integrator and force clearing loop over every world body on
 * every step; with ~1,430 boxes in each world that was about half of the server
 * tick. Fixed bodies still collide (paired here against every moving body's
 * bounds), block rays (`aabbQuery`, used by `world.raycast*`) and feed
 * SpatialRayQuery. They must never move, resize or change type.
 *
 * Moving bodies (rats, cases, corpses, anything added with `world.addBody`)
 * keep sweep-and-prune among
 * themselves, skipping pairs Cannon rejects because both are static or asleep. */
export class StaticCityBroadphase extends C.SAPBroadphase {
    readonly fixed:C.Body[]=[];
    /** Bumped on every add/remove so ray indexes can rebuild. */
    fixedVersion=0;
    private readonly cells=new Map<number,C.Body[]>();
    private readonly fixedIndex=new Map<C.Body,number>();
    private seen=new Uint32Array(0);
    private queryStamp=0;
    private readonly found:C.Body[]=[];
    private nextAwake=new Int32Array(0);

    addFixed(body:C.Body):void {
        if(this.fixedIndex.has(body))return;
        body.updateAABB();this.fixedVersion++;
        this.fixedIndex.set(body,this.fixed.length);this.fixed.push(body);
        const {lowerBound:l,upperBound:u}=body.aabb;
        for(let x=Math.floor(l.x/CELL);x<=Math.floor(u.x/CELL);x++)for(let z=Math.floor(l.z/CELL);z<=Math.floor(u.z/CELL);z++){
            const key=cellKey(x,z),cell=this.cells.get(key);
            if(cell)cell.push(body);else this.cells.set(key,[body]);
        }
    }
    removeFixed(body:C.Body):boolean {
        const index=this.fixedIndex.get(body);if(index===undefined)return false;
        const last=this.fixed.pop()!;
        if(last!==body){this.fixed[index]=last;this.fixedIndex.set(last,index);}
        this.fixedIndex.delete(body);this.fixedVersion++;
        const {lowerBound:l,upperBound:u}=body.aabb;
        for(let x=Math.floor(l.x/CELL);x<=Math.floor(u.x/CELL);x++)for(let z=Math.floor(l.z/CELL);z<=Math.floor(u.z/CELL);z++){
            const key=cellKey(x,z),cell=this.cells.get(key);if(!cell)continue;
            const at=cell.indexOf(body);if(at>=0)cell.splice(at,1);
            if(!cell.length)this.cells.delete(key);
        }
        return true;
    }
    /** Fixed bodies whose bounds overlap `aabb`, each once, in a reused array. */
    private overlapping(aabb:C.AABB):C.Body[] {
        const found=this.found;found.length=0;
        if(!this.fixed.length)return found;
        if(this.seen.length<this.fixed.length)this.seen=new Uint32Array(this.fixed.length);
        if(++this.queryStamp===0xffffffff){this.seen.fill(0);this.queryStamp=1;}
        const stamp=this.queryStamp,{lowerBound:l,upperBound:u}=aabb;
        for(let x=Math.floor(l.x/CELL);x<=Math.floor(u.x/CELL);x++)for(let z=Math.floor(l.z/CELL);z<=Math.floor(u.z/CELL);z++){
            const cell=this.cells.get(cellKey(x,z));if(!cell)continue;
            for(const body of cell){
                const index=this.fixedIndex.get(body)!;
                if(this.seen[index]===stamp)continue;this.seen[index]=stamp;
                if(body.aabb.overlaps(aabb))found.push(body);
            }
        }
        return found;
    }
    override collisionPairs(_world:C.World,p1:C.Body[],p2:C.Body[]){
        if(this.dirty){this.sortList();this.dirty=false;}
        const bodies=this.axisList,n=bodies.length;
        if(this.nextAwake.length<n+1)this.nextAwake=new Int32Array(n+1);
        const next=this.nextAwake;next[n]=n;
        for(let i=n-1;i>=0;i--){const b=bodies[i];next[i]=(b.type&C.Body.STATIC)!==0||b.sleepState===C.Body.SLEEPING?next[i+1]:i;}
        for(let i=0;i<n;i++){
            const a=bodies[i],inert=(a.type&C.Body.STATIC)!==0||a.sleepState===C.Body.SLEEPING;
            for(let j=inert?next[i+1]:i+1;j<n;j=inert?next[j+1]:j+1){
                const b=bodies[j];
                if(!this.needBroadphaseCollision(a,b))continue;
                if(!C.SAPBroadphase.checkBounds(a,b,this.axisIndex))break;
                this.intersectionTest(a,b,p1,p2);
            }
        }
        // Every awake moving body against the fixed city boxes it overlaps.
        for(let i=0;i<n;i++){
            const a=bodies[i];
            if((a.type&C.Body.STATIC)!==0||a.sleepState===C.Body.SLEEPING)continue;
            if(a.aabbNeedsUpdate)a.updateAABB();
            for(const b of this.overlapping(a.aabb))if(this.needBroadphaseCollision(a,b))this.intersectionTest(a,b,p1,p2);
        }
    }
    override aabbQuery(world:C.World,aabb:C.AABB,result:C.Body[]=[]):C.Body[] {
        super.aabbQuery(world,aabb,result);
        for(const body of this.overlapping(aabb))result.push(body);
        return result;
    }
}

/** Add a never-moving city body: outside `world.bodies` when the world uses StaticCityBroadphase. */
export function addCityBody(world:C.World,body:C.Body):void {
    // Cannon computes the AABB while adding shapes, before callers place the body.
    body.updateAABB();
    if(world.broadphase instanceof StaticCityBroadphase)world.broadphase.addFixed(body);else world.addBody(body);
}
export function removeCityBody(world:C.World,body:C.Body):void {
    if(!(world.broadphase instanceof StaticCityBroadphase)||!world.broadphase.removeFixed(body))world.removeBody(body);
}

/** Slick city surfaces (chutes). Cannon combines friction per material pair, so a
 * world makes slick contacts frictionless with a ContactMaterial against its movers'
 * material; the rat controllers recognise it to hand the ride to gravity. */
export const SLICK_MATERIAL=new C.Material('slick');

/** The static body of one city box: posed by boxFrame, bars in their own group. */
export function cityBoxBody(b:BoxPose&{passBalls?:true;slick?:true}):C.Body {
    const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(b.w/2,b.h/2,b.d/2))});
    body.position.set(b.x,b.y,b.z);
    const q=boxQuaternion(b);body.quaternion.set(q.x,q.y,q.z,q.w);
    if(b.passBalls)body.collisionFilterGroup=CITY_BARS_GROUP;
    if(b.slick)body.material=SLICK_MATERIAL;
    body.updateAABB();
    return body;
}
