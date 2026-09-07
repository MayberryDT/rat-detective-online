import * as THREE from 'three';
import type { HatTypeName, RatAppearance } from '../shared/networkProtocol';

export type HatType = HatTypeName;
export type RatOptions = Partial<RatAppearance>;

function material(color: THREE.ColorRepresentation, roughness = 0.78) {
    return new THREE.MeshStandardMaterial({ color, roughness });
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
    const profiles = [[0.355, 1.235], [0.43, 1.51], [0.404, 1.50], [0.33, 1.25]];
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

function cheesePistol(parent: THREE.Group, coat: THREE.Material, skin: THREE.Material) {
    const arm = pivot(parent, 'rat-arm', -0.49, 0.91, 0.09);
    arm.rotation.x = 1.28;
    const cuff = mesh(arm, new THREE.CylinderGeometry(0.105, 0.095, 0.18, 16), coat, 0, -0.035, -0.16);
    cuff.rotation.x = Math.PI / 2;
    const paw = mesh(arm, new THREE.SphereGeometry(0.085, 16, 10), skin, 0, -0.065, -0.055);
    paw.scale.set(0.9, 1.1, 0.85);
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
    for (let i = 0; i < 3; i++) {
        const finger = mesh(arm, new THREE.SphereGeometry(0.031, 12, 8), skin, -0.052, -0.02 - i * 0.043, -0.055);
        finger.scale.set(0.68, 0.66, 1.45);
    }
    pivot(pistol, 'rat-muzzle', 0, 0.106, 0.28);
}

/** Approved cheese-pistol concept, built as lightweight editable geometry. */
export function createRatMesh(options: RatOptions = {}): THREE.Group {
    const root = new THREE.Group();
    const coatColor = options.coatColor ?? 0xbe4545;
    const coat = material(coatColor), fur = material(options.furColor ?? 0xe8b84d);
    const skin = material(0xc99089, 0.68);
    const hatColor = options.hatColor ?? new THREE.Color(coatColor).multiplyScalar(0.8);
    const felt = material(hatColor), band = material(0xddc79b);
    const body = pivot(root, 'rat-body');
    // One clean tapered coat with a rounded shoulder and a subtle finished hem.
    const profile = [[0, 0], [0.485, 0], [0.505, 0.025], [0.503, 0.07],
        [0.477, 0.65], [0.434, 1.15], [0.403, 1.285], [0.35, 1.34], [0, 1.34]];
    mesh(body, new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 24), coat);
    mesh(body, collarGeometry(), coat);
    for (const side of [-1, 1]) {
        const lapelShape = new THREE.Shape();
        lapelShape.moveTo(0, 0); lapelShape.lineTo(side * 0.34, 0.155);
        lapelShape.lineTo(side * 0.25, -0.17); lapelShape.closePath();
        const geometry = new THREE.ExtrudeGeometry(lapelShape, { depth: 0.014,
            bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, steps: 1 });
        const points = geometry.getAttribute('position');
        for (let i = 0; i < points.count; i++) {
            // Keep each collar tip on top of the curved coat instead of intersecting it.
            points.setZ(i, points.getZ(i) + 0.445 - side * points.getX(i) * 0.32 - points.getY(i) * 0.18);
        }
        geometry.computeVertexNormals();
        mesh(body, geometry, coat, 0, 1.375, 0).userData.noOutline = true;
    }
    const head = pivot(body, 'rat-head', 0, 1.60, 0.015);
    mesh(head, muzzleGeometry(), fur);
    mesh(head, new THREE.SphereGeometry(0.068, 16, 10), material(0x382227, 0.42), 0, -0.08, 0.545);
    const white = material(0xeee4cc), pupil = material(0x13121a, 0.5);
    for (const side of [-1, 1]) {
        const eye = pivot(head, side < 0 ? 'rat-eye-left' : 'rat-eye-right', side * 0.175, 0.102, 0.268);
        eye.scale.x = 0.93;
        eye.rotation.y = side * 0.55; eye.rotation.z = side * 0.09;
        mesh(eye, new THREE.CircleGeometry(0.101, 20, Math.PI, Math.PI), white);
        mesh(eye, new THREE.CircleGeometry(0.063, 20, Math.PI, Math.PI), pupil, -side * 0.017, -0.004, 0.004);
    }
    const hat = pivot(head, 'rat-hat', 0, 0.19, 0);
    hat.rotation.x = 0.06;
    const type = options.hatType ?? 'fedora';
    const brimRadius = type === 'fedora' ? 0.64 : type === 'trilby' ? 0.53 : 0.51;
    const brim = mesh(hat, new THREE.CylinderGeometry(brimRadius, brimRadius, 0.035, 40), felt);
    brim.name = 'hat-brim';
    brim.scale.z = 0.8;
    const crownHeight = type === 'porkpie' ? 0.23 : type === 'trilby' ? 0.41 : 0.38;
    const crownBottom = type === 'porkpie' ? 0.34 : 0.35;
    const crownTop = type === 'porkpie' ? 0.335 : type === 'trilby' ? 0.27 : 0.315;
    const crown = new THREE.CylinderGeometry(crownTop, crownBottom, crownHeight, 24, 3);
    if (type !== 'porkpie') {
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
    const hatBand = mesh(hat, new THREE.CylinderGeometry(radiusAt(0.1025), radiusAt(0.0275), 0.075, 24), band, 0, 0.065, 0);
    hatBand.scale.z = 0.86;
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
    cheesePistol(body, coat, skin);
    return root;
}
