import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Everything the alarm pillars share. They share one lifecycle, so one face
 * texture and one beacon material serve every pillar. */
interface PillarFrame {iron:THREE.BufferGeometry;brass:THREE.BufferGeometry;cage:THREE.BufferGeometry;trim:THREE.BufferGeometry}

export interface PillarKit {
    iron:THREE.MeshStandardMaterial;brass:THREE.MeshStandardMaterial;bell:THREE.MeshStandardMaterial;
    beacon:THREE.MeshStandardMaterial;reflector:THREE.MeshBasicMaterial;face:THREE.MeshBasicMaterial;
    glass:THREE.MeshStandardMaterial;ghost:THREE.MeshBasicMaterial;beam:THREE.MeshBasicMaterial;sweep:THREE.MeshBasicMaterial;
    faceCanvas:HTMLCanvasElement;faceTexture:THREE.CanvasTexture;
    geometry:Record<'bell'|'arm'|'head'|'ghosts'|'face'|'glass'|'remnant'|'beacon'|'reflector'|'beams'|'sweep',THREE.BufferGeometry>;
    /** Merged static post iron and brass, and the housing's iron cage and hood and their brass trim, by bell height (the sewer pillar is shorter). */
    frames:Map<number,PillarFrame>;
}

/** One pillar. `base` sits on the ground turned to the call box's `face`; `body`
 * (post, call box, housing) trembles and rocks; `housing` is the bell, cage, hood
 * and beacon, the part players shoot. `lamp` turns the beacon's reflector,
 * `rotor` its beams and `sweep` its red wash on the pavement. */
export interface PillarModel {
    base:THREE.Group;body:THREE.Group;housing:THREE.Group;
    bell:THREE.Mesh;hammer:THREE.Group;ghosts:THREE.Mesh;
    face:THREE.Mesh;glass:THREE.Mesh;remnant:THREE.Mesh;
    reflector:THREE.Mesh;lamp:THREE.Group;rotor:THREE.Group;sweep:THREE.Mesh;
}

/** Beams, washes and blur ghosts are light, not solid: aim and camera rays pass through them. */
const passThrough:THREE.Mesh['raycast']=()=>{};
/** Call box window centre and size, in the pillar's frame. */
export const FACE_WINDOW={y:2.2,z:.452,w:.7,h:.52};

function part(geometry:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1):THREE.BufferGeometry {
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(sx,sy,sz));
    return (geometry.index?geometry.toNonIndexed():geometry.clone()).applyMatrix4(matrix);
}
function merge(parts:THREE.BufferGeometry[]):THREE.BufferGeometry {
    const merged=mergeGeometries(parts)!;
    for(const piece of parts)piece.dispose();
    return merged;
}
/** A beam's alpha along its length (rows; dim at the lamp, brightest a little out, fading away) or a pair of
 * opposed wedges fading out from the centre, as texture data. */
function lightTexture(size:number,wedges:boolean):THREE.DataTexture {
    const data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        let a:number;
        if(wedges){
            const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),angle=Math.abs(Math.atan2(v,u));
            const off=Math.min(angle,Math.PI-angle),wedge=Math.max(0,1-off/.42)**1.5;
            a=r>1?0:(1-r)**1.2*(.18+.82*wedge)*Math.min(1,r/.08);
        }else{const along=1-y/(size-1);a=Math.min(1,along/.2)*(1-along)**1.4;}
        const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(a*255);
    }
    const texture=new THREE.DataTexture(data,size,size);texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
    return texture;
}

export function createPillarKit():PillarKit {
    const faceCanvas=document.createElement('canvas');faceCanvas.width=256;faceCanvas.height=192;
    const faceTexture=new THREE.CanvasTexture(faceCanvas);faceTexture.colorSpace=THREE.SRGBColorSpace;
    const beamMap=lightTexture(32,false),sweepMap=lightTexture(64,true);
    // Additive light and a flat pane look the same drawn once. Left two-pass, three draws a transparent double-sided
    // material back then front and flips its side with needsUpdate for each: two draws and two program lookups.
    const light=(map:THREE.Texture,opacity:number)=>new THREE.MeshBasicMaterial({color:0xff2a14,map,transparent:true,opacity,blending:THREE.AdditiveBlending,
        depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false});
    const beam=light(beamMap,.32),sweep=light(sweepMap,.8);
    beam.addEventListener('dispose',()=>beamMap.dispose());sweep.addEventListener('dispose',()=>sweepMap.dispose());
    const face=new THREE.MeshBasicMaterial({map:faceTexture});
    // Hammer arm and ball head, at rest against the rim and swung back: its blurred ghosts.
    const arm=new THREE.CylinderGeometry(.035,.035,.62,8).translate(0,.31,0),head=new THREE.SphereGeometry(.12,12,8).translate(0,.62,0);
    const ghosts=merge([part(arm,0,0,0),part(head,0,0,0),part(arm,0,0,0,.42),part(head,0,0,0,.42)]);
    // A dome gong hung by its crown (the origin) with a rolled lip.
    const bell=merge([part(new THREE.SphereGeometry(1,28,12,0,Math.PI*2,0,Math.PI/2),0,-.72,0,0,0,0,1,.72,1),
        part(new THREE.TorusGeometry(1,.07,8,28),0,-.72,0,Math.PI/2)]);
    // Two opposed beams tipped 40° down, so they sweep the pavement around the pillar.
    const beams=merge([-1,1].map(side=>part(new THREE.ConeGeometry(1.1,10,16,1,true).translate(0,-5,0),0,0,0,0,0,side*(Math.PI/2-.7))));
    // Jagged glass left in the frame corners once the window is shot out.
    const {w,h}=FACE_WINDOW,remnant=new THREE.BufferGeometry();
    remnant.setAttribute('position',new THREE.Float32BufferAttribute([
        -w/2,h/2,0,-w/2,h/2-.2,0,-w/2+.13,h/2,0, w/2,h/2,0,w/2-.2,h/2,0,w/2,h/2-.09,0,
        -w/2,-h/2,0,-w/2+.24,-h/2,0,-w/2,-h/2+.11,0, w/2,-h/2,0,w/2,-h/2+.17,0,w/2-.08,-h/2,0],3));
    remnant.computeVertexNormals();
    return {
        iron:new THREE.MeshStandardMaterial({color:0x2a2c33,roughness:.4,metalness:.55,emissive:0x1a1d26}),
        brass:new THREE.MeshStandardMaterial({color:0x9b7a3a,roughness:.35,metalness:.8,emissive:0x2a1c08,emissiveIntensity:.6}),
        bell:new THREE.MeshStandardMaterial({color:0xc3160f,roughness:.3,metalness:.45,emissive:0xd01508,emissiveIntensity:.55,side:THREE.DoubleSide}),
        beacon:new THREE.MeshStandardMaterial({color:0x6d0d08,roughness:.2,emissive:0xff1406,emissiveIntensity:.05}),
        reflector:new THREE.MeshBasicMaterial({color:0xffc2a0,toneMapped:false,side:THREE.DoubleSide}),
        face,glass:new THREE.MeshStandardMaterial({color:0xbfd6e0,transparent:true,opacity:.3,roughness:.05,metalness:.1,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true}),
        ghost:new THREE.MeshBasicMaterial({color:0x9a8663,transparent:true,opacity:.3,depthWrite:false}),
        beam,sweep,faceCanvas,faceTexture,
        geometry:{bell,arm,head,ghosts,face:new THREE.PlaneGeometry(w,h),glass:new THREE.PlaneGeometry(w,h),remnant,
            beacon:new THREE.SphereGeometry(.2,16,8,0,Math.PI*2,0,Math.PI/2).scale(1,1.1,1),reflector:new THREE.PlaneGeometry(.22,.16),
            beams,sweep:new THREE.PlaneGeometry(16,16)},
        frames:new Map(),
    };
}

/** Fluted cast-iron post on a plinth with collar rings, the call box at head
 * height, and the cage and hood around the bell. `bell` is the bell's height. */
function frame(kit:PillarKit,bell:number):PillarFrame {
    let cached=kit.frames.get(bell);
    if(cached)return cached;
    const box=new THREE.BoxGeometry(1,1,1),round=new THREE.CylinderGeometry(.5,.5,1,16),collar=new THREE.TorusGeometry(.24,.05,8,20);
    const shaft=bell-2.24,shaftY=(.94+bell-1.3)/2;
    const iron=[
        // Round plinth and step, so the pillar fits its square collision box at any heading.
        part(round,0,.14,0,0,0,0,1.08,.28,1.08),part(round,0,.36,0,0,0,0,.84,.16,.84),
        part(new THREE.CylinderGeometry(.27,.4,.5,16),0,.69,0),part(round,0,shaftY,0,0,0,0,.4,shaft,.4),
        ...[0,1,2,3,4,5,6,7].map(k=>part(box,Math.sin(k*Math.PI/4+Math.PI/8)*.205,shaftY,Math.cos(k*Math.PI/4+Math.PI/8)*.205,0,k*Math.PI/4+Math.PI/8,0,.06,shaft,.06)),
        ...[.96,1.5,2.82,bell-1.4].map(y=>part(collar,0,y,0,Math.PI/2)),
        // The call box, its cap and ledge.
        part(box,0,2.12,.2,0,0,0,.86,1.1,.5),part(box,0,2.71,.19,0,0,0,.94,.08,.56),part(box,0,2.79,.19,0,0,0,.76,.08,.46),part(box,0,1.55,.2,0,0,0,.9,.06,.54),
        part(new THREE.CylinderGeometry(.36,.22,.3,16),0,bell-1.15,0),
    ];
    // The bell's stem, four arms, the hammer bracket and the cage rods up to the hood.
    const cage=[part(round,0,bell-.4,0,0,0,0,.16,1.2,.16),
        ...[1,3,5,7].flatMap(k=>{const a=k*Math.PI/4;return [part(box,Math.sin(a)*.7,bell-1.02,Math.cos(a)*.7,0,a,0,.07,.07,1),part(round,Math.sin(a)*1.2,bell-.215,Math.cos(a)*1.2,0,0,0,.07,1.67,.07)];}),
        part(box,0,bell-1.02,.6,0,0,0,.07,.07,1.1),
        part(new THREE.CylinderGeometry(1.3,1.3,.08,24),0,bell+.64,0),part(new THREE.ConeGeometry(1.28,.4,24),0,bell+.88,0),
        part(new THREE.CylinderGeometry(.16,.2,.08,12),0,bell+1.08,0)];
    const {y,z,w,h}=FACE_WINDOW;
    const brass=[part(box,0,y+h/2+.025,z+.008,0,0,0,w+.08,.05,.04),part(box,0,y-h/2-.025,z+.008,0,0,0,w+.08,.05,.04),
        part(box,-w/2-.025,y,z+.008,0,0,0,.05,h+.1,.04),part(box,w/2+.025,y,z+.008,0,0,0,.05,h+.1,.04),
        part(box,0,1.8,z+.004,0,0,0,.44,.12,.02),part(box,.3,1.8,z+.03,0,0,0,.06,.2,.06),
        ...[.96,bell-1.4].map(y=>part(collar,0,y,0,Math.PI/2,0,0,1.03,1.03,.8))];
    // Brass trim around the hood's brim and the beacon's collar, so the housing's outline reads in the dark.
    const trim=[part(new THREE.TorusGeometry(1.3,.045,6,40),0,bell+.64,0,Math.PI/2),part(new THREE.TorusGeometry(.2,.035,6,16),0,bell+1.12,0,Math.PI/2)];
    cached={iron:merge(iron),brass:merge(brass),cage:merge(cage),trim:merge(trim)};
    for(const geometry of [box,round,collar])geometry.dispose();
    kit.frames.set(bell,cached);
    return cached;
}

export function buildPillar(kit:PillarKit,bell:number,face:number):PillarModel {
    const g=kit.geometry,mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);return m;};
    const base=new THREE.Group();base.rotation.y=face;
    const body=new THREE.Group(),housing=new THREE.Group();body.name='dispatch-post';housing.name='dispatch-bell-housing';
    const {iron,brass,cage,trim}=frame(kit,bell);
    body.add(mesh(iron,kit.iron),mesh(brass,kit.brass));
    const {y,z}=FACE_WINDOW;
    const faceMesh=mesh(g.face,kit.face,0,y,z);faceMesh.name='dispatch-face';
    const glass=mesh(g.glass,kit.glass,0,y,z+.012),remnant=mesh(g.remnant,kit.glass,0,y,z+.012);remnant.visible=false;
    body.add(faceMesh,glass,remnant,housing);
    // The housing's own frame is part of the merged iron; here are its moving and lit parts.
    const bellMesh=mesh(g.bell,kit.bell,0,bell+.27,0);bellMesh.name='dispatch-bell';
    const hammer=new THREE.Group();hammer.position.set(0,bell-1.02,1.12);hammer.rotation.x=.25;
    hammer.add(mesh(g.arm,kit.iron),mesh(g.head,kit.brass));
    const ghosts=mesh(g.ghosts,kit.ghost,0,bell-1.02,1.12);ghosts.visible=false;ghosts.raycast=passThrough;ghosts.name='dispatch-hammer-blur';
    // The beacon tops out 1.34 above the bell, under the sewer's ceiling (6 above its floor, bell at 4.6).
    const beacon=mesh(g.beacon,kit.beacon,0,bell+1.12,0);
    const lamp=new THREE.Group();lamp.position.y=bell+1.21;
    const reflector=mesh(g.reflector,kit.reflector);reflector.rotation.y=Math.PI/2;lamp.add(reflector);
    housing.add(mesh(cage,kit.iron),mesh(trim,kit.brass),bellMesh,hammer,ghosts,beacon,lamp);
    // Beams turn with the reflector but stay steady while the post trembles.
    const rotor=new THREE.Group();rotor.position.y=bell+1.21;rotor.name='dispatch-beacon-beams';
    const beams=mesh(g.beams,kit.beam);beams.raycast=passThrough;rotor.add(beams);
    const sweep=mesh(g.sweep,kit.sweep,0,.05,0);sweep.rotation.x=-Math.PI/2;sweep.raycast=passThrough;sweep.renderOrder=1;
    base.add(body,rotor,sweep);
    return {base,body,housing,bell:bellMesh,hammer,ghosts,face:faceMesh,glass,remnant,reflector,lamp,rotor,sweep};
}

export function disposePillarKit(kit:PillarKit):void {
    for(const geometry of Object.values(kit.geometry))geometry.dispose();
    for(const frame of kit.frames.values())for(const geometry of Object.values(frame))geometry.dispose();
    kit.frames.clear();kit.faceTexture.dispose();
    for(const material of [kit.iron,kit.brass,kit.bell,kit.beacon,kit.reflector,kit.face,kit.glass,kit.ghost,kit.beam,kit.sweep])material.dispose();
}
