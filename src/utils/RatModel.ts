import * as THREE from 'three';

export type HatType = 'fedora' | 'trilby' | 'porkpie';

export interface RatOptions {
    coatColor?: number;
    furColor?: number;
    hatType?: HatType;
    hatColor?: number;  // Independent hat color (if omitted, derived from coat)
}

/**
 * Creates the shared Rat Detective mesh used by both the Player and Enemies.
 */
export function createRatMesh(options: RatOptions = {}): THREE.Group {
    const group = new THREE.Group();

    // ── Derive palette ──
    const coatColorHex = options.coatColor ?? 0x5c4a3a;
    const furColorHex = options.furColor ?? 0x7c6a5a;
    const hatType = options.hatType ?? 'fedora';

    // Hat color — use explicit or derive from coat
    let finalHatColor: number;
    let bandColor: number;

    if (options.hatColor !== undefined) {
        finalHatColor = options.hatColor;
        // Derive band as a lighter tint of the hat color
        const hBase = new THREE.Color(finalHatColor);
        const hHSL = { h: 0, s: 0, l: 0 };
        hBase.getHSL(hHSL);
        bandColor = new THREE.Color().setHSL(hHSL.h, hHSL.s * 0.8, Math.min(hHSL.l * 1.4, 0.85)).getHex();
    } else {
        // Legacy: derive from coat
        const baseKey = new THREE.Color(coatColorHex);
        const keyHSL = { h: 0, s: 0, l: 0 };
        baseKey.getHSL(keyHSL);
        finalHatColor = new THREE.Color().setHSL(keyHSL.h, keyHSL.s * 0.9, keyHSL.l * 0.6).getHex();
        bandColor = new THREE.Color().setHSL(keyHSL.h, keyHSL.s, keyHSL.l * 1.4).getHex();
    }

    // Skin is warm pinkish
    const skinColor = 0xc4a090;

    // ── Materials ──
    const coatMat = new THREE.MeshStandardMaterial({
        color: coatColorHex, roughness: 0.55, metalness: 0.1,
    });
    const bodyMat = new THREE.MeshStandardMaterial({ color: furColorHex, roughness: 0.5 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.45 });
    const hatMat = new THREE.MeshStandardMaterial({
        color: finalHatColor, roughness: 0.5, metalness: 0.1,
    });
    const bandMat = new THREE.MeshStandardMaterial({ color: bandColor, roughness: 0.45 });

    // ── Body Parts ──

    // Trenchcoat body
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.2, 10), coatMat);
    torso.position.y = 0.6;
    torso.castShadow = true;
    group.add(torso);

    // Upper body (Chest)
    const upperBody = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), coatMat);
    upperBody.position.y = 1.2;
    upperBody.castShadow = true;
    group.add(upperBody);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), bodyMat);
    head.position.y = 1.6;
    head.castShadow = true;
    group.add(head);

    // Snout
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), skinMat);
    snout.position.set(0, 1.5, 0.32);
    snout.scale.set(1, 0.8, 1.3);
    group.add(snout);

    // Nose
    const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x301818, roughness: 0.3 })
    );
    nose.position.set(0, 1.5, 0.5);
    group.add(nose);

    // Ears
    const earGeo = new THREE.SphereGeometry(0.11, 6, 6);
    const earL = new THREE.Mesh(earGeo, skinMat);
    earL.position.set(-0.22, 1.85, -0.04);
    earL.scale.set(1, 1.2, 0.6);
    group.add(earL);
    const earR = earL.clone();
    earR.position.x = 0.22;
    group.add(earR);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1, metalness: 0.9 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), eyeMat);
    eyeL.position.set(-0.14, 1.68, 0.24);
    group.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.14;
    group.add(eyeR);

    // Tail
    const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.25, -0.45),
        new THREE.Vector3(0, 0.18, -0.95),
        new THREE.Vector3(0.18, 0.28, -1.4),
        new THREE.Vector3(0.08, 0.45, -1.7),
    ]);
    const tail = new THREE.Mesh(
        new THREE.TubeGeometry(tailCurve, 12, 0.05, 6, false),
        skinMat
    );
    tail.castShadow = true;
    group.add(tail);

    // ── HATS ──
    const hatGroup = new THREE.Group();
    hatGroup.position.y = 1.9; // Base of hat on head
    hatGroup.rotation.x = -0.1; // Slight tilt back
    group.add(hatGroup);

    if (hatType === 'fedora') {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12), hatMat);
        hatGroup.add(brim);

        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.35, 12), hatMat);
        crown.position.y = 0.175;
        hatGroup.add(crown);

        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.31, 0.06, 12), bandMat);
        band.position.y = 0.05;
        hatGroup.add(band);

    } else if (hatType === 'trilby') {
        // Narrower brim, taller crown
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), hatMat);
        // Tilt brim back more
        brim.rotation.x = -0.2;
        hatGroup.add(brim);

        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.4, 10), hatMat);
        crown.position.y = 0.2;
        crown.rotation.x = -0.1;
        hatGroup.add(crown);

        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.29, 0.06, 10), bandMat);
        band.position.y = 0.05;
        band.rotation.x = -0.1;
        hatGroup.add(band);

    } else if (hatType === 'porkpie') {
        // Flat top, short brim
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), hatMat);
        brim.scale.z = 0.9;
        hatGroup.add(brim);

        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), hatMat);
        crown.position.y = 0.125;
        hatGroup.add(crown);

        // Flat top indent
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12), bandMat);
        top.position.y = 0.22;
        hatGroup.add(top);
    }

    return group;
}
