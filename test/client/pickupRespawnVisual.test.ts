import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {PickupVisual} from '../../src/prototype/PickupVisual';
import {PickupRespawnVisual} from '../../src/prototype/PickupRespawnVisual';

vi.mock('../../src/utils/metalReflection',()=>({metalReflection:()=>null}));
afterEach(()=>vi.unstubAllGlobals());
function canvas(){
    const context={scale(){},fill(){},stroke(){},save(){},restore(){},translate(){}};
    vi.stubGlobal('document',{createElement:()=>({getContext:()=>context})});
    vi.stubGlobal('Path2D',class {});
}
describe('pickup restock presentation',()=>{
    it.each(['ironclad','hustle','quick-fix'] as const)('restores %s exactly at its deadline, reuses its dial, and releases resources',kind=>{
        canvas();const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
        const prop=new PickupVisual(scene,kind);prop.setAvailableAt(46000);prop.update(1000,camera);
        const dial=prop.root.getObjectByName('supply-restock-'+kind)!;
        const mesh=dial.children[0] as THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
        const item=prop.root.children[3];
        expect(item.visible).toBe(false);expect(mesh.material.uniforms.progress.value).toBe(0);
        expect(mesh.material.depthTest).toBe(true);expect(mesh.material.depthWrite).toBe(false);
        prop.update(23500,camera);expect(mesh.material.uniforms.progress.value).toBe(.5);
        prop.update(45999,camera);expect(item.visible).toBe(false);expect(dial.visible).toBe(true);
        prop.update(46000,camera);expect(item.visible).toBe(true);expect(dial.visible).toBe(false);
        prop.setAvailableAt(91000);prop.update(46000,camera);
        expect(prop.root.getObjectByName(dial.name)).toBe(dial);expect(mesh.material.uniforms.progress.value).toBe(0);
        const texture=mesh.material.uniforms.map.value as THREE.Texture;
        const releaseTexture=vi.spyOn(texture,'dispose'),releaseMaterial=vi.spyOn(mesh.material,'dispose');
        prop.dispose();expect(scene.children).toHaveLength(0);expect(releaseTexture).toHaveBeenCalledTimes(1);expect(releaseMaterial).toHaveBeenCalledTimes(1);
    });
    it('clamps restored deadlines and faces the camera without changing timing',()=>{
        canvas();const dial=new PickupRespawnVisual('ironclad'),camera=new THREE.PerspectiveCamera();
        camera.rotation.set(.2,.8,.1);camera.updateMatrixWorld();
        const mesh=dial.root.children[0] as THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
        dial.update(1000,100000,camera);expect(mesh.material.uniforms.progress.value).toBe(0);
        dial.update(100000,1000,camera);expect(mesh.material.uniforms.progress.value).toBe(1);
        expect(dial.root.quaternion.angleTo(camera.quaternion)).toBeCloseTo(0);dial.dispose();
    });
});
