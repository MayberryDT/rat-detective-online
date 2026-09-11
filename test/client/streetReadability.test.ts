import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {StreetReadability,sampleStreetSpill,streetReadabilityEnabled,type SpillSource} from '../../src/prototype/StreetReadability';
import {StreetLightPool} from '../../src/prototype/StreetLightPool';

const source:SpillSource={x:0,z:0,y:3,nx:0,nz:1,kind:'window',color:0xffffff,reach:12};
it('keeps spill local, directional and blocked by walls and corners',()=>{
    const near=sampleStreetSpill(source,0,2,[]);
    expect(near).toBeGreaterThan(0);expect(near).toBeLessThan(.2);
    expect(sampleStreetSpill(source,0,8,[])).toBeLessThan(near);
    for(const [x,z] of [[0,-1],[0,12],[7,2]])expect(sampleStreetSpill(source,x,z,[])).toBe(0);
    const wall={x:0,z:3,w:8,d:1};
    expect(sampleStreetSpill(source,0,2,[wall])).toBe(near);
    expect(sampleStreetSpill(source,0,5,[wall])).toBe(0);
    expect(sampleStreetSpill({...source,x:3,z:0,nx:1,nz:0},5,0,[wall])).toBeGreaterThan(0);
});
it('casts window light onto a grounded rat, aims out from the pane, and rejects walls and underground anchors',()=>{
    const scene=new THREE.Scene();
    const wall={x:5,y:2,z:-32,w:12,h:4,d:1,color:0,rx:0,rz:0};
    const spill=new StreetReadability(scene,[],[wall]);
    const source=spill.lights.find(s=>s.x===5&&s.z===-36.45)!;
    const pool=new StreetLightPool(scene,[source]),camera=new THREE.PerspectiveCamera();
    const active=()=>scene.children.filter((o):o is THREE.SpotLight=>o instanceof THREE.SpotLight&&o.intensity>0);
    pool.update(camera,{x:5,y:-.003,z:-34});expect(active()).toHaveLength(1);
    expect(active()[0].position.z).toBe(-36.45);expect(active()[0].target.position.z).toBeGreaterThan(-36.45);
    for(const p of [{x:5,y:0,z:-30},{x:5,y:0,z:-39},{x:5,y:-3,z:-34},{x:5,y:12,z:-34}]){
        pool.update(camera,p);expect(active()).toHaveLength(0);
    }
    pool.dispose();spill.dispose();expect(scene.children).toHaveLength(0);
});
it('uses a fixed atlas and instanced fixtures, preserves existing shaders and disposes its resources',()=>{
    const scene=new THREE.Scene(),spill=new StreetReadability(scene,[],[]);
    expect(scene.children.filter(o=>o.name.startsWith('street-spill-fixture-'))).toHaveLength(2);
    expect(scene.children.some(o=>o instanceof THREE.Light)).toBe(false);
    const material=new THREE.MeshStandardMaterial();material.userData.streetSurface='ground';
    material.onBeforeCompile=shader=>{shader.fragmentShader+='\n// existing baked illumination';};
    material.customProgramCacheKey=()=> 'existing-shader';
    spill.apply(material);const compile=material.onBeforeCompile;
    spill.apply(material);expect(material.onBeforeCompile).toBe(compile);
    const shader={uniforms:{},vertexShader:'#include <common>\n#include <worldpos_vertex>',fragmentShader:'#include <common>\n#include <emissivemap_fragment>'} as unknown as THREE.WebGLProgramParametersWithUniforms;
    compile(shader,{} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('// existing baked illumination');
    expect(shader.vertexShader).toContain('instanceMatrix*streetPosition');
    expect(shader.fragmentShader).toContain('inverseTransformDirection(normal,viewMatrix)');
    expect(shader.fragmentShader).toContain('spill*streetHeight*pavement');
    expect(material.customProgramCacheKey()).toContain('existing-shader');
    const texture=shader.uniforms.streetSpill.value as THREE.DataTexture;
    expect(texture.image.width).toBe(512);expect(texture.image.data!.byteLength).toBe(1024*1024);
    const released=vi.fn();texture.addEventListener('dispose',released);
    spill.dispose();expect(released).toHaveBeenCalledOnce();expect(scene.children).toHaveLength(0);material.dispose();
});
it('lands spill down and away from a pane instead of at the building footprint',()=>{
    const pane={...source,y:5};
    expect(sampleStreetSpill(pane,0,0,[])).toBe(0);
    expect(sampleStreetSpill(pane,0,5/.85,[])).toBeGreaterThan(sampleStreetSpill(pane,0,3,[]));
});
it('allows a local before/after comparison without changing the accepted lamp mode',()=>{
    expect(streetReadabilityEnabled('')).toBe(true);
    expect(streetReadabilityEnabled('?lighting=pools&readability=off')).toBe(false);
    expect(streetReadabilityEnabled('?readability=on')).toBe(true);
});
