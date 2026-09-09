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
    private readonly particles = Array.from({length:160},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),age:Infinity,lifetime:0,spin:0,size:1}));
    private particleCursor=0;
    private readonly marks = Array.from({length:40},()=>({position:new THREE.Vector3(),rotation:new THREE.Quaternion(),age:Infinity,size:0}));
    private markCursor=0;
    private active=false;
    private readonly axis=new THREE.Vector3(0,0,1);
    private readonly twist=new THREE.Quaternion();
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

    emit(point: THREE.Vector3, normal: THREE.Vector3, surface: boolean, scale=1): void {
        if (this.disposed) return;
        const size=Math.max(.6,Math.min(8,scale));
        this.normal.copy(normal).normalize();
        this.tangent.set(Math.abs(this.normal.y) < 0.9 ? 0 : 1, Math.abs(this.normal.y) < 0.9 ? 1 : 0, 0).cross(this.normal).normalize();
        this.bitangent.crossVectors(this.normal, this.tangent);
        const phase = ++this.sequence * 2.39996;
        const crumbs=Math.min(12,5+Math.round(size*2));
        for (let i = 0; i < crumbs; i++) {
            const angle = phase + i * Math.PI * 2 / crumbs;
            const particle=this.particles[this.particleCursor++%160];
            particle.velocity.copy(this.normal).multiplyScalar((1.5+(i%3)*.6)*Math.min(2.4,size))
                .addScaledVector(this.tangent,Math.cos(angle)*2.2*Math.min(2.2,size))
                .addScaledVector(this.bitangent,Math.sin(angle)*2.2*Math.min(2.2,size));
            particle.position.copy(point).addScaledVector(this.normal,.04*size);
            particle.age=0;particle.lifetime=.5+i*.05;particle.spin=angle;particle.size=Math.min(3.2,.7+size*.35);
        }
        if(surface){
            const mark=this.marks[this.markCursor++%40];
            mark.rotation.setFromUnitVectors(this.axis,this.normal);
            mark.rotation.multiply(this.twist.setFromAxisAngle(this.axis,phase));
            mark.position.copy(point).addScaledVector(this.normal,.035);
            mark.age=0;mark.size=(.7+(this.sequence%3)*.15)*size;
        }
        // Emission only fills bounded slots. The frame owner flushes all impacts once.
        this.active=true;
    }

    update(dt: number): void {
        if(this.disposed||!this.active)return;
        let particleCount=0,markCount=0;
        // Ring order preserves oldest-to-newest draw order when slots wrap.
        for(let slot=0;slot<160;slot++){
            const particle=this.particles[(this.particleCursor+slot)%160];
            if((particle.age+=dt)>=particle.lifetime)continue;
            particle.velocity.y -= dt * 10;
            particle.position.addScaledVector(particle.velocity, dt);
            if (particle.position.y < 0.04 && particle.velocity.y < 0) {
                particle.position.y = 0.04; particle.velocity.y *= -0.2;
                particle.velocity.x *= 0.6; particle.velocity.z *= 0.6;
            }
            this.dummy.position.copy(particle.position);
            this.dummy.rotation.set(particle.spin + particle.age * 9, particle.age * 12, particle.spin);
            this.dummy.scale.setScalar(particle.size*Math.min(1, (particle.lifetime - particle.age) * 7));
            this.dummy.updateMatrix(); this.crumbs.setMatrixAt(particleCount++, this.dummy.matrix);
        }
        for(let slot=0;slot<40;slot++){
            const mark=this.marks[(this.markCursor+slot)%40];
            if((mark.age+=dt)>=3)continue;
            this.dummy.position.copy(mark.position); this.dummy.quaternion.copy(mark.rotation);
            const grow = 0.4 + 0.6 * Math.min(1, mark.age / 0.07);
            const shrink = Math.min(1, (3 - mark.age) / 0.4);
            this.dummy.scale.setScalar(mark.size * grow * shrink);
            this.dummy.updateMatrix(); this.splats.setMatrixAt(markCount++, this.dummy.matrix);
        }
        this.crumbs.count=particleCount;this.splats.count=markCount;
        this.active=particleCount+markCount>0;
        this.crumbs.instanceMatrix.needsUpdate = this.splats.instanceMatrix.needsUpdate = true;
    }

    clear(): void {
        for(const particle of this.particles)particle.age=Infinity;
        for(const mark of this.marks)mark.age=Infinity;
        this.active=false;this.particleCursor=this.markCursor=0;this.crumbs.count=this.splats.count=0;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.clear(); this.root.removeFromParent();
        this.crumbs.dispose(); this.splats.dispose();
        this.crumbGeometry.dispose(); this.splatGeometry.dispose();
        this.crumbMaterial.dispose(); this.splatMaterial.dispose();
    }
}
