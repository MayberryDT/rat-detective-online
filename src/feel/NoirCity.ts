import * as THREE from 'three';
import {feelState} from './feelState';

/** Noir N1/N2: city surfaces only. Each city material gets a tiny shader patch
 * sharing these uniforms, so the look dials live with the Noir strength slider:
 *  - drain: albedo toward cold grey-blue (unlit window/sign materials drain less,
 *    so lamps and windows keep their warmth);
 *  - gamma: a curve on the final colour: above 1 dark areas sink while lamp
 *    pools stay bright; below 1 (low health) shadows lift;
 *  - mono: the final colour toward black and white (low health), glows and
 *    light beams included.
 * Rats, cheese, cases, pickups and cameos are never patched: anything created
 * after the city, or under an object tagged `userData.noNoir`, is left alone. */
export class NoirCity {
    /** Blackout darkness 0…1, shared by every patched material. */
    private readonly dark={value:0};
    /** Low-health black and white 0…1, shared by every patched material. */
    private readonly mono={value:0};
    private readonly lit={noirDrain:{value:0},noirGamma:{value:1},noirDark:this.dark,noirMono:this.mono};
    private readonly unlit={noirDrain:{value:0},noirGamma:{value:1},noirDark:this.dark,noirMono:this.mono};
    /** Additive glows (lamp haze, light shafts) only go dark with the power, and grey with low health. */
    private readonly glow={noirDrain:{value:0},noirGamma:{value:1},noirDark:this.dark,noirMono:this.mono};
    /** P4 case papers: their thin red edge dims smoothly with the Blackout but never strobes with a surge or the lights'
     * stutter (Tyler: a quiet, steady outline). */
    private readonly evidenceDark={value:0};
    private readonly evidence={noirDrain:{value:0},noirGamma:{value:1},noirDark:this.evidenceDark,noirMono:this.mono};
    private readonly patched=new Set<THREE.Material>();

    constructor(scene:THREE.Scene){this.collect(scene);}

    private collect(object:THREE.Object3D,lightOnly=false,evidence=false):void {
        if(object.userData.noNoir&&!lightOnly)return;
        if(object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Line)
            for(const material of Array.isArray(object.material)?object.material:[object.material])this.patch(material,lightOnly,evidence);
        for(const child of object.children)this.collect(child,lightOnly,evidence);
    }

    /** City dressing built after the city (neon, haze, rain) only follows the Blackout. `evidence`: the case papers,
     * which follow it without the stutter (`setEvidenceDark`). */
    adopt(root:THREE.Object3D,evidence=false):void {this.collect(root,true,evidence);}

    private patch(material:THREE.Material,lightOnly=false,evidence=false):void {
        if(this.patched.has(material))return;
        if(material instanceof THREE.ShaderMaterial){this.patchShader(material);return;}
        const unlit=material instanceof THREE.MeshBasicMaterial;
        if(!unlit&&!(material instanceof THREE.MeshStandardMaterial)&&!(material instanceof THREE.MeshLambertMaterial)&&!(material instanceof THREE.MeshPhongMaterial))return;
        // Additive glows (lamp haze, light shafts) are light, not surfaces: no drain or contrast.
        const additive=material.blending===THREE.AdditiveBlending;
        this.patched.add(material);
        material.addEventListener('dispose',()=>this.patched.delete(material));
        const uniforms=evidence?this.evidence:additive||lightOnly?this.glow:unlit?this.unlit:this.lit;
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
        material.onBeforeCompile=(shader,renderer)=>{
            compile.call(material,shader,renderer);
            Object.assign(shader.uniforms,uniforms);
            // Lit surfaces lose only their own glow (lamps, windows, baked street light) with the power: the
            // lights themselves dim by intensity, so flashlights still show them. Unlit ones simply go dark.
            shader.fragmentShader=shader.fragmentShader
                .replace('#include <common>','#include <common>\nuniform float noirDrain;\nuniform float noirGamma;\nuniform float noirDark;\nuniform float noirMono;')
                .replace('#include <color_fragment>',`#include <color_fragment>
                    float noirLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));
                    diffuseColor.rgb=mix(diffuseColor.rgb,noirLuma*vec3(.84,.91,1.08),noirDrain);`)
                .replace('#include <aomap_fragment>',unlit?'#include <aomap_fragment>':'totalEmissiveRadiance*=1.-noirDark;\n#include <aomap_fragment>')
                .replace('#include <dithering_fragment>',`gl_FragColor.rgb=pow(max(gl_FragColor.rgb,vec3(0.)),vec3(noirGamma))${unlit?'*(1.-noirDark)':''};
                    gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(dot(gl_FragColor.rgb,vec3(.299,.587,.114))),noirMono);
                    #include <dithering_fragment>`);
        };
        material.customProgramCacheKey=()=>key+'-noir-city-v4';
        material.needsUpdate=true;
    }

    /** Called every frame: follow the strength slider and the N1/N2 switches. `mono` 0…1 fades to black and white,
     * easing the shadow curve toward `lift` on the way. */
    update(perception=1,mono=0,lift=1):void {
        const state=feelState(),strength=state.noir()*perception;
        const drain=state.on('noirDrain')?strength*.9:0,shadows=state.on('noirShadows')?1+strength*.45:1,gamma=shadows+(lift-shadows)*mono;
        this.lit.noirDrain.value=drain;this.lit.noirGamma.value=gamma;
        this.unlit.noirDrain.value=drain*.35;this.unlit.noirGamma.value=1+(gamma-1)*.4;
        this.mono.value=mono;
    }

    /** Custom shaders (light beams, haze) have no shared chunks: they only dim with the Blackout. */
    private patchShader(material:THREE.ShaderMaterial):void {
        this.patched.add(material);
        material.addEventListener('dispose',()=>this.patched.delete(material));
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
        material.onBeforeCompile=(shader,renderer)=>{
            compile.call(material,shader,renderer);
            shader.uniforms.noirDark=this.dark;shader.uniforms.noirMono=this.mono;
            const end=shader.fragmentShader.lastIndexOf('}');
            shader.fragmentShader='uniform float noirDark;\nuniform float noirMono;\n'+shader.fragmentShader.slice(0,end)
                +'gl_FragColor*=1.-noirDark;\ngl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(dot(gl_FragColor.rgb,vec3(.299,.587,.114))),noirMono);\n}'+shader.fragmentShader.slice(end+1);
        };
        material.customProgramCacheKey=()=>key+'-noir-dark-v2';
        material.needsUpdate=true;
    }

    /** Blackout: 0 (power on) … 1 (every city light and surface dark). */
    setDark(level:number):void {this.dark.value=level;}
    /** The case papers' darkness: the Blackout's eased level, without its stutter or a surge's flicker. */
    setEvidenceDark(level:number):void {this.evidenceDark.value=level;}

    /** Leave patched materials visually neutral (they are disposed with the city). */
    dispose():void {
        for(const uniforms of [this.lit,this.unlit]){uniforms.noirDrain.value=0;uniforms.noirGamma.value=1;}
        this.dark.value=0;this.mono.value=0;
        this.patched.clear();
    }
}
