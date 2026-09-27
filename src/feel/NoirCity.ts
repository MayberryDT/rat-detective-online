import * as THREE from 'three';
import {feelState} from './feelState';

/** Noir N1/N2: city surfaces only. Each city material gets a tiny shader patch
 * sharing these uniforms, so the look dials live with the Noir strength slider:
 *  - drain: albedo toward cold grey-blue (unlit window/sign materials drain less,
 *    so lamps and windows keep their warmth);
 *  - gamma: a contrast curve on the final colour, so dark areas sink while lamp
 *    pools and lit windows stay bright.
 * Rats, cheese, cases, pickups and cameos are never patched: anything created
 * after the city, or under an object tagged `userData.noNoir`, is left alone. */
export class NoirCity {
    private readonly lit={noirDrain:{value:0},noirGamma:{value:1}};
    private readonly unlit={noirDrain:{value:0},noirGamma:{value:1}};
    private readonly patched=new Set<THREE.Material>();

    constructor(scene:THREE.Scene){this.collect(scene);}

    private collect(object:THREE.Object3D):void {
        if(object.userData.noNoir)return;
        if(object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Line)
            for(const material of Array.isArray(object.material)?object.material:[object.material])this.patch(material);
        for(const child of object.children)this.collect(child);
    }

    private patch(material:THREE.Material):void {
        if(this.patched.has(material))return;
        const unlit=material instanceof THREE.MeshBasicMaterial;
        if(!unlit&&!(material instanceof THREE.MeshStandardMaterial)&&!(material instanceof THREE.MeshLambertMaterial)&&!(material instanceof THREE.MeshPhongMaterial))return;
        // Additive glows (lamp haze, light shafts) are light, not surfaces.
        if(material.blending===THREE.AdditiveBlending)return;
        this.patched.add(material);
        const uniforms=unlit?this.unlit:this.lit;
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
        material.onBeforeCompile=(shader,renderer)=>{
            compile.call(material,shader,renderer);
            Object.assign(shader.uniforms,uniforms);
            shader.fragmentShader=shader.fragmentShader
                .replace('#include <common>','#include <common>\nuniform float noirDrain;\nuniform float noirGamma;')
                .replace('#include <color_fragment>',`#include <color_fragment>
                    float noirLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));
                    diffuseColor.rgb=mix(diffuseColor.rgb,noirLuma*vec3(.84,.91,1.08),noirDrain);`)
                .replace('#include <dithering_fragment>',`gl_FragColor.rgb=pow(max(gl_FragColor.rgb,vec3(0.)),vec3(noirGamma));
                    #include <dithering_fragment>`);
        };
        material.customProgramCacheKey=()=>key+'-noir-city-v1';
        material.needsUpdate=true;
    }

    /** Called every frame: follow the strength slider and the N1/N2 switches. */
    update():void {
        const state=feelState(),strength=state.noir();
        const drain=state.on('noirDrain')?strength*.9:0,gamma=state.on('noirShadows')?1+strength*.45:1;
        this.lit.noirDrain.value=drain;this.lit.noirGamma.value=gamma;
        this.unlit.noirDrain.value=drain*.35;this.unlit.noirGamma.value=1+(gamma-1)*.4;
    }

    /** Leave patched materials visually neutral (they are disposed with the city). */
    dispose():void {
        for(const uniforms of [this.lit,this.unlit]){uniforms.noirDrain.value=0;uniforms.noirGamma.value=1;}
        this.patched.clear();
    }
}
