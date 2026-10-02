import * as THREE from 'three';

/** three's recursive `intersect` without its sort: every hit under `object`, children in order. */
function castInto(object:THREE.Object3D,ray:THREE.Raycaster,hits:THREE.Intersection[]):void {
    if(object.layers.test(ray.layers)){const result:unknown=object.raycast(ray,hits);if(result===false)return;}
    for(let i=0;i<object.children.length;i++)castInto(object.children[i]!,ray,hits);
}

/** The camera's ray checks against what blocks it (the shoulder camera's, and an exhibit replay's director's).
 * Frozen city solids (2,400, mostly hidden behind the baked city) never move, so their world bounding spheres are
 * kept (x, y, z, radius) and a ray only raycasts the few it can reach; each ray used to sphere-test every solid.
 * Rats and props with parts raycast as before. Build after the blockers' world matrices are current. */
export class CameraBlockers {
    private readonly solids:THREE.Mesh[];
    private readonly solidSpheres:Float64Array;
    private readonly moving:THREE.Object3D[];
    private readonly hits:THREE.Intersection[]=[];
    constructor(blockers:readonly THREE.Object3D[]) {
        this.solids=blockers.filter((o):o is THREE.Mesh=>o instanceof THREE.Mesh&&!o.matrixAutoUpdate&&!o.children.length);
        const solids=new Set<THREE.Object3D>(this.solids),sphere=new THREE.Sphere();
        this.moving=blockers.filter(o=>!solids.has(o));
        this.solidSpheres=new Float64Array(this.solids.length*4);
        this.solids.forEach((mesh,i)=>{
            if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
            sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
            this.solidSpheres.set([sphere.center.x,sphere.center.y,sphere.center.z,sphere.radius],i*4);
        });
    }

    /** The nearest blocker along `ray` within its `far`: the same hit as raycasting every blocker. */
    first(ray:THREE.Raycaster):THREE.Intersection|undefined {
        const {origin,direction}=ray.ray,far=ray.far,spheres=this.solidSpheres,hits=this.hits;
        hits.length=0;
        for(let i=0;i<this.solids.length;i++){
            const x=spheres[i*4]-origin.x,y=spheres[i*4+1]-origin.y,z=spheres[i*4+2]-origin.z,r=spheres[i*4+3];
            const along=x*direction.x+y*direction.y+z*direction.z;
            // Wholly behind the origin, wholly past `far`, or off the line: no hit is possible.
            if(along<-r||along>far+r||x*x+y*y+z*z-along*along>r*r)continue;
            castInto(this.solids[i]!,ray,hits);
        }
        for(let i=0;i<this.moving.length;i++)castInto(this.moving[i]!,ray,hits);
        // The nearest, and the first found among equals: what three's stable sort puts first.
        let nearest=hits[0];
        for(let i=1;i<hits.length;i++)if(hits[i]!.distance<nearest!.distance)nearest=hits[i];
        return nearest;
    }
}
