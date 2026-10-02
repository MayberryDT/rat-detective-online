import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {freezeStatic} from '../utils/freezeStatic';
import {reducedMotion} from '../ui/motion';
import {CASE_RIM_RED} from './caseRed';

/** The loose case's gentle pulse, `rate` beats a second: each beat swells the rim to `swell`× (`reducedSwell`× with
 * reduced motion) and brightens it by `depth`, and an echo of the outline grows to `echo`× and fades. A carried case
 * shows only at its heartbeat ping (`pingFlash`) and only where it is hidden: `flashStrength` bright at the flash,
 * swollen `flashSwell`×; scenery must stand `hiddenBy` units nearer than the case to count as hiding it (so the carrier's
 * own body and the case's near faces never do). */
export const CASE_BEAT={rate:.6,depth:.4,swell:.35,echo:1,reducedSwell:.04,flashSwell:.5,flashStrength:2.2,hiddenBy:1.5} as const;

// Every fragment takes the depth of the object's origin, `bias` units nearer: an enlarged outline is hidden or shown by
// what stands in front of the thing itself, not by its own inflated size. Only used with the occluded-only depth test.
const VERTEX=`uniform float bias;varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=-p.xyz;gl_Position=projectionMatrix*p;
vec4 o=modelViewMatrix*vec4(0.,0.,0.,1.);vec4 d=projectionMatrix*vec4(p.xy,min(o.z+bias,-.2),1.);gl_Position.z=d.z/d.w*gl_Position.w;}`;
// `heat` lifts the red toward orange-white at the peak of a beat or a ping flash. FILL: a flat shape, solid; otherwise a rim.
const FRAGMENT=`uniform float strength;uniform float heat;uniform vec3 color;varying vec3 n;varying vec3 eye;void main(){
#ifdef FILL
float a=strength;
#else
float rim=1.-abs(dot(normalize(n),normalize(eye)));float a=smoothstep(.42,.87,rim)*strength;
#endif
gl_FragColor=vec4(color+vec3(.0,.3,.12)*heat,a);}`;

/** The hot-case red glow, additive, `strength` and `heat` uniforms: a view-dependent rim, or with `fill` a solid flat
 * shape. Drawn over the city (depth test off) unless `occluded`: then only where scenery more than `bias` units nearer
 * than the object's origin hides it. Shared by the case beacon and the carrier's ping flash. */
export function caseRimMaterial(fill=false,occluded=false,bias=0):THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({transparent:true,depthTest:occluded,depthFunc:THREE.GreaterDepth,depthWrite:false,blending:THREE.AdditiveBlending,
        uniforms:{strength:{value:1},heat:{value:0},bias:{value:bias},color:{value:new THREE.Vector3(...CASE_RIM_RED)}},
        ...(fill?{defines:{FILL:''}}:{}),vertexShader:VERTEX,fragmentShader:FRAGMENT});
}

/** Enlarged view-dependent rim of the actual case shape in the hot-case red, visible through the city. A loose case
 * pulses gently and an echo of the outline expands off it (hidden close up). A carried case is invisible through walls
 * except at its heartbeat ping, when the rim flashes bright at any distance where the case is hidden, and fades to
 * nothing (in plain sight the case's own hot look carries the ping). Hidden for your own carried case. Two shared
 * materials, one pair of geometries, uniforms, transforms and the depth test only per frame. Reduced motion keeps the
 * glow, not the swell. */
export class CaseBeacon {
    readonly root=new THREE.Group();
    private readonly echo=new THREE.Group();
    private readonly material=caseRimMaterial(false,false,CASE_BEAT.hiddenBy);
    private readonly echoMaterial=caseRimMaterial();
    /** Loose beat phase 0…1 and the last frame's time. */
    private phase=0;
    private last=0;
    constructor(scene:THREE.Scene){
        const body=new RoundedBoxGeometry(.86,.66,.38,3,.06),handle=new THREE.TorusGeometry(.13,.025,6,16,Math.PI);
        for(const [group,material] of [[this.root,this.material],[this.echo,this.echoMaterial]] as const){
            group.add(new THREE.Mesh(body,material));
            const h=new THREE.Mesh(handle,material);h.position.y=.36;group.add(h);
        }
        this.echo.traverse(o=>{o.renderOrder=1999;o.raycast=()=>{};});this.root.traverse(o=>{o.renderOrder=2000;o.raycast=()=>{};});
        freezeStatic(this.root,[this.root]);freezeStatic(this.echo,[this.echo]);scene.add(this.root,this.echo);
    }
    /** `flash`: null for a loose case; for a carried one its ping flash 0…1 (`pingFlash`), nothing shown at 0. */
    update(target:THREE.Object3D,camera:THREE.Camera,hidden:boolean,now:number,flash:number|null){
        const dt=Math.min(.1,Math.max(0,(now-this.last)/1000));this.last=now;
        const B=CASE_BEAT;
        this.phase=(this.phase+dt*B.rate)%1;
        this.root.position.copy(target.position);this.root.quaternion.copy(target.quaternion);
        const distance=camera.position.distanceTo(target.position);
        this.root.visible=!hidden&&target.visible&&(flash===null?distance>14:flash>0);
        const height=Math.max(1,window.innerHeight),projection=camera.projectionMatrix.elements[5];
        const base=Math.max(target.scale.x,24*2*distance/(.66*height*projection)),still=reducedMotion();
        // A carried case's rim draws only where scenery hides the case; a loose one's over everything.
        this.material.depthTest=flash!==null;
        if(flash!==null){
            // The heartbeat ping: bright at any distance (the carrier flashes with it), then gone.
            this.echo.visible=false;
            if(!this.root.visible)return;
            this.root.scale.setScalar(base*(1+(still?0:B.flashSwell*flash)));
            this.material.uniforms.strength.value=B.flashStrength*flash;
            this.material.uniforms.heat.value=flash;
            return;
        }
        // The loose pulse: a quick rise and a slower settle.
        const fade=THREE.MathUtils.smoothstep(distance,14,28)*1.3;
        const p=this.phase,beat=(p<.08?p/.08:Math.exp(-(p-.08)*7))*B.depth;
        this.root.scale.setScalar(base*(1+(still?B.reducedSwell:B.swell)*beat));
        this.material.uniforms.strength.value=fade*(1+.35*beat);
        this.material.uniforms.heat.value=.6*beat;
        // The echo: heat coming off the case, from the rim's size out to `echo` more, fading as it goes (none when still).
        this.echo.visible=this.root.visible&&!still;
        if(this.echo.visible){
            this.echo.position.copy(this.root.position);this.echo.quaternion.copy(this.root.quaternion);
            this.echo.scale.setScalar(base*(1+B.echo*p));
            this.echoMaterial.uniforms.strength.value=fade*.7*(1-p)*(1-p)*B.depth;
        }
    }
    dispose(){
        this.root.removeFromParent();this.echo.removeFromParent();
        const first=this.root.children as THREE.Mesh[];for(const m of first)m.geometry.dispose();
        this.material.dispose();this.echoMaterial.dispose();
    }
}
