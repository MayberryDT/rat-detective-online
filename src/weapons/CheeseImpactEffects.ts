import * as THREE from 'three';

/** Bounded, cosmetic-only crumbs and surface splashes; no physics bodies or aim targets. */
export class CheeseImpactEffects {
    private readonly root = new THREE.Group();
    private readonly crumbGeometry = new THREE.SphereGeometry(0.03, 6, 4);
    private readonly crumbMaterial = new THREE.MeshStandardMaterial({color: 0xffc24d, emissive: 0xe79b20, emissiveIntensity: 0.4, roughness: 0.7});
    private readonly splatGeometry;
    private readonly splatMaterial = new THREE.MeshBasicMaterial({color: 0xdba32f, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide});
    private readonly crumbs = new THREE.InstancedMesh(this.crumbGeometry, this.crumbMaterial, 160);
    private readonly splats;
    private particles: {position: THREE.Vector3; velocity: THREE.Vector3; age: number; lifetime: number; spin: number}[] = [];
    private marks: {position: THREE.Vector3; rotation: THREE.Quaternion; age: number; size: number}[] = [];
    private readonly dummy = new THREE.Object3D();
    private readonly tangent = new THREE.Vector3();
    private readonly bitangent = new THREE.Vector3();
    private readonly normal = new THREE.Vector3();
    private sequence = 0;
    private disposed = false;

    constructor(scene: THREE.Scene) {
        const shape = new THREE.Shape();
        for (let i = 0; i < 32; i++) {
            const angle = i / 32 * Math.PI * 2;
            const radius = 0.25 * (1 + 0.22 * Math.sin(angle * 5) + 0.12 * Math.cos(angle * 9));
            const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
            if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
        }
        shape.closePath(); this.splatGeometry = new THREE.ShapeGeometry(shape);
        this.splats = new THREE.InstancedMesh(this.splatGeometry, this.splatMaterial, 40);
        this.root.name = 'cheese-impact-effects';
        this.crumbs.count = this.splats.count = 0;
        this.crumbs.frustumCulled = this.splats.frustumCulled = false;
        this.root.add(this.crumbs, this.splats); scene.add(this.root);
    }

    emit(point: THREE.Vector3, normal: THREE.Vector3, surface: boolean): void {
        if (this.disposed) return;
        this.normal.copy(normal).normalize();
        this.tangent.set(Math.abs(this.normal.y) < 0.9 ? 0 : 1, Math.abs(this.normal.y) < 0.9 ? 1 : 0, 0).cross(this.normal).normalize();
        this.bitangent.crossVectors(this.normal, this.tangent);
        const phase = ++this.sequence * 2.39996;
        for (let i = 0; i < 7; i++) {
            const angle = phase + i * Math.PI * 2 / 7;
            const velocity = this.normal.clone().multiplyScalar(1.5 + (i % 3) * 0.6)
                .addScaledVector(this.tangent, Math.cos(angle) * 2.2)
                .addScaledVector(this.bitangent, Math.sin(angle) * 2.2);
            this.particles.push({position: point.clone().addScaledVector(this.normal, 0.04), velocity, age: 0, lifetime: 0.5 + i * 0.05, spin: angle});
        }
        if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
        if (surface) {
            const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), this.normal);
            rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), phase));
            this.marks.push({position: point.clone().addScaledVector(this.normal, 0.035), rotation, age: 0, size: 0.7 + (this.sequence % 3) * 0.15});
            if (this.marks.length > 40) this.marks.shift();
        }
        this.update(0);
    }

    update(dt: number): void {
        if (this.disposed) return;
        this.particles = this.particles.filter(particle => (particle.age += dt) < particle.lifetime);
        this.particles.forEach((particle, i) => {
            particle.velocity.y -= dt * 10;
            particle.position.addScaledVector(particle.velocity, dt);
            if (particle.position.y < 0.04 && particle.velocity.y < 0) {
                particle.position.y = 0.04; particle.velocity.y *= -0.2;
                particle.velocity.x *= 0.6; particle.velocity.z *= 0.6;
            }
            this.dummy.position.copy(particle.position);
            this.dummy.rotation.set(particle.spin + particle.age * 9, particle.age * 12, particle.spin);
            this.dummy.scale.setScalar(Math.min(1, (particle.lifetime - particle.age) * 7));
            this.dummy.updateMatrix(); this.crumbs.setMatrixAt(i, this.dummy.matrix);
        });
        this.marks = this.marks.filter(mark => (mark.age += dt) < 3);
        this.marks.forEach((mark, i) => {
            this.dummy.position.copy(mark.position); this.dummy.quaternion.copy(mark.rotation);
            const grow = 0.4 + 0.6 * Math.min(1, mark.age / 0.07);
            const shrink = Math.min(1, (3 - mark.age) / 0.4);
            this.dummy.scale.setScalar(mark.size * grow * shrink);
            this.dummy.updateMatrix(); this.splats.setMatrixAt(i, this.dummy.matrix);
        });
        this.crumbs.count = this.particles.length; this.splats.count = this.marks.length;
        this.crumbs.instanceMatrix.needsUpdate = this.splats.instanceMatrix.needsUpdate = true;
    }

    clear(): void {
        this.particles = []; this.marks = []; this.crumbs.count = this.splats.count = 0;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.clear(); this.root.removeFromParent();
        this.crumbs.dispose(); this.splats.dispose();
        this.crumbGeometry.dispose(); this.splatGeometry.dispose();
        this.crumbMaterial.dispose(); this.splatMaterial.dispose();
    }
}
