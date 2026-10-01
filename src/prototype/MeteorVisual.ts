import * as THREE from 'three';
import {INCIDENT_TUNING as I,METEOR_KEEP_MS,type Meteor} from '../shared/chaosState';

/** Meteors in the air at once (falling plus just landed). */
const POOL=I.meteorMax*2;
/** How high above its landing a meteor first shows, and how far it slants in from the side (per unit of height). */
const HEIGHT=150,SLANT=.42;
/** The meteor's size (a giant wheel-chunk of cheese) and its fiery trail's length. */
const SIZE=2.4,TRAIL=26;
const NONE:readonly Meteor[]=[];
const SMOKE=160;

/** A radial alpha falloff for the trail glow and the smoke. */
function falloff():THREE.DataTexture {
    const size=64,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,a=Math.max(0,1-Math.hypot(u,v));
        data.set([255,255,255,Math.round(255*a*a)],(y*size+x)*4);
    }
    const texture=new THREE.DataTexture(data,size,size);texture.needsUpdate=true;return texture;
}
/** The trail: bright at its head (v=1), fading to nothing at its tail, soft at the sides. */
function streak():THREE.DataTexture {
    const size=64,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=(x+.5)/size,v=(y+.5)/size,side=Math.sin(u*Math.PI);
        data.set([255,255,255,Math.round(255*side*v**1.6)],(y*size+x)*4);
    }
    const texture=new THREE.DataTexture(data,size,size);texture.needsUpdate=true;return texture;
}
/** The warning shadow: a dark ragged disc with a darker core and a broken hazard ring at its edge (not a glow). */
function shadow():THREE.DataTexture {
    const size=128,data=new Uint8Array(size*size*4);let seed=31;
    const noise=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),angle=Math.atan2(v,u);
        const edge=.86+.05*Math.sin(angle*9)+.03*noise();
        let a=r<edge?.55+.4*(1-r/edge)**.7:0,red=0;
        // Hazard ring: dashes of brick red just inside the rim.
        if(r>edge-.09&&r<edge-.02&&Math.sin(angle*14)>-.2){a=.85;red=1;}
        data.set(red?[150,32,18,Math.round(255*a)]:[8,6,5,Math.round(255*a)],(y*size+x)*4);
    }
    const texture=new THREE.DataTexture(data,size,size);texture.needsUpdate=true;return texture;
}
/** The scorch a meteor leaves: a burnt ragged disc with streaks blasted outward and gobs of melted cheese around it. */
function scorch():THREE.DataTexture {
    const size=128,data=new Uint8Array(size*size*4);let seed=53;
    const noise=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
    const gobs=Array.from({length:9},(_,i)=>{const a=i*.7+noise()*.4,r=.62+noise()*.25;return {x:Math.cos(a)*r,y:Math.sin(a)*r,s:.06+noise()*.06};});
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),angle=Math.atan2(v,u);
        const reach=.55+.25*Math.max(0,Math.sin(angle*7))**3+.04*noise();
        let rgba=[12,9,7,r<reach?Math.round(255*Math.min(1,(reach-r)*5)*.92):0];
        for(const g of gobs)if(Math.hypot(u-g.x,v-g.y)<g.s)rgba=[236,176,58,235];
        data.set(rgba,(y*size+x)*4);
    }
    const texture=new THREE.DataTexture(data,size,size);texture.needsUpdate=true;return texture;
}
/** Scorches kept at once, and how long one lasts (s). */
const SCORCHES=10,SCORCH_LIFE=14;
/** A lumpy chunk of cheese with dark pores (vertex colours), flat-shaded so it reads from across the city. */
function rock():THREE.BufferGeometry {
    const geometry=new THREE.IcosahedronGeometry(1,2),p=geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors=new Float32Array(p.count*3),v=new THREE.Vector3();
    const pores=[new THREE.Vector3(.6,.5,.4),new THREE.Vector3(-.5,.2,.7),new THREE.Vector3(.1,-.8,.3),new THREE.Vector3(-.4,-.3,-.7),new THREE.Vector3(.7,-.2,-.5)].map(q=>q.normalize());
    for(let i=0;i<p.count;i++){
        v.fromBufferAttribute(p,i).normalize();
        let pore=0;for(const q of pores)pore=Math.max(pore,v.dot(q));
        const dent=pore>.93?.78:1,bump=1+.12*Math.sin(v.x*5.1+v.y*3.7)*Math.cos(v.z*4.3);
        v.multiplyScalar(bump*dent);p.setXYZ(i,v.x,v.y*.8,v.z);
        const c=pore>.93?.55:1;colors.set([1*c,.78*c,.28*c],i*3);
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();
    return geometry;
}

interface View {
    id:string;root:THREE.Group;rock:THREE.Mesh;trail:THREE.Mesh;flame:THREE.Mesh;shadow:THREE.Mesh;ring:THREE.Mesh;
    shadowMaterial:THREE.MeshBasicMaterial;ringMaterial:THREE.MeshBasicMaterial;
    target:THREE.Vector3;from:THREE.Vector3;spin:THREE.Vector3;warned:boolean;landed:boolean;smokeDebt:number;
}
interface Puff {p:THREE.Vector3;age:number;life:number;size:number}

/** Cheddar Shower meteors (presentation only): each falls from high on a slant with a fiery emissive trail and smoke,
 * its shadow growing darker and wider on the spot it will hit; at the impact a cheese-cream shock ring runs out to
 * the blast's reach. Emissive and transparent geometry only, no lights. `onWarn` fires once per meteor (with its
 * seconds left), `onImpact` once when the playback reaches its landing. */
export class MeteorVisual {
    readonly root=new THREE.Group();
    onWarn?:(at:THREE.Vector3,seconds:number)=>void;
    onImpact?:(at:THREE.Vector3)=>void;
    private readonly views:View[]=[];
    private readonly puffs:Puff[]=Array.from({length:SMOKE},()=>({p:new THREE.Vector3(),age:Infinity,life:1,size:1}));
    private puffCursor=0;
    private readonly smoke:THREE.InstancedMesh;
    private readonly owned:{dispose():void}[]=[];
    private readonly dummy=new THREE.Object3D();
    private readonly up=new THREE.Vector3(0,1,0);
    private readonly direction=new THREE.Vector3();
    private readonly scorches:{mesh:THREE.Mesh;material:THREE.MeshBasicMaterial;age:number}[]=[];
    private scorchCursor=0;
    private lastNow=NaN;
    constructor(scene:THREE.Scene){
        this.root.name='cheddar-shower-meteors';this.root.userData.noNoir=true;
        const glowTexture=falloff(),streakTexture=streak(),shadowTexture=shadow(),scorchTexture=scorch(),rockGeometry=rock();
        const trailGeometry=new THREE.CylinderGeometry(.15,1,1,14,1,true).translate(0,.5,0);
        const plane=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),ringGeometry=new THREE.RingGeometry(.86,1,48).rotateX(-Math.PI/2);
        const rockMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75,flatShading:true,emissive:0xb83c0c,emissiveIntensity:1.1});
        const trailMaterial=new THREE.MeshBasicMaterial({map:streakTexture,color:0xff7a20,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
        const flameMaterial=new THREE.MeshBasicMaterial({map:streakTexture,color:0xffe08a,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
        this.owned.push(glowTexture,streakTexture,shadowTexture,scorchTexture,rockGeometry,trailGeometry,plane,ringGeometry,rockMaterial,trailMaterial,flameMaterial);
        for(let i=0;i<SCORCHES;i++){
            const material=new THREE.MeshBasicMaterial({map:scorchTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
            const mesh=new THREE.Mesh(plane,material);mesh.name='meteor-scorch';mesh.visible=false;mesh.renderOrder=1;
            this.root.add(mesh);this.owned.push(material);this.scorches.push({mesh,material,age:Infinity});
        }
        for(let i=0;i<POOL;i++){
            const view:View={id:'',root:new THREE.Group(),rock:new THREE.Mesh(rockGeometry,rockMaterial),trail:new THREE.Mesh(trailGeometry,trailMaterial),flame:new THREE.Mesh(trailGeometry,flameMaterial),
                shadow:new THREE.Mesh(plane,undefined),ring:new THREE.Mesh(ringGeometry,undefined),
                shadowMaterial:new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),
                ringMaterial:new THREE.MeshBasicMaterial({color:0xf3e2b4,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5}),
                target:new THREE.Vector3(),from:new THREE.Vector3(),spin:new THREE.Vector3(),warned:false,landed:false,smokeDebt:0};
            view.shadow.material=view.shadowMaterial;view.ring.material=view.ringMaterial;
            view.rock.scale.setScalar(SIZE);view.root.add(view.rock,view.trail,view.flame);
            view.shadow.renderOrder=1;view.ring.renderOrder=2;
            for(const object of [view.root,view.shadow,view.ring]){object.visible=false;object.frustumCulled=false;this.root.add(object);}
            this.owned.push(view.shadowMaterial,view.ringMaterial);this.views.push(view);
        }
        const smokeGeometry=new THREE.PlaneGeometry(1,1),smokeMaterial=new THREE.MeshBasicMaterial({map:glowTexture,color:0x5a4a3c,transparent:true,opacity:.55,depthWrite:false});
        this.smoke=new THREE.InstancedMesh(smokeGeometry,smokeMaterial,SMOKE);this.smoke.count=0;this.smoke.frustumCulled=false;this.smoke.name='meteor-smoke';
        this.root.add(this.smoke);this.owned.push(smokeGeometry,smokeMaterial);
        scene.add(this.root);
    }
    /** Each frame with the snapshot's meteors at the presented server time `now` (ms). */
    update(meteors:readonly Meteor[]|undefined,now:number,camera:THREE.Camera):void {
        const dt=Number.isFinite(this.lastNow)?Math.min(.1,Math.max(0,(now-this.lastNow)/1000)):0;this.lastNow=now;
        const list=meteors??NONE;
        for(const view of this.views){
            if(!view.id)continue;
            let live=false;for(const m of list)if(m.id===view.id){live=true;break;}
            if(!live){view.id='';view.root.visible=view.shadow.visible=view.ring.visible=false;}
        }
        for(const m of list){
            let view:View|undefined,free:View|undefined;
            for(const v of this.views){if(v.id===m.id){view=v;break;}if(!v.id)free??=v;}
            if(!view){if(!free)continue;view=free;this.begin(view,m,now);}
            this.pose(view,m,now,dt);
        }
        this.updateSmoke(dt,camera);
        for(const s of this.scorches){
            if(!s.mesh.visible)continue;
            s.age+=dt;s.material.opacity=Math.min(1,(SCORCH_LIFE-s.age)/3);
            if(s.age>=SCORCH_LIFE)s.mesh.visible=false;
        }
    }
    private begin(view:View,m:Meteor,now:number):void {
        view.id=m.id;view.warned=false;view.landed=now>=m.at;view.smokeDebt=0;
        // Each meteor comes in from its own side, chosen by its id so every client sees the same sky.
        let hash=0;for(let i=0;i<m.id.length;i++)hash=(hash*31+m.id.charCodeAt(i))>>>0;
        const angle=(hash%6283)/1000;
        view.target.set(m.x,m.y,m.z);
        view.from.set(m.x+Math.cos(angle)*HEIGHT*SLANT,m.y+HEIGHT,m.z+Math.sin(angle)*HEIGHT*SLANT);
        view.spin.set(1.3+(hash%7)*.2,.8+(hash%5)*.3,1+(hash%3)*.4);
        view.shadow.position.set(m.x,m.y+.04,m.z);view.ring.position.set(m.x,m.y+.06,m.z);
    }
    private pose(view:View,m:Meteor,now:number,dt:number):void {
        const span=Math.max(1,m.at-m.born),u=Math.max(0,Math.min(1,(now-m.born)/span)),left=(m.at-now)/1000;
        if(!view.warned&&!view.landed&&left>.3){view.warned=true;this.onWarn?.(view.target,left);}
        if(!view.landed&&now>=m.at){
            view.landed=true;this.onImpact?.(view.target);
            const s=this.scorches[this.scorchCursor++%SCORCHES]!;
            s.mesh.position.set(m.x,m.y+.03,m.z);s.mesh.rotation.y=Math.random()*Math.PI*2;s.mesh.scale.setScalar(I.meteorRadius*3.2);
            s.mesh.visible=true;s.material.opacity=1;s.age=0;
        }
        // The shadow darkens and widens as the meteor comes down, pulsing faster near the end; it lifts at the impact.
        const pulse=1+.06*Math.sin(now*.001*(6+u*22));
        view.shadow.visible=!view.landed;
        if(!view.landed){
            view.shadow.scale.setScalar(I.meteorRadius*2*(.45+.75*u)*pulse);
            view.shadowMaterial.opacity=.25+.75*u;
        }
        // The impact's shock ring runs out to the blast's reach and fades.
        const after=(now-m.at)/METEOR_KEEP_MS;
        view.ring.visible=view.landed&&after<1;
        if(view.ring.visible){view.ring.scale.setScalar(I.meteorRadius+(I.meteorBlast-I.meteorRadius)*Math.min(1,after*1.6));view.ringMaterial.opacity=.85*(1-after);}
        view.root.visible=!view.landed;
        if(view.landed)return;
        // Falling ever faster down the slant, tumbling, its trail streaming back up the way it came.
        const fall=u**1.7;
        view.root.position.lerpVectors(view.from,view.target,fall).addScaledVector(this.up,SIZE*.8*fall);
        view.rock.rotation.set(view.spin.x*now*.001,view.spin.y*now*.001,view.spin.z*now*.001);
        this.direction.subVectors(view.from,view.target).normalize();
        const length=TRAIL*(.5+.7*u);
        view.trail.quaternion.setFromUnitVectors(this.up,this.direction);view.flame.quaternion.copy(view.trail.quaternion);
        view.trail.scale.set(SIZE*1.15,length,SIZE*1.15);view.flame.scale.set(SIZE*.7,length*.55,SIZE*.7);
        view.smokeDebt+=dt*40;
        while(view.smokeDebt>=1){
            view.smokeDebt--;
            const puff=this.puffs[this.puffCursor++%SMOKE]!;
            puff.p.copy(view.root.position).addScaledVector(this.direction,SIZE*(1+Math.random()*2));
            puff.p.x+=(Math.random()-.5)*SIZE;puff.p.z+=(Math.random()-.5)*SIZE;
            puff.age=0;puff.life=1.4+Math.random();puff.size=SIZE*(.8+Math.random()*.8);
        }
    }
    private updateSmoke(dt:number,camera:THREE.Camera):void {
        let count=0;
        for(const puff of this.puffs){
            if((puff.age+=dt)>=puff.life)continue;
            const t=puff.age/puff.life;
            puff.p.y+=dt*1.5;
            this.dummy.position.copy(puff.p);this.dummy.quaternion.copy(camera.quaternion);
            this.dummy.scale.setScalar(puff.size*(1+t*1.8)*(1-t*.3));this.dummy.updateMatrix();
            this.smoke.setMatrixAt(count++,this.dummy.matrix);
        }
        this.smoke.count=count;this.smoke.visible=count>0;if(count)this.smoke.instanceMatrix.needsUpdate=true;
    }
    clear():void {
        for(const view of this.views){view.id='';view.root.visible=view.shadow.visible=view.ring.visible=false;}
        for(const puff of this.puffs)puff.age=Infinity;
        for(const s of this.scorches){s.mesh.visible=false;s.age=Infinity;}
        this.smoke.count=0;this.smoke.visible=false;this.lastNow=NaN;
    }
    dispose():void {this.clear();this.root.removeFromParent();this.smoke.dispose();for(const resource of this.owned)resource.dispose();this.owned.length=0;}
}
