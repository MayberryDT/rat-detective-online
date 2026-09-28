import * as C from 'cannon-es';

// Runs for every candidate body of every ball on every server step, so the
// math uses module scratch instead of per-call vectors, arrays and closures.
// Offer order and floating-point evaluation order match the original
// array/closure form exactly: the room's trajectory hash must not change.
const rotation=new C.Quaternion(),inverse=new C.Quaternion();
const travel=new C.Vec3(),center=new C.Vec3(),relative=new C.Vec3(),p0=new C.Vec3(),delta=new C.Vec3();
const local=new C.Vec3(),normal=new C.Vec3(),point=new C.Vec3(),along=new C.Vec3(),inset=new C.Vec3();
const p=new Float64Array(3),v=new Float64Array(3),h=new Float64Array(3),q=new Float64Array(3),n=new Float64Array(3);
const SIGNS=[-1,1];
/** The sweep being evaluated; `best` is the earliest accepted fraction. */
const sweep={from:travel,to:travel,radius:0,length:0,best:Infinity,shape:undefined as C.Shape|undefined,body:undefined as C.Body|undefined,result:undefined as C.RaycastResult|undefined};

function offer(t:number,nx:number,ny:number,nz:number):void {
    if(t<0||t>1||t>=sweep.best||v[0]*nx+v[1]*ny+v[2]*nz>=-1e-9)return;
    local.set(nx,ny,nz);local.normalize();
    rotation.vmult(local,normal);
    travel.scale(t,along);sweep.from.vadd(along,point);normal.scale(sweep.radius,inset);point.vsub(inset,point);
    sweep.result!.set(sweep.from,sweep.to,normal,point,sweep.shape!,sweep.body!,t*sweep.length);sweep.result!.hasHit=true;sweep.best=t;
}
/** Earliest root in [0,1] of a*t²+b*t+c, or NaN. */
function root(a:number,b:number,c:number):number {
    if(a<1e-12)return NaN;const discriminant=b*b-4*a*c;if(discriminant<0)return NaN;
    const t=(-b-Math.sqrt(discriminant))/(2*a);return t>=0&&t<=1?t:NaN;
}

/** Continuous sphere against the game's boxes and rat spheres. Box faces,
 * rounded edges and corners are tested separately; an expanded AABB alone
 * would incorrectly damage rats beside a corner and miss grazing rebounds. */
export function sweepSphereBody(from:C.Vec3,to:C.Vec3,radius:number,body:C.Body):C.RaycastResult {
    const result=new C.RaycastResult();
    to.vsub(from,travel);const length=travel.length();
    sweep.from=from;sweep.to=to;sweep.radius=radius;sweep.length=length;sweep.best=Infinity;sweep.body=body;sweep.result=result;
    for(let shapeIndex=0;shapeIndex<body.shapes.length;shapeIndex++){
        const shape=body.shapes[shapeIndex];if(!shape.collisionResponse)continue;
        sweep.shape=shape;
        body.quaternion.mult(body.shapeOrientations[shapeIndex],rotation);
        body.quaternion.vmult(body.shapeOffsets[shapeIndex],center);center.vadd(body.position,center);
        rotation.conjugate(inverse);from.vsub(center,relative);inverse.vmult(relative,p0);inverse.vmult(travel,delta);
        p[0]=p0.x;p[1]=p0.y;p[2]=p0.z;v[0]=delta.x;v[1]=delta.y;v[2]=delta.z;
        if(shape instanceof C.Sphere){
            const r=radius+shape.radius,dist=p0.lengthSquared();
            if(dist<=r*r)offer(0,p[0],p[1],p[2]);
            else {const t=root(delta.lengthSquared(),2*p0.dot(delta),dist-r*r);if(t===t)offer(t,p[0]+v[0]*t,p[1]+v[1]*t,p[2]+v[2]*t);}
        }else if(shape instanceof C.Box){
            h[0]=shape.halfExtents.x;h[1]=shape.halfExtents.y;h[2]=shape.halfExtents.z;
            let square=0;
            for(let i=0;i<3;i++){n[i]=p[i]-Math.max(-h[i],Math.min(h[i],p[i]));square+=n[i]*n[i];}
            if(square<=radius*radius){
                if(square>1e-12)offer(0,n[0],n[1],n[2]);
                else {
                    // Deepest-penetration axis: the smallest remaining half extent, first on ties.
                    let axis=0;for(let i=1;i<3;i++)if(h[i]-Math.abs(p[i])<h[axis]-Math.abs(p[axis]))axis=i;
                    const sign=p[axis]<0?-1:1;offer(0,axis===0?sign:0,axis===1?sign:0,axis===2?sign:0);
                }
            }
            // Six planar faces.
            for(let axis=0;axis<3;axis++)for(const sign of SIGNS){
                if(Math.abs(v[axis])<1e-12)continue;
                const t=(sign*(h[axis]+radius)-p[axis])/v[axis];
                if(t<0||t>1)continue;
                let outside=false;for(let i=0;i<3;i++)if(i!==axis&&Math.abs(p[i]+v[i]*t)>h[i]+1e-8){outside=true;break;}
                if(outside)continue;
                offer(t,axis===0?sign:0,axis===1?sign:0,axis===2?sign:0);
            }
            // Twelve finite cylindrical edge regions.
            for(let free=0;free<3;free++){
                const a=(free+1)%3,b=(free+2)%3;
                for(const sa of SIGNS)for(const sb of SIGNS){
                    const pa=p[a]-sa*h[a],pb=p[b]-sb*h[b];
                    const t=root(v[a]*v[a]+v[b]*v[b],2*(pa*v[a]+pb*v[b]),pa*pa+pb*pb-radius*radius);
                    if(t!==t||Math.abs(p[free]+v[free]*t)>h[free]+1e-8||(p[a]+v[a]*t)*sa<h[a]-1e-8||(p[b]+v[b]*t)*sb<h[b]-1e-8)continue;
                    n[free]=0;n[a]=pa+v[a]*t;n[b]=pb+v[b]*t;offer(t,n[0],n[1],n[2]);
                }
            }
            // Eight spherical corner regions.
            for(const x of SIGNS)for(const y of SIGNS)for(const z of SIGNS){
                q[0]=p[0]-x*h[0];q[1]=p[1]-y*h[1];q[2]=p[2]-z*h[2];
                let dot=0,square=0;for(let i=0;i<3;i++){dot+=q[i]*v[i];square+=q[i]*q[i];}
                const t=root(delta.lengthSquared(),2*dot,square-radius*radius);
                if(t!==t||(p[0]+v[0]*t)*x<h[0]-1e-8||(p[1]+v[1]*t)*y<h[1]-1e-8||(p[2]+v[2]*t)*z<h[2]-1e-8)continue;
                offer(t,q[0]+v[0]*t,q[1]+v[1]*t,q[2]+v[2]*t);
            }
        }else if(shape instanceof C.Plane&&delta.z<0)offer((radius-p0.z)/delta.z,0,0,1);
    }
    sweep.body=sweep.shape=sweep.result=undefined;
    return result;
}
