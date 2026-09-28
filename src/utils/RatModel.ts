import * as THREE from 'three';
import type { HatTypeName, RatAppearance } from '../shared/networkProtocol';
import { DEFAULT_APPEARANCE } from '../shared/ratAppearance';
import { COAT_PROFILE, addCoatTailoring } from './RatCoatGeometry';
import { createRatArm, RAT_GUN_SHOULDER, updateGunSleeve } from './RatArmModel';
import { feelState } from '../feel/feelState';

export type HatType = HatTypeName;
export type RatOptions = Partial<RatAppearance>;

// Rats ignore the noir fog so they keep full contrast at any distance and HP.
function material(color: THREE.ColorRepresentation, roughness = 0.78) {
    return new THREE.MeshStandardMaterial({ color, roughness, fog: false });
}
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material,
    x = 0, y = 0, z = 0) {
    const part = new THREE.Mesh(geometry, mat);
    part.position.set(x, y, z); part.castShadow = true; parent.add(part); return part;
}
function pivot(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0) {
    const part = new THREE.Group(); part.name = name; part.position.set(x, y, z); parent.add(part); return part;
}

/** Continuous cross sections keep the muzzle joined to the cheeks without a cylinder seam. */
function muzzleGeometry() {
    const rings = [
        [-0.26, 0.025, 0.035, 0.06], [-0.16, 0.025, 0.26, 0.25],
        [0.02, 0.015, 0.32, 0.265], [0.2, -0.025, 0.26, 0.19],
        [0.39, -0.072, 0.145, 0.105], [0.54, -0.08, 0.055, 0.06],
    ];
    const positions: number[] = [], indices: number[] = [];
    const segments = 16;
    for (const [z, cy, rx, ry] of rings) for (let i = 0; i < segments; i++) {
        const angle = i / segments * Math.PI * 2;
        positions.push(Math.cos(angle) * rx, cy + Math.sin(angle) * ry, z);
    }
    for (let ring = 0; ring < rings.length - 1; ring++) for (let i = 0; i < segments; i++) {
        const a = ring * segments + i, b = ring * segments + (i + 1) % segments;
        indices.push(a, b, a + segments, b, b + segments, a + segments);
    }
    for (let i = 1; i < segments - 1; i++) {
        indices.push(0, i + 1, i);
        const end = (rings.length - 1) * segments;
        indices.push(end, end + i, end + i + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** Solid open collar with a finished inner rim, rather than overlapping shoulder spheres. */
function collarGeometry() {
    const positions: number[] = [], indices: number[] = [];
    const segments = 24;
    const profiles = [[0.355, 1.255], [0.405, 1.465], [0.382, 1.455], [0.33, 1.27]];
    for (const [radius, y] of profiles) for (let i = 0; i <= segments; i++) {
        const angle = 0.56 + i / segments * (Math.PI * 2 - 1.12);
        positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius * 0.92);
    }
    for (let face = 0; face < 4; face++) for (let i = 0; i < segments; i++) {
        const a = face * (segments + 1) + i, b = ((face + 1) % 4) * (segments + 1) + i;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    for (const i of [0, segments]) {
        const a = i, b = 25 + i, c = 50 + i, d = 75 + i;
        if (i === 0) indices.push(a, c, b, a, d, c);
        else indices.push(a, b, c, a, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // Reverse the strip winding so the outside of the collar faces outward.
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function cheesePistol(parent: THREE.Group, coat: THREE.Material, highlight: THREE.Material) {
    const arm = pivot(parent, 'rat-arm', -0.49, 0.91, 0.09);
    arm.rotation.x = 1.28;
    const limb=createRatArm(coat,highlight);
    const shoulder=pivot(parent,'rat-gun-shoulder',RAT_GUN_SHOULDER.x,RAT_GUN_SHOULDER.y,RAT_GUN_SHOULDER.z);
    shoulder.add(limb);
    limb.getObjectByName('rat-arm-cuff')!.name='rat-pistol-cuff';
    const pistol = pivot(arm, 'rat-pistol');
    const cheese = material(0xefb62e, 0.62), dark = material(0x29282a, 0.65);
    const shape = new THREE.Shape();
    shape.moveTo(-0.17, 0.02); shape.lineTo(0.23, 0.02); shape.lineTo(0.25, 0.05);
    shape.lineTo(0.25, 0.17); shape.lineTo(0.20, 0.20); shape.lineTo(-0.17, 0.17);
    shape.lineTo(-0.2, 0.13); shape.closePath();
    for (const [x, y, radius] of [[0.055, 0.105, 0.041], [-0.11, 0.125, 0.025], [-0.055, 0.035, 0.025]]) {
        const hole = new THREE.Path(); hole.absarc(x, y, radius, 0, Math.PI * 2, true); shape.holes.push(hole);
    }
    const shell = new THREE.ExtrudeGeometry(shape, { depth: 0.13, bevelEnabled: true,
        bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, steps: 1, curveSegments: 12 });
    shell.translate(0, 0, -0.065); shell.rotateY(-Math.PI / 2);
    mesh(pistol, shell, cheese);
    const gripShape = new THREE.Shape();
    gripShape.moveTo(-0.06, 0.035); gripShape.lineTo(0.04, 0.035);
    gripShape.lineTo(0.06, -0.17); gripShape.lineTo(-0.055, -0.17); gripShape.closePath();
    const grip = new THREE.ExtrudeGeometry(gripShape, { depth: 0.075, bevelEnabled: true,
        bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 1, steps: 1 });
    grip.translate(0, 0, -0.0375); grip.rotateY(-Math.PI / 2);
    mesh(pistol, grip, dark, 0, 0, -0.09);
    // Recessed dark bore framed by an ochre rim; large enough to read at gameplay distance.
    const rim = mesh(pistol, new THREE.TorusGeometry(0.047, 0.012, 6, 16), material(0x9c771f), 0, 0.106, 0.259);
    rim.name = 'pistol-barrel';
    mesh(pistol, new THREE.CircleGeometry(0.039, 16), dark, 0, 0.106, 0.259);
    pivot(pistol, 'rat-muzzle', 0, 0.106, 0.28);
    updateGunSleeve({shoulder,sleeve:limb,arm,pistol});
}

/** Approved cheese-pistol concept, built as lightweight editable geometry. */
export function createRatMesh(options: RatOptions = {}): THREE.Group {
    const root = new THREE.Group();
    // Rats keep full colour under the noir city pass.
    root.userData.noNoir = true;
    const coatColor = options.coatColor ?? DEFAULT_APPEARANCE.coatColor;
    const coat = material(coatColor), fur = material(options.furColor ?? DEFAULT_APPEARANCE.furColor);
    const skin = material(0xc99089, 0.68);
    coat.name="rat-coat";skin.name="rat-skin";
    const felt = material(options.hatColor ?? DEFAULT_APPEARANCE.hatColor);
    const highlight = material(options.highlightColor ?? DEFAULT_APPEARANCE.highlightColor!);
    highlight.name = 'rat-highlight';
    const shirt = material(highlight.color.clone().lerp(new THREE.Color(0xffffff), 0.22));
    const darkCoat = material(coat.color.clone().multiplyScalar(0.32));
    shirt.name = 'rat-shirt'; darkCoat.name = 'rat-fasteners';
    const body = pivot(root, 'rat-body');
    // One clean tapered coat with a rounded shoulder and a subtle finished hem.
    const coatBody = mesh(body, new THREE.LatheGeometry(COAT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 32), coat);
    coatBody.name = 'rat-coat-body';
    mesh(body, collarGeometry(), highlight).name = 'rat-collar';
    addCoatTailoring(body, coat, highlight, shirt, darkCoat);
    const head = pivot(body, 'rat-head', 0, 1.60, 0.015);
    // Polish 14 (feel switch, applies to newly built rats): whiskers, brows, cheeks,
    // brim edge and shoes. Identity, palette and silhouette are unchanged.
    const touchUps = feelState().on('modelTouchUps');
    const muzzle = mesh(head, muzzleGeometry(), fur);
    if (touchUps) muzzle.scale.set(1.045, 1.03, 1);
    const nose = mesh(head, new THREE.SphereGeometry(0.068, 16, 10), material(0x382227, touchUps ? 0.3 : 0.42), 0, -0.08, 0.545);
    const white = material(0xeee4cc), pupil = material(0x13121a, 0.5);
    for (const side of [-1, 1]) {
        const eye = pivot(head, side < 0 ? 'rat-eye-left' : 'rat-eye-right', side * 0.175, 0.102, 0.268);
        eye.scale.x = 0.93;
        eye.rotation.y = side * 0.55; eye.rotation.z = side * 0.09;
        mesh(eye, new THREE.CircleGeometry(0.101, 20, Math.PI, Math.PI), white);
        const iris = mesh(eye, new THREE.CircleGeometry(0.063, 20, Math.PI, Math.PI), pupil, -side * 0.017, -0.004, 0.004);
        if (touchUps) iris.name = 'rat-pupil';
    }
    if (touchUps) {
        nose.scale.setScalar(1.06);
        // Reuse the rig's existing materials: extra materials would push the
        // batched rat past its 16-entry palette and multiply its draw calls.
        const brow = pupil;
        const browGeometry = new THREE.BoxGeometry(0.15, 0.03, 0.03);
        const whisker = white;
        const whiskerGeometry = new THREE.CylinderGeometry(0.0045, 0.0022, 0.34, 5).translate(0, 0.17, 0).rotateZ(-Math.PI / 2);
        for (const side of [-1, 1]) {
            const browPivot = pivot(head, side < 0 ? 'rat-brow-left' : 'rat-brow-right', side * 0.17, 0.158, 0.29);
            browPivot.rotation.y = side * 0.55;browPivot.rotation.z = -side * 0.12;
            mesh(browPivot, browGeometry, brow).userData.noOutline = true;
            const whiskers = pivot(head, side < 0 ? 'rat-whiskers-left' : 'rat-whiskers-right', side * 0.09, -0.1, 0.46);
            for (const [i, tilt] of [0.16, 0, -0.14].entries()) {
                const hair = mesh(whiskers, whiskerGeometry, whisker);
                hair.rotation.set(0, side < 0 ? Math.PI - 0.35 : 0.35, tilt + (side < 0 ? 0 : 0), 'YXZ');
                hair.position.y = (1 - i) * 0.018;
                hair.castShadow = false;hair.userData.noOutline = true;
            }
        }
        // M1/R3: a mouth that opens to scream, and the dead face (X eyes, tongue).
        // All start collapsed by scale; the animator opens them. Existing materials only.
        const mouth = pivot(head, 'rat-mouth', 0, -0.165, 0.43);
        mouth.rotation.x = 1.1;mouth.scale.y = 1e-4;
        mesh(mouth, new THREE.CircleGeometry(0.075, 16), pupil).userData.noOutline = true;
        const tongue = pivot(head, 'rat-tongue', 0, -0.19, 0.44);
        tongue.scale.z = 1e-4;
        const lick = mesh(tongue, new THREE.BoxGeometry(0.075, 0.02, 0.15).translate(0, 0, 0.075), skin);
        lick.userData.noOutline = true;lick.castShadow = false;
        const crossGeometry = new THREE.BoxGeometry(0.16, 0.028, 0.012);
        for (const side of [-1, 1]) {
            const cross = pivot(head, side < 0 ? 'rat-x-left' : 'rat-x-right', side * 0.175, 0.102, 0.275);
            cross.rotation.y = side * 0.55;cross.scale.setScalar(1e-4);
            for (const angle of [Math.PI / 4, -Math.PI / 4]) {
                const bar = mesh(cross, crossGeometry, pupil);bar.rotation.z = angle;bar.userData.noOutline = true;bar.castShadow = false;
            }
        }
    }
    const hat = pivot(head, 'rat-hat', 0, 0.19, 0);
    hat.rotation.x = 0.06;
    // Old checkpoint hat names remain readable, but all new silhouettes share this fedora.
    const brimRadius = 0.64;
    const brim = mesh(hat, new THREE.LatheGeometry([[0,-.0175],[brimRadius-.012,-.0175],[brimRadius,-.008],[brimRadius,.008],[brimRadius-.012,.0175],[0,.0175]].map(([r,y])=>new THREE.Vector2(r,y)),40), felt);
    brim.name = 'hat-brim';
    brim.scale.z = 0.8;
    const crownHeight = 0.38, crownBottom = 0.35, crownTop = 0.315;
    const crown = new THREE.CylinderGeometry(crownTop, crownBottom, crownHeight, 24, 3);
    {
        const points = crown.getAttribute('position');
        for (let i = 0; i < points.count; i++) {
            const top = Math.max(0, points.getY(i) / crownHeight * 2);
            const dent = 0.045 * (1 - Math.min(1, Math.abs(points.getX(i)) / 0.24));
            points.setY(i, points.getY(i) - dent * top);
        }
        crown.computeVertexNormals();
    }
    const crownMesh = mesh(hat, crown, felt, 0, crownHeight / 2 + 0.012, 0);
    crownMesh.name = 'hat-crown';
    crownMesh.scale.z = 0.86;
    const radiusAt = (height: number) => crownBottom + (crownTop - crownBottom) * ((height - 0.012) / crownHeight) + 0.008;
    const hatBand = mesh(hat, new THREE.CylinderGeometry(radiusAt(0.1025), radiusAt(0.0275), 0.075, 24), highlight, 0, 0.065, 0);
    hatBand.name = 'rat-hatband';
    hatBand.scale.z = 0.86;
    if (touchUps) {
        // A rolled brim edge in the same felt: definition comes from its shading, not a new colour.
        const edge = mesh(hat, new THREE.TorusGeometry(brimRadius - 0.004, 0.014, 6, 48), felt);
        edge.rotation.x = Math.PI / 2;edge.scale.set(1, 0.8, 1);edge.userData.noOutline = true;
    }
    // The visible ear bases sit on the side brim, outside the crown. Sharing the
    // hat pivot keeps that clearance during its secondary walking/recoil motion.
    for (const side of [-1, 1]) {
        const ear = pivot(hat, side < 0 ? 'rat-ear-left' : 'rat-ear-right', side * 0.475, 0.026, 0);
        const outer = mesh(ear, new THREE.SphereGeometry(0.13, 20, 12), fur, 0, 0.14, 0);
        outer.scale.set(1, 1.075, 0.34);
        outer.userData.noOutline = true;
        const inner = mesh(ear, new THREE.SphereGeometry(0.095, 20, 12), skin, 0, 0.143, 0.032);
        inner.scale.set(1, 1.07, 0.20);
        inner.userData.noOutline = true;
    }
    const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, -0.18, -0.42),
        new THREE.Vector3(0.17, -0.19, -0.88), new THREE.Vector3(0.2, -0.17, -1.17),
    ]);
    const tail = mesh(root, new THREE.TubeGeometry(tailCurve, 24, 0.052, 10, false), skin, 0, 0.25, -0.44);
    tail.name = 'rat-tail';
    mesh(tail, new THREE.SphereGeometry(0.052, 12, 8), skin, 0.2, -0.17, -1.17);
    if (touchUps && feelState().on('shoes')) {
        // Two dark shoes peeking under the hem; no legs. They step with the stride.
        const leather = pupil;
        const shoeGeometry = new THREE.SphereGeometry(0.1, 14, 8);
        for (const side of [-1, 1]) {
            const shoe = pivot(root, side < 0 ? 'rat-shoe-left' : 'rat-shoe-right', side * 0.16, 0.035, 0.36);
            const part = mesh(shoe, shoeGeometry, leather);part.scale.set(1, 0.5, 1.75);part.userData.noOutline = true;
        }
    }
    cheesePistol(body, coat, highlight);
    return root;
}
