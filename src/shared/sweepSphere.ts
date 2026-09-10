import * as C from 'cannon-es';

/** Continuous sphere against the game's boxes and rat spheres. Box faces,
 * rounded edges and corners are tested separately; an expanded AABB alone
 * would incorrectly damage rats beside a corner and miss grazing rebounds. */
export function sweepSphereBody(from:C.Vec3,to:C.Vec3,radius:number,body:C.Body):C.RaycastResult {
    const result=new C.RaycastResult(),travel=to.vsub(from),length=travel.length();
    let best=Infinity;
    for(let shapeIndex=0;shapeIndex<body.shapes.length;shapeIndex++){
        const shape=body.shapes[shapeIndex];if(!shape.collisionResponse)continue;
        const rotation=body.quaternion.mult(body.shapeOrientations[shapeIndex]);
        const center=body.quaternion.vmult(body.shapeOffsets[shapeIndex]).vadd(body.position);
        const inverse=rotation.conjugate(),p0=inverse.vmult(from.vsub(center)),delta=inverse.vmult(travel);
        const p=[p0.x,p0.y,p0.z],v=[delta.x,delta.y,delta.z];
        const offer=(t:number,n:number[])=>{
            if(t<0||t>1||t>=best||v[0]*n[0]+v[1]*n[1]+v[2]*n[2]>=-1e-9)return;
            const local=new C.Vec3(...n as [number,number,number]);local.normalize();
            const normal=rotation.vmult(local),point=from.vadd(travel.scale(t)).vsub(normal.scale(radius));
            result.set(from,to,normal,point,shape,body,t*length);result.hasHit=true;best=t;
        };
        const root=(a:number,b:number,c:number,accept:(t:number)=>void)=>{
            if(a<1e-12)return;const discriminant=b*b-4*a*c;if(discriminant<0)return;
            const t=(-b-Math.sqrt(discriminant))/(2*a);if(t>=0&&t<=1)accept(t);
        };
        if(shape instanceof C.Sphere){
            const r=radius+shape.radius,dist=p0.lengthSquared();
            if(dist<=r*r)offer(0,p);
            else root(delta.lengthSquared(),2*p0.dot(delta),dist-r*r,t=>offer(t,p.map((a,i)=>a+v[i]*t)));
        }else if(shape instanceof C.Box){
            const h=[shape.halfExtents.x,shape.halfExtents.y,shape.halfExtents.z];
            const closest=p.map((a,i)=>Math.max(-h[i],Math.min(h[i],a))),offset=p.map((a,i)=>a-closest[i]);
            const square=offset.reduce((sum,a)=>sum+a*a,0);
            if(square<=radius*radius){
                if(square>1e-12)offer(0,offset);
                else {const axis=h.map((a,i)=>a-Math.abs(p[i])).reduce((best,a,i,all)=>a<all[best]?i:best,0);const n=[0,0,0];n[axis]=p[axis]<0?-1:1;offer(0,n);}
            }
            // Six planar faces.
            for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
                if(Math.abs(v[axis])<1e-12)continue;
                const t=(sign*(h[axis]+radius)-p[axis])/v[axis];
                if(t<0||t>1||p.some((a,i)=>i!==axis&&Math.abs(a+v[i]*t)>h[i]+1e-8))continue;
                const n=[0,0,0];n[axis]=sign;offer(t,n);
            }
            // Twelve finite cylindrical edge regions.
            for(let free=0;free<3;free++){
                const a=(free+1)%3,b=(free+2)%3;
                for(const sa of [-1,1])for(const sb of [-1,1]){
                    const pa=p[a]-sa*h[a],pb=p[b]-sb*h[b];
                    root(v[a]*v[a]+v[b]*v[b],2*(pa*v[a]+pb*v[b]),pa*pa+pb*pb-radius*radius,t=>{
                        if(Math.abs(p[free]+v[free]*t)>h[free]+1e-8||(p[a]+v[a]*t)*sa<h[a]-1e-8||(p[b]+v[b]*t)*sb<h[b]-1e-8)return;
                        const n=[0,0,0];n[a]=pa+v[a]*t;n[b]=pb+v[b]*t;offer(t,n);
                    });
                }
            }
            // Eight spherical corner regions.
            for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
                const signs=[x,y,z],q=p.map((a,i)=>a-signs[i]*h[i]);
                root(delta.lengthSquared(),2*q.reduce((sum,a,i)=>sum+a*v[i],0),q.reduce((sum,a)=>sum+a*a,0)-radius*radius,t=>{
                    if(p.some((a,i)=>(a+v[i]*t)*signs[i]<h[i]-1e-8))return;
                    offer(t,q.map((a,i)=>a+v[i]*t));
                });
            }
        }else if(shape instanceof C.Plane&&delta.z<0)offer((radius-p0.z)/delta.z,[0,0,1]);
    }
    return result;
}
