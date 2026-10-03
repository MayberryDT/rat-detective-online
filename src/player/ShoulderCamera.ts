import * as THREE from 'three';
import type { CameraBlockers } from './CameraBlockers';

/** The gameplay camera: `radius` behind the pivot `pivotY` above the rat, `shoulder` to its right, `fov` degrees,
 * `phi` its starting polar angle. Exhibits replay through it too (Tyler, 2 October, protocol 31). */
export const SHOULDER={radius:6,pivotY:3.5,lookY:2.2,shoulder:1.25,fov:60,phi:Math.PI*.4} as const;
const UP=new THREE.Vector3(0,1,0);

/** The over-the-shoulder camera: placed straight from the view's angles (no lerp), its shoulder and boom pulled in
 * front of any blocker. */
export class ShoulderCamera {
    private readonly ray=new THREE.Raycaster();
    private readonly pivot=new THREE.Vector3();
    private readonly viewDirection=new THREE.Vector3();
    private readonly shoulder=new THREE.Vector3();
    private readonly shoulderDirection=new THREE.Vector3();
    private readonly offset=new THREE.Vector3();
    constructor(private readonly blockers:CameraBlockers) {}

    /** Place `camera` behind the rat at `rat` for the view `view` (theta: yaw, phi: polar angle). */
    place(camera:THREE.Camera,rat:THREE.Vector3,view:THREE.Spherical):void {
        const pivot=this.pivot.set(rat.x,rat.y+SHOULDER.pivotY,rat.z);
        const offset=this.offset.setFromSpherical(view);
        // Direct copy, no lerp: a lerp snaps back when whipping around fast (it cuts through 3D space, not spherical).
        camera.position.copy(pivot).add(offset);
        pivot.y=rat.y+SHOULDER.lookY;
        // Translate the view sideways without toeing it back into the rat's head.
        this.viewDirection.copy(pivot).sub(camera.position).normalize();
        this.shoulder.set(1,0,0).applyAxisAngle(UP,view.theta).multiplyScalar(SHOULDER.shoulder);
        // Resolve the shoulder first, then the boom: backing into a wall must
        // shorten distance without collapsing the view back onto the rat.
        this.ray.set(pivot,this.shoulderDirection.copy(this.shoulder).normalize());
        this.ray.far=SHOULDER.shoulder;
        const shoulderHit=this.blockers.first(this.ray);
        if(shoulderHit)this.shoulder.setLength(Math.max(0,shoulderHit.distance-.3));
        camera.position.add(this.shoulder);
        pivot.add(this.shoulder);
        offset.copy(camera.position).sub(pivot);
        this.ray.far=offset.length();
        this.ray.set(pivot,offset.normalize());
        const hit=this.blockers.first(this.ray);
        if(hit)camera.position.copy(pivot).addScaledVector(this.ray.ray.direction,Math.max(.3,hit.distance-.3));
        camera.lookAt(this.offset.copy(camera.position).add(this.viewDirection));
    }
}

/** Set `view` to the angles whose camera looks along `direction` (a unit look, as the camera's world direction):
 * the inverse of `place` before its blocker checks. */
export function viewAlong(view:THREE.Spherical,direction:{x:number;y:number;z:number}):THREE.Spherical {
    // The look runs from the boom's end down to the look point: R·s = -(k·d + h), h the pivot's rise over the look point.
    const h=SHOULDER.pivotY-SHOULDER.lookY,R=SHOULDER.radius,dh=direction.y*h;
    const k=-dh+Math.sqrt(Math.max(0,dh*dh-h*h+R*R));
    const x=-k*direction.x,y=-(k*direction.y+h),z=-k*direction.z;
    view.radius=R;view.theta=Math.atan2(x,z);
    view.phi=Math.max(.1,Math.min(Math.PI-.1,Math.acos(Math.max(-1,Math.min(1,y/R)))));
    return view;
}
