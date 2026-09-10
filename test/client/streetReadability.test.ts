import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {StreetReadability,sampleStreetSpill,streetReadabilityEnabled,type SpillSource} from '../../src/prototype/StreetReadability';

const source:SpillSource={x:0,z:0,y:3,nx:0,nz:1,kind:'window',color:0xffffff,reach:12};
it('keeps spill local, directional and blocked by walls and corners',()=>{
    const near=sampleStreetSpill(source,0,2,[]);
    expect(near).toBeGreaterThan(0);expect(near).toBeLessThan(.04);
    expect(sampleStreetSpill(source,0,8,[])).toBeLessThan(near);
    for(const [x,z] of [[0,-1],[0,12],[7,2]])expect(sampleStreetSpill(source,x,z,[])).toBe(0);
    const wall={x:0,z:3,w:8,d:1};
    expect(sampleStreetSpill(source,0,2,[wall])).toBe(near);
    expect(sampleStreetSpill(source,0,5,[wall])).toBe(0);
    expect(sampleStreetSpill({...source,x:3,z:0,nx:1,nz:0},5,0,[wall])).toBeGreaterThan(0);
});
it('uses a fixed atlas and instanced fixtures, preserves existing shaders and disposes its resources',()=>{
    const scene=new THREE.Scene(),spill=new StreetReadability(scene,[],[]);
    expect(scene.children.every(o=>o instanceof THREE.InstancedMesh)).toBe(true);
    const material=new THREE.MeshStandardMaterial();material.userData.streetSurface='ground';
    material.onBeforeCompile=shader=>{shader.fragmentShader+='\n// existing baked illumination';};
    material.customProgramCacheKey=()=> 'existing-shader';
    spill.apply(material);const compile=material.onBeforeCompile;
    spill.apply(material);expect(material.onBeforeCompile).toBe(compile);
    const shader={uniforms:{},vertexShader:'#include <common>\n#include <worldpos_vertex>',fragmentShader:'#include <common>\n#include <emissivemap_fragment>'} as unknown as THREE.WebGLProgramParametersWithUniforms;
    compile(shader,{} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('// existing baked illumination');
    expect(shader.vertexShader).toContain('instanceMatrix*streetPosition');
    expect(material.customProgramCacheKey()).toContain('existing-shader');
    const texture=shader.uniforms.streetSpill.value as THREE.DataTexture;
    expect(texture.image.width).toBe(512);expect(texture.image.data!.byteLength).toBe(1024*1024);
    const released=vi.fn();texture.addEventListener('dispose',released);
    spill.dispose();expect(released).toHaveBeenCalledOnce();expect(scene.children).toHaveLength(0);material.dispose();
});
it('allows a local before/after comparison without changing the accepted lamp mode',()=>{
    expect(streetReadabilityEnabled('')).toBe(true);
    expect(streetReadabilityEnabled('?lighting=pools&readability=off')).toBe(false);
    expect(streetReadabilityEnabled('?readability=on')).toBe(true);
});
