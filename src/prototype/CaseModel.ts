import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CASE_SIZE } from '../shared/chaosState';

/** A closed, overstuffed leather document case. All detail is unlit geometry;
 * the shared shell and handle dimensions retain the physical collision shape.
 */
export function addLeatherBriefcase(root:THREE.Group){
    const firstChild=root.children.length;
    const leather=new THREE.MeshStandardMaterial({color:0x633d29,roughness:.8,emissive:0x633d29,emissiveIntensity:.28});
    const panel=new THREE.MeshStandardMaterial({color:0x78513a,roughness:.87,emissive:0x78513a,emissiveIntensity:.25});
    const edge=new THREE.MeshStandardMaterial({color:0x3d271d,roughness:.86});
    const brass=new THREE.MeshStandardMaterial({color:0xb58d52,metalness:.65,roughness:.45});
    const paper=new THREE.MeshStandardMaterial({color:0xe5d6ae,roughness:.95});
    const file=new THREE.MeshStandardMaterial({color:0xaf9163,roughness:.95});
    const part=(name:string,w:number,h:number,d:number,mat:THREE.Material,x=0,y=0,z=0,rounded=false)=>{
        const geometry=rounded?new RoundedBoxGeometry(w,h,d,2,.022):new THREE.BoxGeometry(w,h,d);
        const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;mesh.position.set(x,y,z);root.add(mesh);return mesh;
    };
    // Back-face shells draw only the silhouette, never the hidden box edges.
    // Depth testing preserves the solid leather body and nearby character occlusion.
    for (const [expansion, opacity] of [[.025,1],[.055,.36],[.085,.14]]) {
        const material=new THREE.MeshBasicMaterial({color:0xff3024,side:THREE.BackSide,
            transparent:true,opacity,depthTest:true,depthWrite:false,
            blending:THREE.AdditiveBlending,toneMapped:false});
        const shell=new THREE.Mesh(new RoundedBoxGeometry(CASE_SIZE.x+expansion*2,
            CASE_SIZE.y+expansion*2,CASE_SIZE.z+expansion*2,3,.03),material);
        shell.name='case-silhouette-glow';shell.raycast=()=>{};root.add(shell);
    }
    // Two shut halves leave only the narrow document seam; neither lid is open.
    part('leather-case-shell',CASE_SIZE.x,CASE_SIZE.y,CASE_SIZE.z,leather,0,0,0,true);
    for(const z of [-.173,.173]){
        part('leather-inset-panel',.72,.5,.012,panel,0,-.015,z,true);
        for(const x of [-.28,.28])part('leather-strap',.045,.58,.016,edge,x,0,z);
        for(const y of [-.24,.23])part('stitched-edge',.68,.006,.016,file,0,y,z);
        for(const x of [-.34,.34])part('stitched-edge',.006,.47,.016,file,x,-.005,z);
    }
    part('closed-lid-seam',.76,.009,.014,edge,0,.29,0);
    for(const x of [-.28,.28]){
        part('brass-clasp',.075,.11,.025,brass,x,.23,.185,true);
        part('clasp-slot',.035,.012,.004,edge,x,.225,.2);
    }
    // Small irregular sheets squeezed through the closed top seam, away from the grip.
    for(const [index,x] of [-.32,-.23,.24,.33].entries()){
        const sheet=part('protruding-documents',.16,.11+index%2*.025,.012,paper,x,.306,index%2?.035:-.025);
        sheet.rotation.z=index%2?-.12:.09;
        part('document-lines',.11,.005,.013,file,x,.34,index%2?.035:-.025);
    }
    part('case-handle-grip',.3,.07,.08,edge,0,.43,0,true);
    for(const x of [-.12,.12]){
        part('case-handle-support',.055,.13,.08,leather,x,.36);
        part('handle-anchor',.075,.025,.1,brass,x,.306);
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
        merged.name=meshes.some(mesh=>mesh.name==='leather-case-shell')?'leather-case-shell':'case-detail-'+meshes[0].name;
        pieces.forEach(g=>g.dispose());meshes.forEach(mesh=>{mesh.removeFromParent();mesh.geometry.dispose();});root.add(merged);
    }
    // Keep the named grip reference after its vertices join the rigid batch.
    const grip=new THREE.Object3D();grip.name='case-handle-grip';grip.position.y=.43;root.add(grip);
}
