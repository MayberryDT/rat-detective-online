import * as THREE from 'three';
import {LANDMARK_INTERIORS} from '../shared/landmarkLayout';
import {STREET_LAMP_HEIGHT,type StreetLampPosition} from '../shared/streetLampLayout';
import {feelState} from './feelState';
import {FEEL} from './feelTuning';
import {GRAPHICS} from '../session/graphicsQuality';
import {freezeStatic} from '../utils/freezeStatic';

const HAZE_SLOTS=16;

/** Additive light-shaft material: brightest at the source, soft at the edges. */
function shaftMaterial(color:number):{material:THREE.ShaderMaterial;opacity:{value:number}} {
    const opacity={value:0};
    const material=new THREE.ShaderMaterial({
        uniforms:{shaftColor:{value:new THREE.Color(color)},shaftOpacity:opacity},
        vertexShader:`varying float vAlong;varying vec3 vNormal;varying vec3 vView;
            void main(){vAlong=clamp(-position.y/SHAFT_LENGTH,0.,1.);
                vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);
                vNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);vView=normalize(cameraPosition-world.xyz);
                gl_Position=projectionMatrix*viewMatrix*world;}`,
        fragmentShader:`uniform vec3 shaftColor;uniform float shaftOpacity;varying float vAlong;varying vec3 vNormal;varying vec3 vView;
            void main(){float edge=pow(abs(dot(normalize(vNormal),normalize(vView))),1.6);
                float fall=pow(1.-vAlong,1.4);gl_FragColor=vec4(shaftColor*shaftOpacity*edge*fall,1.);}`,
        transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false,
    });
    return {material,opacity};
}

/** Noir N4 (haze) and N8 (searchlights and lightning). Haze: soft light cones
 * under the nearest streetlamps and a little more cold fog. Searchlights: slow
 * beams sweeping over the landmark roofs. Lightning: an occasional double flash
 * that briefly lifts the sky and ambient light, followed by distant thunder.
 * No new lights; the flash scales the existing hemisphere light. A Blackout
 * sinks the stage's ambient, hemisphere and moon light, the fog and the sky to
 * black, and stops the lightning. */
export class NoirAtmosphere {
    readonly root=new THREE.Group();
    private readonly haze:THREE.InstancedMesh;
    private readonly hazeOpacity:{value:number};
    private readonly beams:THREE.InstancedMesh;
    private readonly beamOpacity:{value:number};
    private readonly lamps:THREE.Vector3[];
    private readonly beamOrigins:THREE.Vector3[];
    private readonly dummy=new THREE.Object3D();
    private hemisphere?:THREE.HemisphereLight;
    private readonly baseHemisphere:number;
    private ambient?:THREE.AmbientLight;
    private readonly baseAmbient:number;
    private moon?:THREE.DirectionalLight;
    private readonly baseMoon:number;
    private readonly fog?:THREE.FogExp2;
    private readonly baseFog:number;
    private readonly baseFogColor=new THREE.Color();
    private readonly coldFog=new THREE.Color(0x0c0d18);
    private readonly background?:THREE.Color;
    private readonly baseBackground=new THREE.Color();
    private readonly flashSky=new THREE.Color(0x5a6278);
    private readonly grey=new THREE.Color();
    private nearestAt=Infinity;private time=0;private nextStrike=25;private strikeAge=Infinity;private seed=97531;
    /** Set when thunder should roll (seconds of delay); consumed by the director. */
    thunderIn=-1;

    constructor(scene:THREE.Scene,lamps:readonly StreetLampPosition[]){
        this.root.name='noir-atmosphere';this.root.userData.noNoir=true;
        this.lamps=lamps.map(([x,z])=>new THREE.Vector3(x,STREET_LAMP_HEIGHT+.1,z));
        const hazeLength=STREET_LAMP_HEIGHT;
        const cone=new THREE.ConeGeometry(3.4,hazeLength,24,1,true).translate(0,-hazeLength/2,0);
        const haze=shaftMaterial(0xffd6a0);
        haze.material.vertexShader=haze.material.vertexShader.replace('SHAFT_LENGTH',hazeLength.toFixed(2));
        this.haze=new THREE.InstancedMesh(cone,haze.material,HAZE_SLOTS);this.hazeOpacity=haze.opacity;
        const beamLength=150;
        const beamGeometry=new THREE.ConeGeometry(7,beamLength,24,1,true).translate(0,-beamLength/2,0);
        const beam=shaftMaterial(0xcfd8ff);
        beam.material.vertexShader=beam.material.vertexShader.replace('SHAFT_LENGTH',beamLength.toFixed(2));
        this.beamOrigins=LANDMARK_INTERIORS.slice(0,3).map(hall=>new THREE.Vector3(hall.cx,36.5,hall.cz));
        this.beams=new THREE.InstancedMesh(beamGeometry,beam.material,this.beamOrigins.length);this.beamOpacity=beam.opacity;
        for(const mesh of [this.haze,this.beams]){mesh.frustumCulled=false;mesh.castShadow=false;mesh.count=0;this.root.add(mesh);}
        // The stage's own lights come first in the scene (the city's street fill follows its own power).
        scene.traverse(object=>{
            if(object instanceof THREE.HemisphereLight)this.hemisphere??=object;
            else if(object instanceof THREE.AmbientLight)this.ambient??=object;
            else if(object instanceof THREE.DirectionalLight)this.moon??=object;
        });
        this.baseHemisphere=this.hemisphere?.intensity??0;this.baseAmbient=this.ambient?.intensity??0;this.baseMoon=this.moon?.intensity??0;
        this.fog=scene.fog instanceof THREE.FogExp2?scene.fog:undefined;this.baseFog=this.fog?.density??0;
        if(this.fog)this.baseFogColor.copy(this.fog.color);
        this.background=scene.background instanceof THREE.Color?scene.background:undefined;
        if(this.background)this.baseBackground.copy(this.background);
        freezeStatic(this.root);scene.add(this.root);
    }

    private random():number {this.seed=(this.seed*1103515245+12345)&0x7fffffff;return this.seed/0x7fffffff;}

    /** `perception` scales only the fog (the part that hides things); haze cones and the sky stay constant.
     * `mono` (low health) turns fog and sky grey and thins the fog, so the black-and-white city reads clearer.
     * `dark` (Blackout, surge flicker) 0…1 takes the stage's light, fog colour and sky to black. */
    update(dt:number,camera:THREE.Camera,outdoors:boolean,perception=1,mono=0,dark=0):void {
        dt=Math.min(Math.max(dt,0),.1);this.time+=dt;
        const state=feelState(),strength=state.noir(),hazeOn=state.on('noirHaze')&&strength>0,skyOn=state.on('noirSky')&&strength>0;
        const p=FEEL.noirHaze.params,s=FEEL.noirSky.params,cones=(hazeOn||this.soup>0)&&GRAPHICS.haze;
        // Haze: re-pick the nearest lamps a few times a second (Low graphics keeps only the fog). A Pea Souper lights
        // them up even with the haze switched off: the lamps are what breaks through.
        this.hazeOpacity.value=cones?p.opacity*Math.max(strength,this.soup):0;
        const soup=FEEL.peaSouper.params,thick=this.soup;
        this.soupColour.setHex(soup.colour);this.hazeOpacity.value*=1+thick*soup.haze;
        if(cones&&(this.nearestAt+=dt)>.4){
            this.nearestAt=0;
            const c=camera.position;
            const near=this.lamps.map(lamp=>({lamp,d:(lamp.x-c.x)**2+(lamp.z-c.z)**2})).filter(n=>n.d<p.range*p.range).sort((a,b)=>a.d-b.d).slice(0,HAZE_SLOTS);
            near.forEach(({lamp},i)=>{this.dummy.position.copy(lamp);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(1+thick*(soup.cone-1),1,1+thick*(soup.cone-1));this.dummy.updateMatrix();this.haze.setMatrixAt(i,this.dummy.matrix);});
            this.haze.count=near.length;this.haze.instanceMatrix.needsUpdate=true;
        }
        if(!cones)this.haze.count=0;
        if(this.fog){
            const density=this.baseFog*(1+(hazeOn?p.fog*strength*perception*1.6:0))*(1-.35*mono);
            this.fog.density=density+(soup.density-density)*thick;
            this.fog.color.copy(this.baseFogColor).lerp(this.coldFog,hazeOn?strength*.7:0).lerp(this.soupColour,thick);
            this.toGrey(this.fog.color,mono);this.fog.color.multiplyScalar(1-dark);
        }
        // Searchlights: slow sweeping beams over the landmark roofs.
        this.beamOpacity.value=skyOn?s.beamOpacity*strength*(1+thick*soup.beams):0;
        if(skyOn){
            this.beamOrigins.forEach((origin,i)=>{
                const sweep=this.time*s.sweepSpeed+i*2.1;
                this.dummy.position.copy(origin);
                // Point the beam up and outward (the cone opens downward in local space).
                this.dummy.rotation.set(Math.PI-(.45+.18*Math.sin(sweep*.7+i)),sweep,0,'YXZ');
                this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.beams.setMatrixAt(i,this.dummy.matrix);
            });
            this.beams.count=this.beamOrigins.length;this.beams.instanceMatrix.needsUpdate=true;
        }else this.beams.count=0;
        // Lightning: a double flash that lifts the sky and ambient light, then thunder. Never in a Blackout.
        let flash=0;
        if(skyOn&&!this.blackout){
            if((this.nextStrike-=dt)<=0){this.strikeAge=0;this.nextStrike=s.minGap+this.random()*(s.maxGap-s.minGap);this.thunderIn=.8+this.random()*1.6;}
            if(this.strikeAge<.5){
                this.strikeAge+=dt;const t=this.strikeAge;
                flash=Math.max(0,1-Math.abs(t-.04)/.05)+.7*Math.max(0,1-Math.abs(t-.2)/.07);
                flash*=strength*(outdoors?1:.35);
            }
        }
        this.flash=flash;
        if(this.hemisphere)this.hemisphere.intensity=this.baseHemisphere*(1+flash*s.flash)*(1-dark);
        if(this.ambient)this.ambient.intensity=this.baseAmbient*(1-dark);
        if(this.moon)this.moon.intensity=this.baseMoon*(1-dark);
        if(this.background){this.background.copy(this.baseBackground).lerp(this.soupColour,thick*soup.sky).lerp(this.flashSky,Math.min(1,flash*.8));this.toGrey(this.background,mono);this.background.multiplyScalar(1-dark);}
    }

    private toGrey(colour:THREE.Color,amount:number):void {
        if(amount<=0)return;
        const l=colour.r*.299+colour.g*.587+colour.b*.114;colour.lerp(this.grey.setRGB(l,l,l),amount);
    }

    /** Strike on the next frame (workshop review). */
    strike():void {this.nextStrike=0;}
    /** Blackout: no lightning. */
    blackout=false;
    /** Pea Souper, 0…1 (the director eases it): thick yellow-grey fog over the city and sky, brighter lamp haze and
     * searchlights. Only uniforms change, so no program relinks. */
    soup=0;
    private readonly soupColour=new THREE.Color();
    /** The current lightning flash, 0…1+, for effects that should light up with it. */
    flash=0;

    /** Restore the stage's own fog, sky and hemisphere light. */
    dispose():void {
        if(this.hemisphere)this.hemisphere.intensity=this.baseHemisphere;
        if(this.ambient)this.ambient.intensity=this.baseAmbient;
        if(this.moon)this.moon.intensity=this.baseMoon;
        if(this.fog){this.fog.density=this.baseFog;this.fog.color.copy(this.baseFogColor);}
        if(this.background)this.background.copy(this.baseBackground);
        this.root.removeFromParent();
        for(const mesh of [this.haze,this.beams]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
    }
}
