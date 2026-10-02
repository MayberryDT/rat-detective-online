import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {freezeStatic} from '../utils/freezeStatic';
import {reducedMotion} from '../ui/motion';
import {CASE_RIM_RED} from './caseRed';

/** The beat: carried, `rate` beats a second, up to `rate`×(1+`urgent`) as the carrier nears its scoring target; each beat
 * swells the rim to `swell`× and brightens it, and an echo of the outline grows to `echo`× and fades. Taking the case
 * flares the rim to `flareSwell`× for `flareMs`. A loose case beats gently (`loose` of the depth, at `looseRate`). */
export const CASE_BEAT={rate:1,urgent:1.4,swell:.35,echo:1,flareSwell:.9,flareMs:500,loose:.4,looseRate:.6,reducedSwell:.04} as const;

const VERTEX=`varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=-p.xyz;gl_Position=projectionMatrix*p;}`;
// `heat` lifts the red toward orange-white at the peak of a beat or the pickup flare.
const FRAGMENT=`uniform float strength;uniform float heat;uniform vec3 color;varying vec3 n;varying vec3 eye;void main(){float rim=1.-abs(dot(normalize(n),normalize(eye)));float a=smoothstep(.42,.87,rim)*strength;gl_FragColor=vec4(color+vec3(.0,.3,.12)*heat,a);}`;

/** Enlarged view-dependent rim of the actual case shape in the hot-case red, visible through the city, with a heartbeat:
 * the rim swells and brightens about once a second and an echo of the outline expands and fades off it, faster as
 * the carrier nears its target; taking the case flares it. Hidden for your own carried case, or close up. Two shared
 * materials, one pair of geometries, uniforms and transforms only per frame. Reduced motion keeps the glow, not the swell. */
export class CaseBeacon {
    readonly root=new THREE.Group();
    private readonly echo=new THREE.Group();
    private readonly material:THREE.ShaderMaterial;
    private readonly echoMaterial:THREE.ShaderMaterial;
    /** Beat phase 0…1, the last frame's time, and when the case was last taken (-Infinity: no flare). */
    private phase=0;
    private last=0;
    private flareAt=-Infinity;
    private carried=false;
    constructor(scene:THREE.Scene){
        const uniforms=()=>({strength:{value:1},heat:{value:0},color:{value:new THREE.Vector3(...CASE_RIM_RED)}});
        const make=()=>new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,
            uniforms:uniforms(),vertexShader:VERTEX,fragmentShader:FRAGMENT});
        this.material=make();this.echoMaterial=make();
        const body=new RoundedBoxGeometry(.86,.66,.38,3,.06),handle=new THREE.TorusGeometry(.13,.025,6,16,Math.PI);
        for(const [group,material] of [[this.root,this.material],[this.echo,this.echoMaterial]] as const){
            group.add(new THREE.Mesh(body,material));
            const h=new THREE.Mesh(handle,material);h.position.y=.36;group.add(h);
        }
        this.echo.traverse(o=>{o.renderOrder=1999;o.raycast=()=>{};});this.root.traverse(o=>{o.renderOrder=2000;o.raycast=()=>{};});
        freezeStatic(this.root,[this.root]);freezeStatic(this.echo,[this.echo]);scene.add(this.root,this.echo);
    }
    /** `carried`: someone holds the case; `urgency` 0…1, how near its carrier is to scoring (0 with no target). */
    update(target:THREE.Object3D,camera:THREE.Camera,hidden:boolean,now:number,carried:boolean,urgency:number){
        const dt=Math.min(.1,Math.max(0,(now-this.last)/1000));this.last=now;
        if(carried&&!this.carried){this.flareAt=now;this.phase=0;}
        this.carried=carried;
        const B=CASE_BEAT,rate=carried?B.rate*(1+B.urgent*urgency):B.looseRate;
        this.phase=(this.phase+dt*rate)%1;
        this.root.position.copy(target.position);this.root.quaternion.copy(target.quaternion);
        const distance=camera.position.distanceTo(target.position);
        this.root.visible=!hidden&&distance>14&&target.visible;
        const height=Math.max(1,window.innerHeight),projection=camera.projectionMatrix.elements[5];
        const base=Math.max(target.scale.x,24*2*distance/(.66*height*projection)),fade=THREE.MathUtils.smoothstep(distance,14,28)*1.3;
        // The heartbeat: a quick rise and a slower settle; the flare decays over `flareMs`.
        const p=this.phase,beat=(p<.08?p/.08:Math.exp(-(p-.08)*7))*(carried?1:B.loose);
        const flare=Math.max(0,1-(now-this.flareAt)/B.flareMs),still=reducedMotion();
        const swell=still?B.reducedSwell:B.swell;
        this.root.scale.setScalar(base*(1+swell*beat+(still?0:B.flareSwell*flare*flare)));
        this.material.uniforms.strength.value=fade*(1+.35*beat+flare);
        this.material.uniforms.heat.value=Math.min(1,.6*beat+flare);
        // The echo: heat coming off the case, from the rim's size out to `echo` more, fading as it goes (none when still).
        this.echo.visible=this.root.visible&&!still;
        if(this.echo.visible){
            this.echo.position.copy(this.root.position);this.echo.quaternion.copy(this.root.quaternion);
            this.echo.scale.setScalar(base*(1+B.echo*p));
            this.echoMaterial.uniforms.strength.value=fade*.7*(1-p)*(1-p)*(carried?1:B.loose);
        }
    }
    dispose(){
        this.root.removeFromParent();this.echo.removeFromParent();
        const first=this.root.children as THREE.Mesh[];for(const m of first)m.geometry.dispose();
        this.material.dispose();this.echoMaterial.dispose();
    }
}
