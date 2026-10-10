import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CASE_SIZE } from '../shared/chaosState';
import { freezeStatic } from '../utils/freezeStatic';
import { CASE_RED } from './caseRed';

/** The evidence tag's pivot on the handle; `CaseMotion` swings it. */
export const CASE_TAG = 'case-tag';

/** The case's own materials (fresh per case), for looks that recolour one case: the carried hot case (`HotCaseLook`). */
export interface CaseMaterials {
    leather:THREE.MeshStandardMaterial;panel:THREE.MeshStandardMaterial;edge:THREE.MeshStandardMaterial;brass:THREE.MeshStandardMaterial;
    paper:THREE.MeshStandardMaterial;ink:THREE.MeshStandardMaterial;red:THREE.MeshStandardMaterial;
    /** The red back-face silhouette shells, innermost first. */
    shells:THREE.MeshBasicMaterial[];
}

/** An overstuffed attorney's briefcase, brought up to the rats' detail (1 October): soft rounded leather, a brass top
 * frame, corner caps, two sprung latches and a keyed lock plate, buckled straps, a curved stitched handle on brass loops,
 * papers bursting from the seam and a red EVIDENCE tag on a string. The shell keeps the physical collision size; every
 * fixed part merges per material, and only the tag moves. */
export function addLeatherBriefcase(root:THREE.Group):CaseMaterials {
    const firstChild=root.children.length;
    const {x:W,y:H,z:D}=CASE_SIZE;
    const leather=new THREE.MeshStandardMaterial({color:0x633d29,roughness:.72,emissive:0x633d29,emissiveIntensity:.28});
    const panel=new THREE.MeshStandardMaterial({color:0x7a5038,roughness:.8,emissive:0x7a5038,emissiveIntensity:.24});
    const edge=new THREE.MeshStandardMaterial({color:0x3a241a,roughness:.78});
    const brass=new THREE.MeshStandardMaterial({color:0xc39a55,metalness:.75,roughness:.32,emissive:0x5a4318,emissiveIntensity:.25});
    const paper=new THREE.MeshStandardMaterial({color:0xeee2bd,roughness:.95,emissive:0x6b6450,emissiveIntensity:.18});
    const ink=new THREE.MeshStandardMaterial({color:0x8d7350,roughness:.95});
    const red=new THREE.MeshStandardMaterial({color:0xb5231b,roughness:.7,emissive:0x5a0d08,emissiveIntensity:.35});
    const part=(name:string,geometry:THREE.BufferGeometry,mat:THREE.Material,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{
        const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,rz);root.add(mesh);return mesh;
    };
    const box=(w:number,h:number,d:number,radius=0)=>radius?new RoundedBoxGeometry(w,h,d,3,radius):new THREE.BoxGeometry(w,h,d);
    // Back-face shells draw only the silhouette, never the hidden box edges, in the hot-case red.
    // Depth testing preserves the solid leather body and nearby character occlusion.
    const shells:THREE.MeshBasicMaterial[]=[];
    for (const [expansion, opacity] of [[.025,1],[.055,.36],[.085,.14]]) {
        const material=new THREE.MeshBasicMaterial({color:CASE_RED,side:THREE.BackSide,
            transparent:true,opacity,depthTest:true,depthWrite:false,
            blending:THREE.AdditiveBlending,toneMapped:false});
        const shell=new THREE.Mesh(new RoundedBoxGeometry(W+expansion*2,H+expansion*2,D+expansion*2,3,.03),material);
        shell.name='case-silhouette-glow';shell.raycast=()=>{};root.add(shell);shells.push(material);
    }
    // The body: soft rounded leather bulging a little at the middle, a darker gusset band and a brass top frame.
    part('leather-case-shell',box(W,H*.92,D,.07),leather,0,-H*.04,0);
    part('leather-case-shell',box(W*.96,H*.7,D*1.05,.08),leather,0,-H*.06,0);
    part('case-gusset',box(W*1.005,.035,D*1.01,.012),edge,0,-H*.36,0);
    // The brass frame is a rim round the lid's edge; the lid itself stays leather.
    for(const z of [-1,1])part('case-frame',box(W*1.02,.04,.03,.012),brass,0,H*.43,z*(D/2+.002));
    for(const x of [-1,1])part('case-frame',box(.03,.04,D*1.02,.012),brass,x*(W/2+.002),H*.43,0);
    part('closed-lid-seam',box(W*.92,.012,D*.2),edge,0,H*.47,0);
    for(const side of [-1,1]){
        const z=side*(D/2+.004);
        part('leather-inset-panel',box(W*.84,H*.62,.014,.03),panel,0,-H*.04,z);
        // Stitching just inside the panel's edge, as a broken line of tiny tacks.
        for(let i=0;i<14;i++){const x=-W*.4+i*W*.8/13;part('stitched-edge',box(.028,.006,.006),ink,x,H*.28,z+side*.008);part('stitched-edge',box(.028,.006,.006),ink,x,-H*.36,z+side*.008);}
        for(let i=0;i<8;i++){const y=-H*.33+i*H*.58/7;part('stitched-edge',box(.006,.026,.006),ink,-W*.42,y,z+side*.008);part('stitched-edge',box(.006,.026,.006),ink,W*.42,y,z+side*.008);}
        // Two straps over the lid with buckles on the face.
        for(const x of [-W*.33,W*.33]){
            part('leather-strap',box(.05,H*.7,.012,.006),edge,x,H*.08,z+side*.006);
            part('brass-buckle',box(.075,.05,.012,.008),brass,x,-H*.06,z+side*.013);
            part('buckle-hole',box(.045,.022,.006),edge,x,-H*.06,z+side*.018);
        }
    }
    // Brass caps on all eight corners and four studs underneath.
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])part('brass-corner',box(.075,.07,.075,.02),brass,x*(W/2-.025),y*(H*.42),z*(D/2-.02));
    for(const x of [-1,1])for(const z of [-1,1])part('brass-stud',new THREE.CylinderGeometry(.022,.026,.025,10),brass,x*W*.36,-H/2+.005,z*D*.32);
    // Front latches: plate, sprung tongue and knob; a keyed lock plate between them.
    const front=D/2+.016;
    for(const x of [-W*.24,W*.24]){
        part('brass-clasp',box(.085,.06,.014,.008),brass,x,H*.36,front);
        part('brass-clasp',box(.05,.08,.012,.006),brass,x,H*.27,front+.004);
        part('brass-clasp',new THREE.CylinderGeometry(.016,.016,.02,10),brass,x,H*.3,front+.014,Math.PI/2);
    }
    part('brass-lock',box(.1,.075,.014,.012),brass,0,H*.34,front);
    part('lock-keyhole',box(.012,.03,.006),edge,0,H*.33,front+.009);
    // Papers bursting from the seam, away from the grip.
    for(const [index,x] of [-.33,-.25,-.18,.2,.27,.34].entries()){
        const sheet=part('protruding-documents',box(.15,.11+index%3*.02,.008),paper,x,H*.5+.02,index%2?.04:-.03);
        sheet.rotation.z=(index%2?-1:1)*(.06+index%3*.05);
        part('document-lines',box(.1,.005,.009),ink,x,H*.5+.05,index%2?.04:-.03,0,0,sheet.rotation.z);
    }
    // A curved, stitched leather handle on brass loops.
    part('case-handle-arc',new THREE.TorusGeometry(.12,.028,10,20,Math.PI),edge,0,H*.47+.035,0);
    for(const x of [-.12,.12]){
        part('handle-anchor',new THREE.TorusGeometry(.03,.009,6,12),brass,x,H*.47+.03,0,0,Math.PI/2);
        part('handle-anchor',box(.06,.018,.08,.006),brass,x,H*.46,0);
    }
    // Eight tumbling cases used to draw every stitch, clasp and sheet separately.
    // They are rigid: merge equal-material details once, preserving every vertex
    // and the separate glow shells, without skinning or per-frame batch work.
    const groups=new Map<THREE.Material,THREE.Mesh[]>();
    for(const object of root.children.slice(firstChild)){
        const mesh=object as THREE.Mesh,material=mesh.material as THREE.Material;
        if(!groups.has(material))groups.set(material,[]);groups.get(material)!.push(mesh);
    }
    for(const [material,meshes] of groups){
        if(meshes.length<2)continue;
        const pieces=meshes.map(mesh=>{mesh.updateMatrix();return (mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(mesh.matrix);});
        const merged=new THREE.Mesh(mergeGeometries(pieces)!,material);
        merged.name=meshes.some(mesh=>mesh.name==='leather-case-shell')?'leather-case-shell':'case-detail-'+meshes[0]!.name;
        pieces.forEach(g=>g.dispose());meshes.forEach(mesh=>{mesh.removeFromParent();mesh.geometry.dispose();});root.add(merged);
    }
    // Keep the named grip reference after its vertices join the rigid batch.
    const grip=new THREE.Object3D();grip.name='case-handle-grip';grip.position.y=.43;root.add(grip);
    // The EVIDENCE tag hangs on a string from the handle's loop and is the one part that moves.
    const tag=new THREE.Group();tag.name=CASE_TAG;tag.position.set(.12,H*.47+.03,D/2+.03);
    const string=new THREE.Mesh(new THREE.CylinderGeometry(.003,.003,.12,4),ink);string.position.y=-.06;tag.add(string);
    const card=new THREE.Mesh(new RoundedBoxGeometry(.11,.065,.004,2,.006),paper);card.position.set(0,-.15,0);card.rotation.z=.15;tag.add(card);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(.11,.02,.005),red);stripe.position.set(0,-.145,0);stripe.rotation.z=.15;tag.add(stripe);
    root.add(tag);
    // The case moves as one: its parts never move within it, except the tag's pivot, which `CaseMotion` swings.
    for(const child of root.children)freezeStatic(child,[tag]);
    return {leather,panel,edge,brass,paper,ink,red,shells};
}
