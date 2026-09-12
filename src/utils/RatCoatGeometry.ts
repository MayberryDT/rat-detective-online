import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Keep the rat's accepted body volume; tailoring sits just above this surface. */
export const COAT_PROFILE = [[0,0],[.485,0],[.505,.025],[.503,.07],
    [.477,.65],[.434,1.15],[.403,1.285],[.35,1.34],[0,1.34]];

function radiusAt(y: number): number {
    for (let i=3;i<COAT_PROFILE.length-1;i++) {
        const [r0,y0]=COAT_PROFILE[i-1], [r1,y1]=COAT_PROFILE[i];
        if(y<=y1)return THREE.MathUtils.lerp(r0,r1,(y-y0)/(y1-y0));
    }
    return .35;
}
const frontZ=(x:number,y:number)=>Math.sqrt(Math.max(0,radiusAt(y)**2-x*x));

export function addCoatTailoring(body:THREE.Group, coat:THREE.Material, highlight:THREE.Material,
    shirt:THREE.Material, fasteners:THREE.Material):void {
    const add=(name:string,geometry:THREE.BufferGeometry,mat:THREE.Material)=>{
        const part=new THREE.Mesh(geometry,mat);part.name=name;part.castShadow=true;
        part.userData.noOutline=true;body.add(part);return part;
    };
    const panel=(name:string,points:number[][],mat:THREE.Material,offset:number,bevel=.005)=>{
        const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)));
        const geometry=new THREE.ExtrudeGeometry(shape,{depth:.009,bevelEnabled:true,
            bevelSize:bevel,bevelThickness:.004,bevelSegments:1,steps:1,curveSegments:2});
        const positions=geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++){
            const x=positions.getX(i),y=positions.getY(i);
            positions.setZ(i,positions.getZ(i)+.445-Math.abs(x)*.30-(y-1.35)*.18+offset);
        }
        geometry.computeVertexNormals();return add(name,geometry,mat);
    };
    // Small recessed shirt; the lapels carry the main color instead of a second white collar.
    panel('rat-shirt-insert',[[-.11,1.397],[.11,1.397],[.068,1.25],[0,1.205],[-.068,1.25]],shirt,-.014);
    panel('rat-tie',[[0,1.327],[.026,1.288],[.034,1.223],[0,1.185],[-.034,1.223],[-.026,1.288]],fasteners,.006,.003);
    panel('rat-tie-knot',[[-.026,1.344],[.026,1.344],[.022,1.31],[0,1.298],[-.022,1.31]],fasteners,.015,.004);
    for(const side of [-1,1]){
        panel(side<0?'rat-lapel-left':'rat-lapel-right',[
            [.068,1.36],[.211,1.457],[.287,1.397],[.256,1.367],
            [.274,1.343],[.185,1.218],
        ].map(([x,y])=>[side*x,y]),highlight,.003,.006);
    }
    // Pressed overlapping fabric edges, with broad enough faces to avoid thin-line shimmer.
    const folds:THREE.BufferGeometry[]=[];
    function strip(points:THREE.Vector3[],width:number,height:number){
        const positions:number[]=[],indices:number[]=[];
        for(const p of points){
            const back=p.z<0?-1:1;
            positions.push(p.x-width/2,p.y,p.z, p.x,p.y,p.z+back*height,
                p.x+width/2,p.y,p.z);
        }
        for(let i=0;i<points.length-1;i++)for(let j=0;j<2;j++){
            const a=i*3+j,b=a+3;indices.push(a,b,a+1,a+1,b,b+1);
        }
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
        // Front faces need +Z normals; back faces need -Z normals.
        if(points[0].z>0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
        geometry.setIndex(indices);geometry.computeVertexNormals();folds.push(geometry);
    }
    strip(Array.from({length:12},(_,i)=>{
        const y=.065+i*.098;return new THREE.Vector3(.014,y,frontZ(.014,y)+.002);
    }),.022,.008);
    strip(Array.from({length:12},(_,i)=>{
        const y=.275+i*.092;return new THREE.Vector3(0,y,-radiusAt(y)-.002);
    }),.018,.006);
    strip([new THREE.Vector3(.021,.058,-.505),new THREE.Vector3(.021,.28,-radiusAt(.28)-.003)],.032,.008);
    // A restrained hem roll is integrated in a single coat-detail draw.
    const hem=new THREE.LatheGeometry([new THREE.Vector2(.497,.023),new THREE.Vector2(.507,.033),
        new THREE.Vector2(.507,.044),new THREE.Vector2(.502,.055)],32);
    folds.push(hem);
    // Welt pockets have a shaped upper lip and dark recess, not dangling flaps.
    const pocketRecesses:THREE.BufferGeometry[]=[];
    for(const side of [-1,1]){
        const shape=new THREE.Shape();shape.moveTo(-.094,-.014);shape.lineTo(.094,-.014);
        shape.lineTo(.094,.014);shape.lineTo(-.094,.014);shape.closePath();
        const lip=new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,
            bevelSize:.005,bevelThickness:.003,bevelSegments:1,steps:1});
        const x=side*.302,y=.50;
        lip.rotateZ(side*.47);lip.rotateY(side*.63);lip.translate(x,y,frontZ(x,y)+.009);folds.push(lip);
        const recess=new THREE.PlaneGeometry(.156,.010);recess.rotateZ(side*.47);recess.rotateY(side*.63);
        recess.translate(x,y-.010,frontZ(x,y)+.025);pocketRecesses.push(recess);
    }
    const merge=(name:string,pieces:THREE.BufferGeometry[],mat:THREE.Material)=>{
        // Normalize indexed and non-indexed geometry once during construction.
        const normalized=pieces.map(g=>g.index?g.toNonIndexed():g.clone());
        const merged=mergeGeometries(normalized)!;
        add(name,merged,mat);pieces.forEach(g=>g.dispose());normalized.forEach(g=>g.dispose());
    };
    merge('rat-coat-tailoring',folds,coat);
    merge('rat-pocket-openings',pocketRecesses,fasteners);
    // Three shallow rounded buttons; their central depression catches light as a broad shape.
    for(const [index,y] of [1.035,.80,.565].entries()){
        const geometry=new THREE.LatheGeometry([[0,-.008],[.033,-.008],[.043,-.002],
            [.043,.003],[.034,.013],[.024,.014],[0,.008]].map(([r,h])=>new THREE.Vector2(r,h)),16);
        const button=add(`rat-button-${index+1}`,geometry,fasteners);
        button.rotation.x=Math.PI/2;button.position.set(.072,y,frontZ(.072,y)+.016);
    }
}
