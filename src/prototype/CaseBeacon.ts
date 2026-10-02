import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {freezeStatic} from '../utils/freezeStatic';
import {CASE_GOLD} from './caseGold';
/** Enlarged view-dependent rim of the actual case shape in the case gold, visible through the city: the loose case's
 * steady glow. A carried case is not marked (the case ping shows where it was). */
export class CaseBeacon {
    readonly root=new THREE.Group();
    private readonly material:THREE.ShaderMaterial;
    constructor(scene:THREE.Scene){
        this.material=new THREE.ShaderMaterial({
            transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,
            uniforms:{strength:{value:1},color:{value:new THREE.Color(CASE_GOLD)}},
            vertexShader:`varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=-p.xyz;gl_Position=projectionMatrix*p;}`,
            fragmentShader:`uniform float strength;uniform vec3 color;varying vec3 n;varying vec3 eye;void main(){float rim=1.-abs(dot(normalize(n),normalize(eye)));float a=smoothstep(.42,.87,rim)*strength;gl_FragColor=vec4(color,a);\n#include <colorspace_fragment>\n}`,
        });
        const body=new THREE.Mesh(new RoundedBoxGeometry(.86,.66,.38,3,.06),this.material);this.root.add(body);
        const handle=new THREE.Mesh(new THREE.TorusGeometry(.13,.025,6,16,Math.PI),this.material);
        handle.position.y=.36;this.root.add(handle);
        this.root.traverse(o=>{o.renderOrder=2000;o.raycast=()=>{};});freezeStatic(this.root,[this.root]);scene.add(this.root);
    }
    update(target:THREE.Object3D,camera:THREE.Camera,hidden:boolean){
        this.root.position.copy(target.position);this.root.quaternion.copy(target.quaternion);
        const distance=camera.position.distanceTo(target.position);
        this.root.visible=!hidden&&distance>14&&target.visible;
        const height=Math.max(1,window.innerHeight),projection=camera.projectionMatrix.elements[5];
        this.root.scale.setScalar(Math.max(target.scale.x,24*2*distance/(.66*height*projection)));
        this.material.uniforms.strength.value=THREE.MathUtils.smoothstep(distance,14,28)*1.3;
    }
    dispose(){this.root.removeFromParent();this.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.material.dispose();}
}
