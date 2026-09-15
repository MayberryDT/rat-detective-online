import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRatMesh } from '../../../src/utils/RatModel';
import { disposeMeshResources } from '../../../src/utils/disposeMeshResources';

export type CameoKind = 'spider' | 'bat';
type Point = [number, number, number];
const v = (p: Point) => new THREE.Vector3(...p);
const cloth = (color: number, roughness = .8) => new THREE.MeshStandardMaterial({color, roughness});

function part(parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry,
    material: THREE.Material, position: Point = [0, 0, 0]) {
    const result = new THREE.Mesh(geometry, material);
    result.name = name; result.position.set(...position); result.castShadow = true; result.receiveShadow = true;
    parent.add(result); return result;
}
function oval(parent: THREE.Object3D, name: string, material: THREE.Material, position: Point, scale: Point) {
    const result = part(parent, name, new THREE.SphereGeometry(1, 20, 12), material, position);
    result.scale.set(...scale); return result;
}
function rod(parent: THREE.Object3D, name: string, material: THREE.Material, a: Point, b: Point, r: number, end = r) {
    const delta = v(b).sub(v(a));
    const result = part(parent, name, new THREE.CylinderGeometry(end, r, delta.length(), 12), material);
    result.position.copy(v(a).add(v(b)).multiplyScalar(.5));
    result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return result;
}
function curve(parent: THREE.Object3D, name: string, material: THREE.Material, points: Point[], radius: number) {
    return part(parent, name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v)), 32, radius, 6, false), material);
}
function plaque(parent: THREE.Object3D, name: string, material: THREE.Material, points: number[][], position: Point, depth = .012) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    return part(parent, name, new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: false}), material, position);
}

/** Add a joint without changing any mesh's authored world-space rest pose. */
function joint(parent: THREE.Object3D, name: string, position: Point, children: THREE.Object3D[]) {
    const group=new THREE.Group();group.name=name;group.position.set(...position);parent.add(group);
    parent.updateWorldMatrix(true,true);
    for(const child of children)group.attach(child);
    return group;
}

/** Costumed art subjects only. No RatEntity, physics, combat, network or live-model changes. */
export function createCameoRat(kind: CameoKind): THREE.Group {
    const root = new THREE.Group(); root.name = `${kind}-rat`;
    const red = cloth(0xb91835), blue = cloth(0x164b91), black = cloth(0x131a27), gray = cloth(0x59616e);
    const skin = cloth(0xc68b88), fur = cloth(0x9b8978), gold = cloth(0xcda544, .48);
    const white = cloth(0xfff6e1, .42), ink = cloth(0x141523);
    const spider = kind === 'spider', suit = spider ? red : gray;
    // Reuse the actual game's joined cheek/muzzle geometry, independently owned.
    const reference = createRatMesh();
    const referenceHead = reference.getObjectByName('rat-head')!;
    const muzzleGeometry = (referenceHead.children[0] as THREE.Mesh).geometry.clone();
    disposeMeshResources(reference);
    const torso = new THREE.Group(); torso.name = 'cameo-torso'; root.add(torso);
    torso.position.set(0, spider ? .91 : 1.04, spider ? .06 : 0);
    torso.rotation.x = spider ? .18 : 0;
    oval(torso, 'suit-body', suit, [0, 0, 0], [.43, .52, .32]);
    if (spider) {
        for (const side of [-1, 1]) oval(torso, 'blue-side-panel', blue, [side * .35, -.06, -.005], [.11, .34, .25]);
        oval(torso, 'blue-hips', blue, [0, -.34, -.015], [.35, .20, .27]);
    } else {
        oval(torso, 'trunks', black, [0, -.34, 0], [.36, .20, .28]);
        const belt = part(torso, 'utility-belt', new THREE.CylinderGeometry(.40, .405, .13, 24), gold, [0, -.20, 0]);
        belt.scale.z = .79;
        for (let i = -2; i <= 2; i++) {
            const angle = i * .53;
            const pouch = part(torso, 'belt-pouch', new THREE.BoxGeometry(.11, .16, .075), gold,
                [Math.sin(angle) * .405, -.20, Math.cos(angle) * .32]);
            pouch.rotation.y = angle;
        }
        part(torso, 'belt-buckle', new THREE.BoxGeometry(.13, .095, .035), black, [0, -.20, .38]);
        const bat = [[-.32,.11],[-.23,.08],[-.16,.05],[-.09,.11],[-.04,.07],[-.025,.14],[0,.10],[.025,.14],[.04,.07],[.09,.11],[.16,.05],[.23,.08],[.32,.11],[.26,-.01],[.19,.005],[.13,-.075],[.065,-.045],[0,-.15],[-.065,-.045],[-.13,-.075],[-.19,.005],[-.26,-.01]];
        oval(torso, 'emblem-backing', gold, [0, .15, .295], [.34, .18, .035]);
        plaque(torso, 'bat-emblem', black, bat, [0, .15, .331]);
    }
    if (spider) {
        oval(torso, 'spider-abdomen', ink, [0, .11, .321], [.052, .085, .022]);
        oval(torso, 'spider-head', ink, [0, .205, .302], [.039, .043, .026]);
        for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
            const y = .22 - i * .058, endY = [.35, .27, -.02, -.12][i];
            curve(torso, 'spider-emblem-leg', ink, [[side*.027,y,.325],[side*.13,y+.035,.303],[side*.20,endY,.273]], .012);
        }
        // Visible web lattice follows the suit surface; geometry exports with the model.
        for (const y of [-.12, .02, .30, .40]) {
            const points: Point[] = [];
            for (let i = 0; i <= 16; i++) {
                const x = -.27 + i * .54 / 16;
                points.push([x, y, .32 * Math.sqrt(Math.max(.015, 1-x*x/(.43*.43)-y*y/(.52*.52)))+.006]);
            }
            curve(torso, 'chest-web', ink, points, .005);
        }
    }
    // Bent, supported legs for the rooftop crouch; planted boots for the sewer sentinel.
    for (const side of [-1, 1]) {
        const hip: Point = [side*.22, spider?.68:.79, -.015];
        const knee: Point = spider ? [side*.56,.47,.20] : [side*.25,.45,.015];
        const ankle: Point = spider ? [side*.48,.12,-.01] : [side*.28,.13,.015];
        rod(root, 'thigh', spider?blue:gray, hip, knee, .18, .17);
        oval(root, 'knee', spider?blue:gray, knee, [.17,.17,.17]);
        rod(root, 'boot-shaft', spider?red:black, knee, ankle, .15, .115);
        oval(root, 'boot', spider?red:black, [ankle[0],.095,.14], [.16,.095,.27]);
        const shoulder: Point = [side*.36,spider?1.18:1.36,.045];
        const elbow: Point = spider ? [side*.48,.72,.30] : [side*.49,.98,.025];
        const wrist: Point = spider ? [side*.34,.22,.49] : [side*.49,.67,.07];
        const armStart=root.children.length;
        oval(root, 'shoulder', suit, shoulder, [.18,.19,.18]);
        rod(root, 'upper-arm', spider?blue:gray, shoulder, elbow, .13, .115);
        oval(root, 'elbow', spider?red:black, elbow, [.115,.12,.115]);
        rod(root, 'gauntlet', spider?red:black, elbow, wrist, .12, .08);
        const handStart=root.children.length;
        oval(root, 'gloved-paw', spider?red:black, [wrist[0],wrist[1]-.04,wrist[2]+.015], [.11,.115,.08]);
        if (spider) {
            for (let f = 0; f < 3; f++) rod(root, 'glove-finger', red,
                [wrist[0]+(f-1)*.062,.145,.52], [wrist[0]+(f-1)*.074,.058,.61], .025);
        } else {
            for (let f=0; f<3; f++) {
                const fin = plaque(root, 'gauntlet-fin', black, [[0,0],[side*.14,.055],[0,.11]], [side*.585,.75+f*.08,.015], .05);
                fin.castShadow = true;
            }
        }
        const pieces=root.children.slice(armStart);
        const upper=joint(root,`cameo-arm-${side<0?'left':'right'}`,shoulder,pieces.slice(0,2));
        const lower=joint(root,`cameo-forearm-${side<0?'left':'right'}`,elbow,pieces.slice(2));
        // Fingers/fist pivot at the wrist. Gauntlet fins stay on the forearm.
        const handPieces=pieces.slice(handStart-armStart,spider?undefined:handStart-armStart+1);
        const hand=joint(root,`cameo-hand-${side<0?'left':'right'}`,wrist,handPieces);
        lower.attach(hand);upper.attach(lower);
    }
    const head = new THREE.Group(); head.name = 'cameo-head';
    head.position.set(0, spider?1.46:1.72, spider?.19:.025); root.add(head);
    head.scale.setScalar(1.12);
    part(head, 'game-rat-muzzle', muzzleGeometry, spider?red:fur);
    oval(head, 'mask-cranium', spider?red:black, [0,.11,-.035], [.321,.29,.28]);
    oval(head, 'nose', spider?ink:black, [0,-.08,.545], [.067,.06,.062]);
    for (const side of [-1,1]) {
        const ear = new THREE.Group(); ear.name = `ear-${side<0?'left':'right'}`;
        ear.position.set(side*.345,.285,-.065); ear.rotation.z = -side*.20; head.add(ear);
        oval(ear, 'costumed-ear', spider?red:black, [0,0,0], [.155,.185,.065]);
        oval(ear, 'pink-inner-ear', skin, [0,0,.052], [.104,.133,.023]);
        if (!spider) {
            const point = part(head, 'cowl-point', new THREE.ConeGeometry(.073,.30,4), black, [side*.22,.43,-.015]);
            point.rotation.z = -side*.10;
        }
        const eye = new THREE.Group(); eye.name = `eye-${side}`;
        eye.position.set(side*.173,.095,.258); eye.rotation.y=side*.57; head.add(eye);
        const shape = spider ? [[-.135,.08],[-.07,.18],[.13,.21],[.095,.01],[.005,-.035],[-.09,.005]]
            : [[-.12,.075],[.13,.13],[.08,-.015],[-.045,-.025]];
        const mirror = shape.map(([x,y])=>[x*side,y]);
        plaque(eye, 'black-eye-rim', ink, mirror, [0,0,0]);
        const lens = plaque(eye, 'white-eye-lens', white, mirror.map(([x,y])=>[x*.76,y*.76]), [0,.018,.016]);
        lens.castShadow = false;
    }
    if (spider) {
        // Upper mask webs wrap all the way around, not just a front-facing decal.
        for (const latitude of [-.1,.35,.75,1.13]) {
            const points: Point[]=[];
            for(let i=0;i<=48;i++){
                const a=i/48*Math.PI*2;
                points.push([.324*Math.cos(latitude)*Math.sin(a),.11+.293*Math.sin(latitude),-.035+.283*Math.cos(latitude)*Math.cos(a)]);
            }
            curve(head,'mask-web-ring',ink,points,.0045);
        }
        for(let i=0;i<10;i++){
            const a=i/10*Math.PI*2, points: Point[]=[];
            for(let j=0;j<=20;j++){
                const t=-.25+j/20*1.79;
                points.push([.325*Math.cos(t)*Math.sin(a),.11+.294*Math.sin(t),-.035+.284*Math.cos(t)*Math.cos(a)]);
            }
            curve(head,'mask-web-spoke',ink,points,.0045);
        }
        for(const z of [.30,.40,.48]){
            const width=z===.30?.204:z===.40?.134:.087;
            curve(head,'snout-web',ink,[[-width,-.065,z],[-width*.7,.005,z],[0,.055-(z-.3)*.25,z],[width*.7,.005,z],[width,-.065,z]],.0045);
        }
    } else {
        curve(head,'deadpan-mouth',black,[[-.13,-.129,.377],[0,-.141,.45],[.13,-.129,.377]],.007);
        const cape = new THREE.Group(); cape.name='cameo-cape'; root.add(cape);
        const positions:number[]=[], indices:number[]=[];
        const columns=40, rows=14;
        for(let j=0;j<=rows;j++) for(let i=0;i<=columns;i++){
            const t=j/rows,u=i/columns*2-1, angle=u*1.77;
            const radius=.34+t*.52;
            const scallop=.14*Math.pow(Math.sin((u+1)*Math.PI*3),2)*Math.pow(t,8);
            positions.push(Math.sin(angle)*radius,1.46*(1-t)+.055+scallop,
                -.07-Math.cos(angle)*(radius*.70)+Math.sin(u*Math.PI*6)*.025*t);
            if(j<rows&&i<columns){const a=j*(columns+1)+i;indices.push(a,a+columns+1,a+1,a+1,a+columns+1,a+columns+2);}
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        geometry.setIndex(indices);geometry.computeVertexNormals();
        const capeMaterial=cloth(0x151d2d);capeMaterial.side=THREE.DoubleSide;
        const capeMesh=part(cape,'scalloped-cape',geometry,capeMaterial);
        cape.position.set(0,1.48,-.07);capeMesh.position.sub(cape.position);
        for(const side of [-1,1])oval(root,'cape-clasp',gold,[side*.22,1.48,.21],[.045,.045,.025]);
    }
    const tailPoints: Point[] = spider ? [[0,.52,-.22],[.18,.40,-.65],[.64,.25,-.96],[.99,.33,-.85],[1.04,.48,-.62]]
        : [[0,.32,-.24],[.16,.16,-.73],[.61,.09,-.88],[.97,.11,-.62],[.94,.15,-.37]];
    const tail=curve(root,'tail-curve',skin,tailPoints,.038);
    oval(tail,'tail-tip',skin,tailPoints[tailPoints.length-1],[.038,.038,.038]);
    joint(root,'cameo-tail',tailPoints[0],[tail]);
    // Merge static detail by material, retaining independently articulated head, cape and tail.
    const groups:THREE.Group[]=[];
    root.traverse(object=>{if(object instanceof THREE.Group)groups.push(object);});
    groups.reverse().forEach(batchStatic);
    // Offline authoring: share identical vertices without changing any surface,
    // normal or animation joint. These solid-color materials never sample UVs.
    root.traverse(node=>{if(node instanceof THREE.Mesh)compactGeometry(node.geometry);});
    joint(root,'cameo-motion',[0,0,0],[...root.children]);
    root.userData = {kind,artPrototype:true,pose:spider?'rooftop-crouch':'sewer-sentinel'};
    return root;
}

function compactGeometry(geometry:THREE.BufferGeometry){
    geometry.deleteAttribute('uv');
    const attributes=Object.entries(geometry.attributes);
    const count=geometry.index?.count??geometry.getAttribute('position').count;
    const vertices=new Map<string,number>(),indices:number[]=[];
    const unique:number[]=[];
    for(let i=0;i<count;i++){
        const vertex=geometry.index?geometry.index.getX(i):i;
        const key=attributes.map(([,attribute])=>{
            const values:number[]=[];
            for(let c=0;c<attribute.itemSize;c++)values.push(attribute.array[vertex*attribute.itemSize+c]);
            return values.join(',');
        }).join('|');
        let index=vertices.get(key);
        if(index===undefined){index=unique.length;vertices.set(key,index);unique.push(vertex);}
        indices.push(index);
    }
    for(const [name,attribute] of attributes){
        const values=new Float32Array(unique.length*attribute.itemSize);
        unique.forEach((vertex,index)=>{
            for(let c=0;c<attribute.itemSize;c++)values[index*attribute.itemSize+c]=attribute.array[vertex*attribute.itemSize+c];
        });
        geometry.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));
    }
    geometry.setIndex(indices);
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
}

function batchStatic(group: THREE.Object3D) {
    const batches=new Map<THREE.Material,THREE.Mesh[]>();
    // Direct meshes only: subgroups are named articulation points and remain editable.
    for(const child of group.children)if(child instanceof THREE.Mesh&&child.children.length===0&&!Array.isArray(child.material)){
        const items=batches.get(child.material)??[];items.push(child);batches.set(child.material,items);
    }
    for(const [material,meshes] of batches){
        if(meshes.length<2)continue;
        const geometries=meshes.map(mesh=>{
            mesh.updateMatrix();
            const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
            // Solid colors only; the source muzzle has no UVs and needs none.
            geometry.deleteAttribute('uv');
            return geometry.applyMatrix4(mesh.matrix);
        });
        const merged=mergeGeometries(geometries);
        geometries.forEach(g=>g.dispose());
        if(!merged)continue;
        for(const mesh of meshes){group.remove(mesh);mesh.geometry.dispose();}
        part(group,`${group.name||'detail'}-batch`,merged,material);
    }
}
