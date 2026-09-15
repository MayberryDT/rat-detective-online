import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {CameoView,type CameoVisitor} from '../../src/cameos/CameoView';
import {CameoAnimator} from '../../src/cameos/CameoAnimator';
import {CAMEO_LAYOUT,type CameoKind} from '../../src/cameos/cameoLayout';
import {createCameoRat} from '../visual/cameos/CameoRatModel';
import {grayboxBoxes} from '../../src/shared/grayboxLayout';
import {SEWER_MAINTENANCE_FURNISHINGS} from '../../src/shared/sewerLayout';
const views:CameoView[]=[];
const clear=()=>true;
const bat=CAMEO_LAYOUT[1],camera={x:bat.x,y:bat.y+2,z:bat.z+3};
function setup(){
    const models=new Map<CameoKind,THREE.Group>();
    for(const kind of ['spider','bat'] as const){
        const model=new THREE.Group();for(const name of ['cameo-motion','cameo-head','cameo-cape','cameo-torso']){const part=new THREE.Group();part.name=name;model.add(part);}models.set(kind,model);
    }
    const view=new CameoView(models);views.push(view);return view;
}
function tick(view:CameoView,seconds:number,visitors:()=>Iterable<CameoVisitor>=()=>[],visible=clear){
    for(let i=0;i<Math.ceil(seconds/.05);i++){view.beginFrame(.05,camera);view.update(visitors,visible);}
}
afterEach(()=>{views.splice(0).forEach(v=>v.dispose());vi.restoreAllMocks();});

it('uses the fixed Gate roof and clear Maintenance floor, without adding colliders or lights',()=>{
    const models=new Map(CAMEO_LAYOUT.map(p=>[p.kind,createCameoRat(p.kind)]));
    const view=new CameoView(models);views.push(view);
    const crown=grayboxBoxes().find(b=>b.x===-137&&b.z===22&&b.y+b.h/2===62)!;
    const spider=models.get('spider')!,bounds=new THREE.Box3().setFromObject(spider,true);
    expect(spider.position.y).toBe(crown.y+crown.h/2);
    expect(bounds.min.x).toBeGreaterThan(crown.x-crown.w/2);
    expect(bounds.max.x).toBeLessThan(crown.x+crown.w/2);
    expect(bounds.min.z).toBeGreaterThan(crown.z-crown.d/2);
    expect(bounds.max.z).toBeLessThan(crown.z+crown.d/2);
    const batBounds=new THREE.Box3().setFromObject(models.get('bat')!,true);
    expect(batBounds.min.y).toBeCloseTo(-7,5);
    expect(batBounds.min.x).toBeGreaterThan(60);expect(batBounds.min.z).toBeGreaterThan(-42);
    for(const box of SEWER_MAINTENANCE_FURNISHINGS){const furniture=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(box.x,box.y,box.z),new THREE.Vector3(box.w,box.h,box.d));expect(batBounds.intersectsBox(furniture)).toBe(false);}
    view.root.traverse(node=>{expect(node instanceof THREE.Light).toBe(false);if(node instanceof THREE.Mesh){expect(node.castShadow).toBe(false);const hits:THREE.Intersection[]=[];node.raycast(new THREE.Raycaster(),hits);expect(hits).toEqual([]);}});
});

it('does no animation or visibility ray work while distant, and pauses correctly when disabled',()=>{
    const view=setup(),sample=vi.spyOn(CameoAnimator.prototype,'sample'),visible=vi.fn(clear);
    view.beginFrame(.05,{x:0,y:0,z:0});view.update(()=>[],visible);
    view.observeShot('far',{x:0,y:0,z:0},.2,visible);
    expect(sample).not.toHaveBeenCalled();expect(visible).not.toHaveBeenCalled();
    view.setEnabled(false);view.beginFrame(.05,camera);view.update(()=>[],visible);
    expect(sample).not.toHaveBeenCalled();expect(view.root.visible).toBe(false);
});

it('greets a new nearby rat once, with floor and wall checks, then rearms after leaving',()=>{
    const view=setup(),sample=vi.spyOn(CameoAnimator.prototype,'sample');
    const visitor={id:'rat',position:{x:bat.x+2,y:bat.y,z:bat.z+1}};
    view.beginFrame(.05,camera);view.update(()=>[visitor],()=>false);
    expect(sample).toHaveBeenLastCalledWith('idle',expect.any(Number),1);
    tick(view,.2);view.beginFrame(.05,camera);view.update(()=>[{...visitor,position:{...visitor.position,y:0}}],clear);
    expect(sample).toHaveBeenLastCalledWith('idle',expect.any(Number),1);
    tick(view,.2);view.beginFrame(.05,camera);view.update(()=>[visitor],clear);
    tick(view,.2,()=>[visitor]);expect(sample.mock.calls.some(args=>args[0]==='passerby')).toBe(true);
    tick(view,8,()=>[visitor]);expect(sample).toHaveBeenLastCalledWith('idle',expect.any(Number),expect.any(Number));
    tick(view,.3);tick(view,.3,()=>[visitor]);expect(sample).toHaveBeenLastCalledWith('passerby',expect.any(Number),expect.any(Number));
});

it('reacts to a swept ball even between frames and interrupts a greeting without moving the cape',()=>{
    const view=setup(),sample=vi.spyOn(CameoAnimator.prototype,'sample');
    tick(view,.2,()=>[{id:'rat',position:{x:bat.x+2,y:bat.y,z:bat.z}}]);
    view.beginFrame(.05,camera);view.observeShot('ball',{x:bat.x-2,y:bat.y+1.1,z:bat.z},.2,clear);
    view.beginFrame(.05,camera);view.observeShot('ball',{x:bat.x+2,y:bat.y+1.1,z:bat.z},.2,clear);view.update(()=>[],clear);
    expect(sample).toHaveBeenLastCalledWith('shot',expect.any(Number),expect.any(Number));
    const cape=view.root.getObjectByName('cameo-cape')!;expect(cape.rotation.y).toBe(0);
});

it('rejects wall-hidden balls and large reconciliation jumps',()=>{
    const view=setup(),sample=vi.spyOn(CameoAnimator.prototype,'sample');
    view.beginFrame(.05,camera);view.observeShot('wall',{x:bat.x,y:bat.y+1.1,z:bat.z},.2,()=>false);view.update(()=>[],clear);
    view.observeShot('jump',{x:bat.x-20,y:bat.y+1.1,z:bat.z},.2,clear);
    view.beginFrame(.05,camera);view.observeShot('jump',{x:bat.x+20,y:bat.y+1.1,z:bat.z},.2,clear);view.update(()=>[],clear);
    expect(sample.mock.calls.every(args=>args[0]==='idle')).toBe(true);
});

it('bounds projectile history, deduplicates repeated ball samples and clears on reset',()=>{
    const view=setup(),sample=vi.spyOn(CameoAnimator.prototype,'sample');
    const p={x:bat.x,y:bat.y+1.1,z:bat.z};
    for(let frame=0;frame<180;frame++){
        view.beginFrame(.05,camera);view.observeShot('one',p,.2,clear);view.update(()=>[],clear);
    }
    expect(sample).toHaveBeenLastCalledWith('idle',expect.any(Number),expect.any(Number));
    view.reset();view.beginFrame(.05,camera);view.observeShot('one',p,.2,clear);view.update(()=>[],clear);
    expect(sample).toHaveBeenLastCalledWith('shot',expect.any(Number),expect.any(Number));
    for(let i=0;i<300;i++)view.observeShot(`ball-${i}`,{x:bat.x+10,y:-7,z:0},.2,clear);
    expect((view as unknown as {shots:Map<string,unknown>}).shots.size).toBeLessThanOrEqual(256);
    view.reset();expect((view as unknown as {shots:Map<string,unknown>}).shots.size).toBe(0);
});
