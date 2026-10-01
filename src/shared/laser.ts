import * as C from 'cannon-es';
import type {Vec3Data} from './networkProtocol';
import {WEAPON_TUNING as W} from './pickups';
import type {LaserBeam, LaserSurface} from './chaosState';

/** The nearest thing a laser leg reaches: `distance` along the leg, the point and surface normal, and what it is. */
export interface LaserCast {distance:number;point:Vec3Data;normal:Vec3Data;on:LaserSurface}
/** Walls and Ironclad coats reflect a beam; anything else stops it. */
export const laserReflects=(on:LaserSurface):boolean=>on==='world'||on==='armor';

/** Trace a laser from `origin` along `direction`. `cast` finds the nearest thing on one straight leg (`leg` counts
 * from 0); a reflecting surface turns the beam (at most `laserBounces` times), within `laserRange` units in all.
 * The shooter's prediction and the authority share it, each with its own `cast`. */
export function laserPath(origin:Vec3Data,direction:Vec3Data,cast:(from:C.Vec3,to:C.Vec3,leg:number)=>LaserCast|undefined):LaserBeam['points'] {
    const points:LaserBeam['points']=[{x:origin.x,y:origin.y,z:origin.z}];
    const from=new C.Vec3(origin.x,origin.y,origin.z),dir=new C.Vec3(direction.x,direction.y,direction.z),to=new C.Vec3();
    if(dir.normalize()===0)return points;
    let left:number=W.laserRange;
    for(let leg=0;leg<=W.laserBounces;leg++){
        from.addScaledVector(left,dir,to);
        const hit=cast(from,to,leg);
        if(!hit){points.push({x:to.x,y:to.y,z:to.z});break;}
        points.push({x:hit.point.x,y:hit.point.y,z:hit.point.z,on:hit.on});
        left-=Math.max(0,hit.distance);
        if(!laserReflects(hit.on)||leg===W.laserBounces||left<=.05)break;
        // Mirror about the surface, leaving just off it.
        const n=new C.Vec3(hit.normal.x,hit.normal.y,hit.normal.z);if(n.normalize()===0)break;
        const along=dir.dot(n);if(along>=0)break;
        dir.vsub(n.scale(2*along),dir);dir.normalize();
        from.set(hit.point.x+n.x*.03,hit.point.y+n.y*.03,hit.point.z+n.z*.03);
    }
    return points;
}
