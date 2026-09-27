import * as THREE from 'three';
import {feelState} from './feelState';
import {FEEL} from './feelTuning';

/** Juice T3 comparison lab: ways to make enemy rats read in the noir without
 * self-lighting (all brightness still comes from the real fixtures).
 *  - eyeshine: eyes reflect light back toward you like an animal's at night;
 *  - selective colour: enemy materials get a saturation boost;
 *  - comic ink outline: the glow shell becomes a crisp cream line (see RatEntity).
 * Shared uniforms follow the review switches every frame. */
const uniforms={enemyEyeshine:{value:0},enemySaturation:{value:0}};
const patched=new WeakSet<THREE.Material>();
/** Live eyeshine discs, hidden (no draw) while their switch is off. */
const discs=new Set<THREE.Mesh>();
let discsVisible=false;

export function updateEnemyLook():void {
    const state=feelState(),p=FEEL.enemyLook.params,eyeshine=state.on('enemyEyeshine');
    uniforms.enemyEyeshine.value=eyeshine?p.eyeshine:0;
    uniforms.enemySaturation.value=state.on('enemySaturation')?p.saturation:0;
    if(eyeshine!==discsVisible){discsVisible=eyeshine;for(const disc of discs)disc.visible=eyeshine;}
}
export function enemyInkOutline():boolean {return feelState().on('enemyInk');}

/** Retroreflective discs on both eyes; excluded from rigid batching. Each rat
 * owns its disc geometry and material (the rat's disposal frees them); the
 * uniforms, and so the shader program, are shared. */
export function addEyeshine(root:THREE.Object3D):void {
    const eyeGeometry=new THREE.CircleGeometry(.055,14);
    const eyeMaterial=new THREE.ShaderMaterial({
        uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
        vertexShader:`varying vec3 vN;varying vec3 vV;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
        fragmentShader:`uniform float enemyEyeshine;varying vec3 vN;varying vec3 vV;void main(){
            float facing=pow(max(dot(normalize(vN),normalize(vV)),0.),6.);
            gl_FragColor=vec4(vec3(.85,1.,.55)*facing*enemyEyeshine,1.);}`,
    });
    for(const name of ['rat-eye-left','rat-eye-right']){
        const eye=root.getObjectByName(name);if(!eye)continue;
        const disc=new THREE.Mesh(eyeGeometry,eyeMaterial);
        disc.name='rat-eyeshine';disc.position.set(0,-.03,.012);disc.userData.noBatch=true;disc.userData.noOutline=true;
        disc.castShadow=false;disc.raycast=()=>{};disc.visible=discsVisible;eye.add(disc);discs.add(disc);
    }
}
export function forgetEyeshine(root:THREE.Object3D):void {
    root.traverse(object=>{if(object instanceof THREE.Mesh)discs.delete(object);});
}

/** Saturation boost on an enemy rat's (possibly batched) materials. */
export function patchEnemyColour(root:THREE.Object3D):void {
    root.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
            if(!(material instanceof THREE.MeshStandardMaterial)||patched.has(material))continue;
            patched.add(material);
            const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
            material.onBeforeCompile=(shader,renderer)=>{
                compile.call(material,shader,renderer);
                shader.uniforms.enemySaturation=uniforms.enemySaturation;
                shader.fragmentShader=shader.fragmentShader
                    .replace('#include <common>','#include <common>\nuniform float enemySaturation;')
                    .replace('#include <normal_fragment_begin>',`// After any batched-palette colour is applied.
                        float enemyLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));
                        diffuseColor.rgb=max(mix(vec3(enemyLuma),diffuseColor.rgb,1.+enemySaturation),vec3(0.));
                        #include <normal_fragment_begin>`);
            };
            material.customProgramCacheKey=()=>key+'-enemy-look-v1';
            material.needsUpdate=true;
        }
    });
}
