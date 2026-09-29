/**
 * The frame of a city box. Rotation is Euler order YXZ: yaw `ry` about the
 * vertical axis first, then the pitch `rx` and roll `rz` of ramps and pipe
 * facets in the yawed frame. With `ry` 0 this equals the older XYZ order, so
 * every tilted box keeps its pose. Row-major basis: world = centre + R·local.
 */
export interface BoxPose {x:number;y:number;z:number;w:number;h:number;d:number;rx:number;ry?:number;rz:number}

/** Collision group of cell bars: they stop rats and bots, not cheese, sight or cases. */
export const CITY_BARS_GROUP=32;

export type Basis=[number,number,number,number,number,number,number,number,number];

export function boxBasis(b:Pick<BoxPose,'rx'|'ry'|'rz'>):Basis {
    const cx=Math.cos(b.rx),sx=Math.sin(b.rx),cy=Math.cos(b.ry??0),sy=Math.sin(b.ry??0),cz=Math.cos(b.rz),sz=Math.sin(b.rz);
    // Ry·Rx·Rz
    return [
        cy*cz+sy*sx*sz, -cy*sz+sy*sx*cz, sy*cx,
        cx*sz,          cx*cz,           -sx,
        -sy*cz+cy*sx*sz, sy*sz+cy*sx*cz, cy*cx,
    ];
}

/** Quaternion {x,y,z,w} of the box, for three.js and cannon-es alike. */
export function boxQuaternion(b:Pick<BoxPose,'rx'|'ry'|'rz'>):{x:number;y:number;z:number;w:number} {
    const c1=Math.cos(b.rx/2),s1=Math.sin(b.rx/2),c2=Math.cos((b.ry??0)/2),s2=Math.sin((b.ry??0)/2),c3=Math.cos(b.rz/2),s3=Math.sin(b.rz/2);
    return {x:s1*c2*c3+c1*s2*s3,y:c1*s2*c3-s1*c2*s3,z:c1*c2*s3-s1*s2*c3,w:c1*c2*c3+s1*s2*s3};
}

/** Half extents of the box's world-space bounds. */
export function boxHalfExtents(b:BoxPose):{hx:number;hy:number;hz:number} {
    if(!b.rx&&!b.rz&&!b.ry)return {hx:b.w/2,hy:b.h/2,hz:b.d/2};
    const m=boxBasis(b),w=b.w/2,h=b.h/2,d=b.d/2;
    return {
        hx:Math.abs(m[0])*w+Math.abs(m[1])*h+Math.abs(m[2])*d,
        hy:Math.abs(m[3])*w+Math.abs(m[4])*h+Math.abs(m[5])*d,
        hz:Math.abs(m[6])*w+Math.abs(m[7])*h+Math.abs(m[8])*d,
    };
}

export function toBoxLocal(b:BoxPose,x:number,y:number,z:number):{x:number;y:number;z:number} {
    const m=boxBasis(b),dx=x-b.x,dy=y-b.y,dz=z-b.z;
    return {x:m[0]*dx+m[3]*dy+m[6]*dz,y:m[1]*dx+m[4]*dy+m[7]*dz,z:m[2]*dx+m[5]*dy+m[8]*dz};
}

export function fromBoxLocal(b:BoxPose,lx:number,ly:number,lz:number):{x:number;y:number;z:number} {
    const m=boxBasis(b);
    return {x:b.x+m[0]*lx+m[1]*ly+m[2]*lz,y:b.y+m[3]*lx+m[4]*ly+m[5]*lz,z:b.z+m[6]*lx+m[7]*ly+m[8]*lz};
}
