import * as THREE from 'three';

const SAMPLES=32, TRAIL_SECONDS=.45;
/** Bounded world-space ribbon and a brief upward healing sweep. No lights,
 * shadow passes, per-frame meshes or through-wall rendering. */
export class RatPowerupEffects {
    private readonly trailGeometry=new THREE.BufferGeometry();
    private readonly positions=new Float32Array(SAMPLES*4*3);
    private readonly strengths=new Float32Array(SAMPLES*4);
    private readonly points=Array.from({length:SAMPLES},()=>({p:new THREE.Vector3(),at:-Infinity}));
    private count=0;
    private time=0;
    private lastSample=-Infinity;
    private readonly trailMaterial=new THREE.ShaderMaterial({
        transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
        vertexShader:`attribute float strength;varying float glow;void main(){glow=strength;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`varying float glow;void main(){gl_FragColor=vec4(1.,.018,.004,glow*.65);}`,
    });
    readonly trail=new THREE.Mesh(this.trailGeometry,this.trailMaterial);
    private readonly healMaterial=new THREE.MeshBasicMaterial({color:0x63ff9a,transparent:true,opacity:0,
        depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    readonly wave=new THREE.Mesh(new THREE.TorusGeometry(.75,.055,8,40),this.healMaterial);
    private healing=0;
    private applying=0;
    private readonly applyMaterial=new THREE.MeshBasicMaterial({color:0xd9eeff,transparent:true,opacity:0,
        depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    readonly applyWave=new THREE.Mesh(new THREE.TorusGeometry(.72,.09,8,40),this.applyMaterial);
    private readonly root=new THREE.Group();
    constructor(private readonly scene:THREE.Scene){
        this.trailGeometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
        this.trailGeometry.setAttribute('strength',new THREE.BufferAttribute(this.strengths,1).setUsage(THREE.DynamicDrawUsage));
        const indices:number[]=[];
        for(let i=0;i<SAMPLES-1;i++)for(const offset of [0,2]){const a=i*4+offset;indices.push(a,a+1,a+4,a+1,a+5,a+4);}
        this.trailGeometry.setIndex(indices);this.trailGeometry.setDrawRange(0,0);
        this.trail.name='hot-pursuit-trail';this.trail.frustumCulled=false;this.trail.raycast=()=>{};
        this.wave.name='quick-fix-wave';this.wave.rotation.x=-Math.PI/2;this.wave.raycast=()=>{};
        this.applyWave.name='pickup-application-wave';this.applyWave.rotation.x=-Math.PI/2;this.applyWave.raycast=()=>{};
        this.trail.visible=this.wave.visible=this.applyWave.visible=false;this.root.add(this.applyWave);this.root.name="rat-powerup-effects";this.root.add(this.trail,this.wave);
    }
    heal():void {this.healing=.7;}
    apply(kind:'ironclad'|'hustle'):void {this.applying=.42;this.applyMaterial.color.setHex(kind==='ironclad'?0xd9eeff:0xff2108);}
    clear():void {this.root.removeFromParent();this.count=0;this.healing=0;this.applying=0;this.lastSample=-Infinity;this.trail.visible=this.wave.visible=this.applyWave.visible=false;this.trailGeometry.setDrawRange(0,0);}
    update(dt:number,position:THREE.Vector3,hustle:boolean):void {
        this.time+=Math.min(dt,.1);
        if(this.count&&this.points[0].p.distanceToSquared(position)>64)this.clear();
        if(hustle&&this.time-this.lastSample>=.015&&(!this.count||this.points[0].p.distanceToSquared(position)>.015)){
            for(let i=Math.min(this.count,SAMPLES-1);i>0;i--){this.points[i].p.copy(this.points[i-1].p);this.points[i].at=this.points[i-1].at;}
            this.points[0].p.copy(position);this.points[0].at=this.time;this.count=Math.min(SAMPLES,this.count+1);this.lastSample=this.time;
        }
        while(this.count&&this.time-this.points[this.count-1].at>TRAIL_SECONDS)this.count--;
        this.trail.visible=hustle&&this.count>1;
        if(!hustle)this.count=0;
        if(this.trail.visible){
            for(let i=0;i<this.count;i++){
                const point=this.points[i],fade=Math.max(0,1-(this.time-point.at)/TRAIL_SECONDS),height=.8*fade;
                const next=this.points[Math.min(i+1,this.count-1)].p,previous=this.points[Math.max(0,i-1)].p;
                const dx=next.x-previous.x,dz=next.z-previous.z,length=Math.hypot(dx,dz)||1;
                for(let side=0;side<4;side++){
                    const index=i*4+side,sign=side%2?1:-1,offset=index*3;
                    this.positions[offset]=point.p.x+(side>=2?-dz/length*height*sign:0);
                    this.positions[offset+1]=point.p.y+1+(side<2?height*sign:0);
                    this.positions[offset+2]=point.p.z+(side>=2?dx/length*height*sign:0);
                    this.strengths[index]=fade*fade;
                }
            }
            this.trailGeometry.attributes.position.needsUpdate=true;this.trailGeometry.attributes.strength.needsUpdate=true;
            this.trailGeometry.setDrawRange(0,(this.count-1)*12);
        }
        this.healing=Math.max(0,this.healing-dt);this.wave.visible=this.healing>0;
        if(this.wave.visible){
            const progress=1-this.healing/.7;
            this.wave.position.copy(position);this.wave.position.y+=.1+progress*2.7;
            this.wave.scale.setScalar(.8+Math.sin(progress*Math.PI)*.4);
            this.healMaterial.opacity=Math.sin(progress*Math.PI)*.9;
        }
        this.applying=Math.max(0,this.applying-dt);this.applyWave.visible=this.applying>0;
        if(this.applyWave.visible){
            const t=1-this.applying/.42;
            this.applyWave.position.copy(position);this.applyWave.position.y+=.15+t*2.7;
            this.applyWave.scale.setScalar(.65+Math.sin(t*Math.PI)*.5);
            this.applyMaterial.opacity=Math.sin(t*Math.PI);
        }
        if(this.trail.visible||this.wave.visible||this.applyWave.visible){if(!this.root.parent)this.scene.add(this.root);}
        else this.root.removeFromParent();
    }
    dispose():void {this.root.removeFromParent();this.trail.removeFromParent();this.wave.removeFromParent();this.trailGeometry.dispose();this.trailMaterial.dispose();this.wave.geometry.dispose();this.healMaterial.dispose();this.applyWave.geometry.dispose();this.applyMaterial.dispose();}
}
