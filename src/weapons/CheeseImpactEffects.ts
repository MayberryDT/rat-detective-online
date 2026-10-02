import * as THREE from 'three';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';
import {freezeStatic} from '../utils/freezeStatic';
import {CASE_RED} from '../prototype/caseRed';

/** Clarity batch visual budget (protocol 29): crumbs 160 → 96, wall splats 40 → 24, drips 60 → 32 at once. */
const CRUMBS=96,MARKS=24;
const DRIPS=32;
const SPARKS=48;

/** Bounded, cosmetic-only crumbs and surface splashes; no physics bodies or aim targets. */
export class CheeseImpactEffects {
    private readonly root = new THREE.Group();
    private readonly crumbGeometry = new THREE.SphereGeometry(0.03, 6, 4);
    private readonly crumbMaterial = new THREE.MeshStandardMaterial({color: 0xffc24d, emissive: 0xe79b20, emissiveIntensity: 0.4, roughness: 0.7});
    private readonly splatGeometry;
    private readonly splatMaterial = new THREE.MeshBasicMaterial({color: 0xdba32f, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true});
    private readonly crumbs = new THREE.InstancedMesh(this.crumbGeometry, this.crumbMaterial, CRUMBS);
    private readonly splats;
    private readonly particles = Array.from({length:CRUMBS},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),age:Infinity,lifetime:0,spin:0,size:1}));
    private particleCursor=0;
    private readonly marks = Array.from({length:MARKS},()=>({position:new THREE.Vector3(),rotation:new THREE.Quaternion(),age:Infinity,size:0,life:3}));
    /** Polish 5: runs of cheese sliding down walls under fresh splats. */
    private readonly dripGeometry = new THREE.PlaneGeometry(1, 1).translate(0, -.5, 0);
    private readonly drips = new THREE.InstancedMesh(this.dripGeometry, this.splatMaterial, DRIPS);
    private readonly dripSlots = Array.from({length:DRIPS},()=>({position:new THREE.Vector3(),rotation:new THREE.Quaternion(),age:Infinity,life:0,length:0,width:0}));
    private dripCursor=0;
    /** Polish 7: silver sparks when cheese glances off an Ironclad coat. */
    private readonly sparkGeometry = new THREE.BoxGeometry(.04, .04, 1);
    private readonly sparkMaterial = new THREE.MeshBasicMaterial({color: 0xf2f6ff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false});
    private readonly sparks = new THREE.InstancedMesh(this.sparkGeometry, this.sparkMaterial, SPARKS);
    private readonly sparkSlots = Array.from({length:SPARKS},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),age:Infinity,life:0,hot:false}));
    /** Per-spark tint: Ironclad silver, or (K3) the case red off a carrier's hit. */
    private readonly sparkSilver = new THREE.Color(1, 1, 1);
    private readonly sparkHot = new THREE.Color(CASE_RED);
    private sparkCursor=0;
    private readonly look=new THREE.Vector3();
    private readonly basis=new THREE.Matrix4();
    private readonly up=new THREE.Vector3();
    private readonly side=new THREE.Vector3();
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
        this.splats = new THREE.InstancedMesh(this.splatGeometry, this.splatMaterial, MARKS);
        this.root.name = 'cheese-impact-effects';this.root.userData.noNoir = true;
        this.crumbs.count = this.splats.count = this.drips.count = this.sparks.count = 0;
        this.sparks.setColorAt(0, this.sparkSilver);
        this.crumbs.visible = this.splats.visible = this.drips.visible = this.sparks.visible = false;
        this.crumbs.frustumCulled = this.splats.frustumCulled = this.drips.frustumCulled = this.sparks.frustumCulled = false;
        this.root.add(this.crumbs, this.splats, this.drips, this.sparks); freezeStatic(this.root); scene.add(this.root);
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
            const particle=this.particles[this.particleCursor++%CRUMBS];
            particle.velocity.copy(this.normal).multiplyScalar((1.5+(i%3)*.6)*Math.min(2.4,size))
                .addScaledVector(this.tangent,Math.cos(angle)*2.2*Math.min(2.2,size))
                .addScaledVector(this.bitangent,Math.sin(angle)*2.2*Math.min(2.2,size));
            particle.position.copy(point).addScaledVector(this.normal,.04*size);
            particle.age=0;particle.lifetime=.5+i*.05;particle.spin=angle;particle.size=Math.min(3.2,.7+size*.35);
        }
        if(surface){
            const polish=feelState().on('splats'),p=FEEL.splats.params;
            const mark=this.marks[this.markCursor++%MARKS];
            mark.rotation.setFromUnitVectors(this.axis,this.normal);
            mark.rotation.multiply(this.twist.setFromAxisAngle(this.axis,phase));
            mark.position.copy(point).addScaledVector(this.normal,.035);
            mark.age=0;mark.size=(.7+(this.sequence%3)*.15)*size*(polish?p.size:1);mark.life=polish?p.life:3;
            if(polish&&Math.abs(this.normal.y)<.6)this.emitDrips(point,mark.size,p);
        }
        // Emission only fills bounded slots. The frame owner flushes all impacts once.
        this.active=true;
    }

    update(dt: number): void {
        if(this.disposed||!this.active)return;
        let particleCount=0,markCount=0;
        // Ring order preserves oldest-to-newest draw order when slots wrap.
        for(let slot=0;slot<CRUMBS;slot++){
            const particle=this.particles[(this.particleCursor+slot)%CRUMBS];
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
        for(let slot=0;slot<MARKS;slot++){
            const mark=this.marks[(this.markCursor+slot)%MARKS];
            if((mark.age+=dt)>=mark.life)continue;
            this.dummy.position.copy(mark.position); this.dummy.quaternion.copy(mark.rotation);
            const grow = 0.4 + 0.6 * Math.min(1, mark.age / 0.07);
            const shrink = Math.min(1, (mark.life - mark.age) / 0.4);
            this.dummy.scale.setScalar(mark.size * grow * shrink);
            this.dummy.updateMatrix(); this.splats.setMatrixAt(markCount++, this.dummy.matrix);
        }
        let dripCount=0;
        for(let slot=0;slot<DRIPS;slot++){
            const drip=this.dripSlots[(this.dripCursor+slot)%DRIPS];
            if((drip.age+=dt)>=drip.life)continue;
            // Ease out: a quick first run, then a slow creep, then fade with its splat.
            const run=1-Math.pow(1-Math.min(1,drip.age/(drip.life*.55)),3);
            const fade=Math.min(1,(drip.life-drip.age)/.4);
            this.dummy.position.copy(drip.position);this.dummy.quaternion.copy(drip.rotation);
            this.dummy.scale.set(drip.width*fade,Math.max(.001,drip.length*run),1);
            this.dummy.updateMatrix();this.drips.setMatrixAt(dripCount++,this.dummy.matrix);
        }
        let sparkCount=0;
        for(let slot=0;slot<SPARKS;slot++){
            const spark=this.sparkSlots[(this.sparkCursor+slot)%SPARKS];
            if((spark.age+=dt)>=spark.life)continue;
            spark.velocity.y-=dt*6;spark.velocity.multiplyScalar(Math.exp(-3*dt));
            spark.position.addScaledVector(spark.velocity,dt);
            // Stretch along travel so each spark reads as a streak.
            this.dummy.position.copy(spark.position);
            this.dummy.lookAt(this.look.copy(spark.position).add(spark.velocity));
            const fade=1-spark.age/spark.life;
            this.dummy.scale.set(fade,fade,Math.max(.02,spark.velocity.length()*.055*fade));
            this.dummy.updateMatrix();this.sparks.setColorAt(sparkCount,spark.hot?this.sparkHot:this.sparkSilver);this.sparks.setMatrixAt(sparkCount++,this.dummy.matrix);
        }
        this.crumbs.count=particleCount;this.splats.count=markCount;this.drips.count=dripCount;this.sparks.count=sparkCount;
        // Empty pools skip the draw setup entirely.
        this.crumbs.visible=particleCount>0;this.splats.visible=markCount>0;this.drips.visible=dripCount>0;this.sparks.visible=sparkCount>0;
        this.active=particleCount+markCount+dripCount+sparkCount>0;
        this.crumbs.instanceMatrix.needsUpdate = this.splats.instanceMatrix.needsUpdate = this.drips.instanceMatrix.needsUpdate = this.sparks.instanceMatrix.needsUpdate = true;
        if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = sparkCount > 0;
    }

    /** A bright burst off an Ironclad coat at `point`, sprayed around `normal`. `hot` (K3): a carrier's hit instead,
     * `hotCase.sparks` case-red sparks flung faster. */
    spark(point: THREE.Vector3, normal: THREE.Vector3, hot = false): void {
        if (this.disposed || !feelState().on(hot ? 'hotCase' : 'ironcladSparks')) return;
        const p=FEEL.ironcladSparks.params,speedUp=hot?1.3:1;
        this.normal.copy(normal).normalize();
        this.tangent.set(Math.abs(this.normal.y) < 0.9 ? 0 : 1, Math.abs(this.normal.y) < 0.9 ? 1 : 0, 0).cross(this.normal).normalize();
        this.bitangent.crossVectors(this.normal, this.tangent);
        const count=Math.max(1,Math.min(SPARKS/2,Math.round(hot?FEEL.hotCase.params.sparks:p.count))),phase=++this.sequence*2.39996;
        for(let i=0;i<count;i++){
            const spark=this.sparkSlots[this.sparkCursor++%SPARKS],angle=phase+i*2.39996,speed=p.speed*speedUp*(.6+.4*((i*7)%5)/4);
            spark.velocity.copy(this.normal).multiplyScalar(speed*.8)
                .addScaledVector(this.tangent,Math.cos(angle)*speed*.7).addScaledVector(this.bitangent,Math.sin(angle)*speed*.7);
            spark.position.copy(point);spark.age=0;spark.life=p.life*(.7+.3*((i*3)%4)/3);spark.hot=hot;
        }
        this.active=true;
    }

    /** Hang 1–N runs from the lower half of a wall splat, oriented down the wall. */
    private emitDrips(point:THREE.Vector3,size:number,p:typeof FEEL.splats.params):void {
        this.up.set(0,1,0).addScaledVector(this.normal,-this.normal.y).normalize();
        this.side.crossVectors(this.up,this.normal);
        this.basis.makeBasis(this.side,this.up,this.normal);
        const count=1+(this.sequence%Math.max(1,Math.round(p.drips)));
        for(let i=0;i<count;i++){
            const drip=this.dripSlots[this.dripCursor++%DRIPS];
            const offset=(((this.sequence*7+i*13)%10)/10-.5)*.28*size;
            drip.position.copy(point).addScaledVector(this.normal,.037).addScaledVector(this.side,offset).addScaledVector(this.up,-.06*size);
            drip.rotation.setFromRotationMatrix(this.basis);
            drip.age=0;drip.life=p.life;drip.width=(.05+.02*((this.sequence+i)%3))*size;
            drip.length=p.dripLength*size*(.6+.4*(((this.sequence+i*5)%7)/6));
        }
    }

    clear(): void {
        for(const particle of this.particles)particle.age=Infinity;
        for(const mark of this.marks)mark.age=Infinity;
        for(const drip of this.dripSlots)drip.age=Infinity;
        for(const spark of this.sparkSlots)spark.age=Infinity;
        this.active=false;this.particleCursor=this.markCursor=this.dripCursor=this.sparkCursor=0;this.crumbs.count=this.splats.count=this.drips.count=this.sparks.count=0;
        this.crumbs.visible=this.splats.visible=this.drips.visible=this.sparks.visible=false;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.clear(); this.root.removeFromParent();
        this.crumbs.dispose(); this.splats.dispose(); this.drips.dispose(); this.sparks.dispose();
        this.crumbGeometry.dispose(); this.splatGeometry.dispose(); this.dripGeometry.dispose(); this.sparkGeometry.dispose();
        this.crumbMaterial.dispose(); this.splatMaterial.dispose(); this.sparkMaterial.dispose();
    }
}
