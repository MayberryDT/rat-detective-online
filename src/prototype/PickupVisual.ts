import * as THREE from 'three';
import type { PickupKind } from '../shared/pickups';

const COLORS: Record<PickupKind, number> = {
    ironclad: 0x9fd8ff,
    hustle: 0xffb43c,
    'quick-fix': 0x6cf0a0,
};

/** A small street-level item with a distinct silhouette per benefit. Emissive and
 * unlit-ringed so it reads on the dark pavement without adding a live light. */
export class PickupVisual {
    readonly root = new THREE.Group();
    private readonly core: THREE.Mesh;
    private readonly ring: THREE.Mesh;
    private readonly material: THREE.MeshStandardMaterial;
    constructor(scene: THREE.Scene, kind: PickupKind) {
        const color = COLORS[kind];
        this.material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .9, metalness: .35, roughness: .32 });
        const geometry = kind === 'ironclad' ? new THREE.TorusGeometry(.32, .11, 10, 22)
            : kind === 'hustle' ? new THREE.ConeGeometry(.28, .52, 4)
                : new THREE.BoxGeometry(.46, .32, .46);
        this.core = new THREE.Mesh(geometry, this.material);
        this.core.position.y = .55;
        this.root.add(this.core);
        this.ring = new THREE.Mesh(
            new THREE.RingGeometry(.48, .6, 24),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
        );
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = .05;
        this.root.add(this.ring);
        this.root.name = 'pickup-' + kind;
        scene.add(this.root);
    }
    setPosition(x: number, y: number, z: number): void { this.root.position.set(x, y, z); }
    update(now: number): void {
        this.core.rotation.y = now * .0016;
        this.core.position.y = .55 + Math.sin(now * .003) * .08;
        this.ring.rotation.z = now * .0011;
        this.ring.scale.setScalar(1 + Math.sin(now * .003) * .07);
        this.material.emissiveIntensity = .72 + Math.sin(now * .004) * .24;
    }
    dispose(): void {
        this.root.removeFromParent();
        this.core.geometry.dispose();
        this.ring.geometry.dispose();
        this.material.dispose();
        (this.ring.material as THREE.Material).dispose();
    }
}
