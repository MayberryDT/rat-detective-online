import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {windowApertures,uncoveredWindowApertures} from '../../src/world/WindowApertures';
import {beamReach,FacadeBeams,windowBrightness} from '../../src/prototype/FacadeBeams';
import type {SpillSource} from '../../src/prototype/StreetReadability';

const source:SpillSource={x:0,y:5,z:0,nx:0,nz:1,width:1,height:1,color:0xffcf96,kind:'window',reach:10};
it('projects pane UVs onto all four actual wall faces with the same occupancy uniforms',()=>{
    const light={value:1},room={rect:{value:new THREE.Vector4(0,0,1,1)},light};
    const panes=windowApertures([{u0:.1,u1:.3,v0:.2,v1:.4,color:0xffffff}],[room],{x:10,y:10,z:20,w:10,h:20,d:8},20);
    expect(panes).toHaveLength(4);
    expect(panes.map(s=>[s.x,s.z])).toEqual([[15.025,22.4],[4.975,17.6],[7,24.025],[13,15.975]]);
    for(const p of panes)expect(p.y).toBeCloseTo(6);
    for(const p of panes){expect(p.height).toBeCloseTo(4);expect(windowBrightness(p)).toBe(1);}
    light.value=.025;expect(panes.every(p=>windowBrightness(p)===0)).toBe(true);
});
it('does not emit from portions of a window covered by a door surround or facade trim',()=>{
    const occupancy={value:1};
    const panes=uncoveredWindowApertures([{...source,width:2,height:2,occupancy}],
        [{x:0,y:5,z:.1,w:.4,h:2,d:.2},{x:0,y:4.2,z:.1,w:4,h:.4,d:.2}]);
    expect(panes).toHaveLength(2);
    expect(panes.reduce((sum,p)=>sum+(p.powerShare??1),0)).toBeLessThan(1);
    for(const p of panes){
        expect(Math.abs(p.x)-(p.width??0)/2).toBeGreaterThan(.2);
        expect(p.y-(p.height??0)/2).toBeGreaterThan(4.4);
        expect(p.occupancy).toBe(occupancy);
    }
});
it('clips panes at room occupancy boundaries and physical setback floors',()=>{
    const rooms=[{rect:{value:new THREE.Vector4(0,0,.5,1)},light:{value:.025}},
        {rect:{value:new THREE.Vector4(.5,0,1,1)},light:{value:1}}];
    const panes=windowApertures([{u0:.4,u1:.6,v0:.4,v1:.6,color:0xffffff}],rooms,{x:0,y:15,z:0,w:10,h:10,d:8},20);
    expect(panes).toHaveLength(8);
    expect(panes.filter(s=>windowBrightness(s)>0)).toHaveLength(4);
    expect(panes.filter(p=>p.nx===1).reduce((sum,p)=>sum+(p.powerShare??1),0)).toBeCloseTo(.5);
    for(const p of panes){expect(p.y).toBeCloseTo(11);expect(p.height).toBeCloseTo(2);}
});
it('clips downward shafts before the far wall but allows them below a high overhang',()=>{
    const wall={x:0,y:5,z:4,w:10,h:10,d:1};
    expect(beamReach(source,[])).toBe(10);
    expect(beamReach(source,[wall])).toBeGreaterThan(3);
    expect(beamReach(source,[wall])).toBeLessThan(3.5);
    expect(beamReach(source,[{...wall,y:12,h:2}])).toBe(10);
    expect(beamReach(source,[{x:0,y:5,z:-5.1,w:10,h:10,d:10}])).toBe(10);
});
it('keeps fixed geometry while lit-window beams and footprints follow occupancy and release resources',()=>{
    const scene=new THREE.Scene(),occupancy={value:.025};
    const beams=new FacadeBeams(scene,[{...source,occupancy}],[],[]);
    expect(scene.children).toHaveLength(1);
    const mesh=scene.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
    const texture=mesh.material.uniforms.occupancy.value as THREE.DataTexture;
    const geometry=mesh.geometry.getAttribute('position'),positions=geometry.array.slice();
    const data=texture.image.data!;expect(data[4]).toBe(0);
    occupancy.value=1;beams.update();expect(data[4]).toBe(255);
    expect(geometry.array).toEqual(positions);
    const version=texture.version;beams.update();expect(texture.version).toBe(version);
    occupancy.value=.025;beams.update();expect(data[4]).toBe(0);
    const releases=vi.fn();texture.addEventListener('dispose',releases);mesh.geometry.addEventListener('dispose',releases);mesh.material.addEventListener('dispose',releases);
    beams.dispose();expect(scene.children).toHaveLength(0);expect(releases).toHaveBeenCalledTimes(3);
});
