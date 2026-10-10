import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FIXED_LIGHT_CLAMP, FixedLightField, type BakedLight } from '../../src/presentation/FixedLighting';
import { KitArchitecture } from '../../src/presentation/KitArchitecture';
import { KitBuilder } from '../../src/shared/city/kit/kit';
import type { LightRoom } from '../../src/presentation/StreetLightPool';

const warm=new THREE.Color(0xffcd87);
const lamp=(x:number,y:number,z:number,intensity=65,distance=24):BakedLight=>({position:new THREE.Vector3(x,y,z),color:warm,intensity,distance});
const pendant=(x:number,y:number,z:number,room:string,floor=0,intensity=75,distance=12):BakedLight=>({...lamp(x,y,z,intensity,distance),fixture:{room,floor,angle:.85}});
const room=(id:string,xmin:number,xmax:number,zmin=0,zmax=10,ymin=-.5,ymax=8):LightRoom=>({id,xmin,xmax,zmin,zmax,ymin,ymax});
const UP=new THREE.Vector3(0,1,0);

/** The baked light at one surface point, looked up the way the renderers do. */
function at(field:FixedLightField,x:number,y:number,z:number,normal:THREE.Vector3|null=UP):THREE.Color {
    const p=new THREE.Vector3(x,y,z),box=new THREE.Box3(p.clone(),p.clone());
    return field.sample(p,normal,field.near(box),field.roomsNear(box),new THREE.Color());
}
const brightness=(c:THREE.Color)=>c.r+c.g+c.b;

describe('fixed light field',()=>{
    it('keeps a room fixture out of the next room, even right behind the shared wall',()=>{
        const field=new FixedLightField([pendant(8,5.8,5,'office')],[room('office',0,10),room('store',10,20)],'pools');
        expect(brightness(at(field,11,0,5))).toBe(0);
        // The store face of the wall between them, facing the lamp.
        expect(brightness(at(field,10.2,2,5,new THREE.Vector3(-1,0,0)))).toBe(0);
        expect(brightness(at(field,8,0,5))).toBeGreaterThan(0);
    });
    it('lights only the fixture floor band, so the storey above stays dark',()=>{
        const field=new FixedLightField([pendant(5,5.8,5,'hall')],[room('hall',0,10,0,10,-.5,24)],'pools');
        expect(brightness(at(field,5,8.2,5,new THREE.Vector3(0,-1,0)))).toBe(0);
        expect(brightness(at(field,5,0,5))).toBeGreaterThan(0);
    });
    it('gives the innermost room its own light: an office inside a warehouse',()=>{
        const rooms=[room('warehouse',0,40,0,40,0,14),room('office',30,40,30,40,0,5)];
        // The warehouse pendant hangs just outside the office, well in reach of its floor.
        const field=new FixedLightField([pendant(29,9,29,'warehouse',0,110,20),pendant(35,4.4,35,'office',0,40,9)],rooms,'pools');
        const office=at(field,33,0,33),warehouse=at(field,25,0,25);
        expect(brightness(office)).toBeGreaterThan(0);
        expect(brightness(warehouse)).toBeGreaterThan(0);
        const alone=new FixedLightField([pendant(35,4.4,35,'office',0,40,9)],rooms,'pools');
        expect(brightness(at(alone,33,0,33))).toBeCloseTo(brightness(office),6);
    });
    it('leaves a surface out of every source range dark',()=>{
        const field=new FixedLightField([lamp(0,9,0)],[],'pools');
        expect(brightness(at(field,40,0,40))).toBe(0);
        expect(field.near(new THREE.Box3(new THREE.Vector3(30,0,30),new THREE.Vector3(32,1,32)))).toHaveLength(0);
    });
    it('keeps a low outdoor fitting on the stoop, out of the lobby behind the wall',()=>{
        const globe:BakedLight={...lamp(0,3.85,1.2,48,14),outdoor:true},rooms=[room('lobby',-10,10,-12,0)];
        const field=new FixedLightField([globe],rooms,'pools');
        expect(brightness(at(field,0,0,-2))).toBe(0);
        expect(brightness(at(field,0,0,3))).toBeGreaterThan(0);
    });
    it('lights the pavement under a lamp but not a face turned away from it',()=>{
        const field=new FixedLightField([lamp(0,9,0)],[],'pools');
        const under=at(field,0,0,0);
        expect(under.r).toBeGreaterThan(under.b);
        expect(brightness(under)).toBeGreaterThan(brightness(at(field,10,0,0)));
        expect(brightness(at(field,0,0,0,new THREE.Vector3(0,-1,0)))).toBe(0);
    });
    it('keeps street lamps out of rooms in pools mode, and lights them in classic',()=>{
        const rooms=[room('shop',-5,5,-5,5)];
        expect(brightness(at(new FixedLightField([lamp(0,9,8)],rooms,'pools'),0,0,4))).toBe(0);
        expect(brightness(at(new FixedLightField([lamp(0,9,8)],rooms,'classic'),0,0,4))).toBeGreaterThan(0);
    });
    it('clamps each channel however many sources pile up',()=>{
        const field=new FixedLightField(Array.from({length:30},()=>lamp(0,2,0,400,30)),[],'pools');
        const c=at(field,0,0,0);
        for(const channel of [c.r,c.g,c.b])expect(channel).toBeLessThanOrEqual(FIXED_LIGHT_CLAMP);
        expect(c.r).toBe(FIXED_LIGHT_CLAMP);
    });
});

describe('kit pieces carry the bake',()=>{
    function build(k:KitBuilder,lights:BakedLight[],rooms:LightRoom[]=[]){
        const scene=new THREE.Scene(),kit=new KitArchitecture(scene,k);
        for(const _ of kit.build(new FixedLightField(lights,rooms,'pools'))){/* all at once */}
        return {scene,kit};
    }
    /** Light of the vertices (or instances) of `name` within 1.5 units of (x,z) in plan. */
    function litNear(scene:THREE.Scene,name:string,x:number,z:number):number {
        const mesh=scene.getObjectByName(name);
        if(!(mesh instanceof THREE.Mesh))throw new Error(`no ${name}`);
        const light=mesh.geometry.getAttribute('fixedIllumination');
        if(mesh instanceof THREE.InstancedMesh){
            const m=new THREE.Matrix4(),p=new THREE.Vector3();let best=0;
            for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);if(Math.hypot(p.x-x,p.z-z)<1.5)best=Math.max(best,light.getX(i)+light.getY(i)+light.getZ(i));}
            return best;
        }
        const position=mesh.geometry.getAttribute('position');let best=0;
        for(let i=0;i<position.count;i++)if(Math.hypot(position.getX(i)-x,position.getZ(i)-z)<1.5)best=Math.max(best,light.getX(i)+light.getY(i)+light.getZ(i));
        return best;
    }
    it('lights a slab under a lamp per vertex and leaves the far end of the same slab dark',()=>{
        const k=new KitBuilder();k.piece('concrete',30,-.3,0,80,.6,6);
        const {scene,kit}=build(k,[lamp(0,9,0)]);
        expect(litNear(scene,'kit-concrete-baked',0,0)).toBeGreaterThan(0);
        expect(litNear(scene,'kit-concrete-baked',68,0)).toBe(0);
        kit.dispose();
    });
    it('lights small fittings one light each: near a lamp lit, far away dark',()=>{
        const k=new KitBuilder();
        for(const x of [0,60]){k.piece('iron',x,1,0,.3,1,.3);k.piece('iron',x,1,.5,.1,1,.1,{round:true});}
        const {scene,kit}=build(k,[lamp(0,9,0)]);
        for(const name of ['kit-iron-baked','kit-iron-round']){
            expect(litNear(scene,name,0,0),name).toBeGreaterThan(0);
            expect(litNear(scene,name,60,0),name).toBe(0);
        }
        kit.dispose();
    });
    it('keeps a room pendant off the floor of the room beyond the wall',()=>{
        const k=new KitBuilder();k.piece('slate',10,-.3,5,20,.6,10);k.piece('brick',10,3,5,.4,6,10);
        const {scene,kit}=build(k,[pendant(7,5.8,5,'a')],[room('a',0,10),room('b',10,20)]);
        expect(litNear(scene,'kit-slate-baked',7,5)).toBeGreaterThan(0);
        expect(litNear(scene,'kit-slate-baked',13,5)).toBe(0);
        kit.dispose();
    });
    it('leaves glowing panes unbaked',()=>{
        const k=new KitBuilder();k.piece('warm',0,3,0,3,2,.05);
        const {scene,kit}=build(k,[lamp(0,9,0)]);
        const pane=scene.getObjectByName('kit-warm-box');
        expect(pane instanceof THREE.Mesh&&pane.geometry.getAttribute('fixedIllumination')).toBeFalsy();
        kit.dispose();
    });
});
