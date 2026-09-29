import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import * as C from 'cannon-es';
import {ContactShadows,StaticMoonShadow,attachContactShadows,fitMoonShadow} from '../../src/session/shadows';
import {StaticCityBroadphase,addCityBody} from '../../src/shared/StaticCityBroadphase';
import {CITY_BOUNDS} from '../../src/shared/grayboxLayout';
import {RatEntity} from '../../src/entities/RatEntity';
import {ChaosView} from '../../src/prototype/ChaosView';
import type {ChaosState,CorpseState} from '../../src/shared/chaosState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';

vi.mock('../../src/prototype/DispatchHud',()=>({DispatchHud:class{update(){} setScores(){} dispose(){}}}));

function caster(name:string):THREE.Mesh {const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.name=name;mesh.castShadow=true;return mesh;}

/** A moon and a flashlight plus three's contract for them: each render calls the scene hooks
 * around the shadow pass, which draws the map of every light that casts, if the renderer and
 * the light are auto-updating or asked to, and then clears the light's `needsUpdate`. */
function moonStage(){
    const scene=new THREE.Scene(),light=new THREE.DirectionalLight(),flashlight=new THREE.SpotLight();
    light.castShadow=flashlight.castShadow=true;scene.add(light,flashlight);
    const shadowMap={enabled:true,autoUpdate:true,needsUpdate:false};
    const moon=new StaticMoonShadow(light,shadowMap);
    const draws:string[][]=[],flashDraws:string[][]=[];
    const casters=()=>{const cast:string[]=[];scene.traverse(object=>{if(object.castShadow&&!(object instanceof THREE.Light))cast.push(object.name);});return cast;};
    const render=()=>{
        moon.beforeRender(scene);
        if(shadowMap.enabled&&(shadowMap.autoUpdate||shadowMap.needsUpdate))for(const [each,drawn] of [[light,draws],[flashlight,flashDraws]] as const){
            if(!each.castShadow||!each.shadow.autoUpdate&&!each.shadow.needsUpdate)continue;
            drawn.push(casters());each.shadow.needsUpdate=false;
        }
        moon.afterRender();
    };
    return {scene,light,shadowMap,moon,draws,flashDraws,render};
}

describe('StaticMoonShadow',()=>{
    it('draws the moon map every frame, with every caster, until a city is adopted',()=>{
        const {scene,draws,render,moon}=moonStage();scene.add(caster('rat'));
        render();render();
        expect(draws).toEqual([['rat'],['rat']]);expect(moon.bakes).toBe(0);
    });

    it('draws the adopted city once, without moving things, and never again while the city stands',()=>{
        const {scene,draws,flashDraws,render,moon}=moonStage(),rat=caster('rat');scene.add(rat);
        const before=new Set(scene.children);scene.add(caster('tower'),caster('wall'));
        moon.adoptCity(scene,before);
        for(let frame=0;frame<30;frame++)render();
        expect(draws).toEqual([['tower','wall']]);expect(moon.bakes).toBe(1);
        // The flashlight map is still drawn every frame, the rat in it after the redraw frame.
        expect(flashDraws).toHaveLength(30);
        expect(flashDraws.slice(1).every(cast=>cast.includes('rat'))).toBe(true);
    });

    it('keeps the redraw for the first frame that draws shadows, not a warm-up render that skips them',()=>{
        const {scene,shadowMap,draws,render,moon}=moonStage();
        const before=new Set(scene.children);scene.add(caster('tower'));moon.adoptCity(scene,before);
        shadowMap.autoUpdate=false;render();
        expect(draws).toEqual([]);expect(moon.bakes).toBe(0);
        shadowMap.autoUpdate=true;render();render();
        expect(draws).toEqual([['tower']]);expect(moon.bakes).toBe(1);
    });

    it('tries again next frame when three did not draw the map',()=>{
        const {scene,light,moon}=moonStage();
        const before=new Set(scene.children);scene.add(caster('tower'));moon.adoptCity(scene,before);
        moon.beforeRender(scene);moon.afterRender();
        expect(moon.bakes).toBe(0);expect(light.shadow.needsUpdate).toBe(false);
        moon.beforeRender(scene);expect(light.shadow.needsUpdate).toBe(true);
    });

    it('draws a rebuilt city once more with only its own scenery',()=>{
        const {scene,draws,render,moon}=moonStage();
        let before=new Set(scene.children);const old=caster('old-city');scene.add(old);moon.adoptCity(scene,before);
        render();render();
        scene.remove(old);scene.add(caster('lineup-rat'));
        before=new Set(scene.children);scene.add(caster('new-city'));moon.adoptCity(scene,before);
        render();render();render();
        expect(draws).toEqual([['old-city'],['new-city']]);expect(moon.bakes).toBe(2);
    });
});

describe('fitMoonShadow',()=>{
    it('covers every street, sewer and low roof of the whole city, north included, inside its depth range',()=>{
        const fit=fitMoonShadow(new THREE.Vector3(-50,-100,-50),CITY_BOUNDS,.15,4096);
        const camera=new THREE.OrthographicCamera(fit.left,fit.right,fit.top,fit.bottom,fit.near,fit.far);
        camera.position.copy(fit.position);camera.lookAt(fit.target);camera.updateMatrixWorld();
        const view=new THREE.Vector3();
        for(const x of [CITY_BOUNDS.min,CITY_BOUNDS.max])for(const z of [CITY_BOUNDS.min,CITY_BOUNDS.max])for(const y of [-14,0,48,185]){
            view.set(x,y,z).applyMatrix4(camera.matrixWorldInverse);
            expect(-view.z).toBeGreaterThanOrEqual(fit.near);expect(-view.z).toBeLessThanOrEqual(fit.far);
            if(y>48)continue;
            expect(view.x).toBeGreaterThanOrEqual(fit.left);expect(view.x).toBeLessThanOrEqual(fit.right);
            expect(view.y).toBeGreaterThanOrEqual(fit.bottom);expect(view.y).toBeLessThanOrEqual(fit.top);
        }
        expect(fit.width).toBeLessThanOrEqual(4096);expect(fit.height).toBeLessThanOrEqual(4096);
        // No finer than asked where the map is not capped.
        expect((fit.right-fit.left)/fit.width).toBeGreaterThanOrEqual(.15*.9);
    });
});

function groundWorld(){
    const world=new C.World();world.broadphase=new StaticCityBroadphase(world);
    const ground=new C.Body({mass:0,type:C.Body.STATIC});ground.addShape(new C.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
    // A step 1 m high at x ∈ [4, 6].
    addCityBody(world,new C.Body({mass:0,type:C.Body.STATIC,shape:new C.Box(new C.Vec3(1,.5,1)),position:new C.Vec3(5,.5,0)}));
    return world;
}
/** Disc `i` as drawn: where it lies, how wide, how dark. */
function disc(contacts:ContactShadows,i:number){
    const matrix=new THREE.Matrix4(),at=new THREE.Vector3(),size=new THREE.Vector3();
    contacts.mesh.getMatrixAt(i,matrix);matrix.decompose(at,new THREE.Quaternion(),size);
    return {at,width:size.x,fade:contacts.mesh.geometry.getAttribute('contactFade').getX(i)};
}

describe('ContactShadows',()=>{
    it('lays a disc on the static ground under each thing, never on a moving body in the way',()=>{
        const world=groundWorld(),contacts=new ContactShadows(world),scene=new THREE.Scene();attachContactShadows(scene,contacts);
        const crate=new C.Body({mass:1,shape:new C.Box(new C.Vec3(1,1,1)),position:new C.Vec3(0,1,0)});world.addBody(crate);
        // Standing on a crate (a moving body) over the street, and on the step.
        const onCrate=new THREE.Object3D(),onStep=new THREE.Object3D();onCrate.position.set(0,2.1,0);onStep.position.set(5,1,0);
        scene.add(onCrate,onStep);contacts.add(onCrate,.75);contacts.add(onStep,.75);
        contacts.update();
        expect(contacts.mesh.count).toBe(2);
        expect(disc(contacts,0).at.y).toBeCloseTo(.03,2);expect(disc(contacts,1).at.y).toBeCloseTo(1.03,2);
        expect(disc(contacts,1).fade).toBe(1);expect(disc(contacts,0).fade).toBeLessThan(1);
    });

    it('fades and widens a disc as its thing rises, and drops it once too high or hidden',()=>{
        const contacts=new ContactShadows(groundWorld()),scene=new THREE.Scene();attachContactShadows(scene,contacts);
        const rat=new THREE.Object3D();scene.add(rat);contacts.add(rat,.5);
        contacts.update();const grounded=disc(contacts,0);
        rat.position.y=1.5;contacts.update();const risen=disc(contacts,0);
        expect(risen.fade).toBeGreaterThan(0);expect(risen.fade).toBeLessThan(grounded.fade);
        expect(risen.width).toBeGreaterThan(grounded.width);
        rat.position.y=4;contacts.update();expect(contacts.mesh.count).toBe(0);
        rat.position.y=0;rat.visible=false;contacts.update();expect(contacts.mesh.count).toBe(0);
        rat.visible=true;scene.remove(rat);contacts.update();expect(contacts.mesh.count).toBe(0);
    });

    it('grounds a lying corpse under its body, not its feet',()=>{
        const contacts=new ContactShadows(groundWorld()),scene=new THREE.Scene();attachContactShadows(scene,contacts);
        // Feet at the origin, lying along +x: the body is 0.95 m further along.
        const corpse=new THREE.Object3D();corpse.rotation.z=-Math.PI/2;scene.add(corpse);
        contacts.add(corpse,.9,new THREE.Vector3(0,.95,0));contacts.update();
        expect(disc(contacts,0).at.x).toBeCloseTo(.95,2);
    });

    it('releases its disc buffers and leaves the scene on dispose',()=>{
        const contacts=new ContactShadows(groundWorld()),scene=new THREE.Scene();attachContactShadows(scene,contacts);
        const geometry=vi.fn(),material=vi.fn();
        contacts.mesh.geometry.addEventListener('dispose',geometry);contacts.mesh.material.addEventListener('dispose',material);
        contacts.add(new THREE.Object3D(),.5);
        contacts.dispose();
        expect(scene.children).not.toContain(contacts.mesh);expect(contacts.size).toBe(0);
        expect(geometry).toHaveBeenCalledOnce();expect(material).toHaveBeenCalledOnce();
    });
});

describe('what gets a contact disc',()=>{
    const originalDocument=globalThis.document,originalWindow=globalThis.window;
    beforeAll(()=>{
        vi.stubGlobal('window',{innerWidth:1280,innerHeight:720});
        vi.stubGlobal('document',{...originalDocument,querySelectorAll:()=>[],body:{appendChild(){}},createElement:()=>({...originalDocument.createElement('canvas'),
            style:{},dataset:{},appendChild(){},remove(){},setAttribute(){},getBoundingClientRect:()=>({width:220,height:100})})});
    });
    afterAll(()=>{vi.stubGlobal('document',originalDocument);vi.stubGlobal('window',originalWindow);});

    it('grounds every rat from creation until it is disposed',()=>{
        const world=groundWorld(),contacts=new ContactShadows(world),scene=new THREE.Scene();attachContactShadows(scene,contacts);
        const rats=[new RatEntity(scene,world,new THREE.Vector3(),'Rat',{},false),new RatEntity(scene,world,new THREE.Vector3(2,0,0),'Other',{},true)];
        expect(contacts.size).toBe(2);
        rats[0].dispose();expect(contacts.size).toBe(1);
        rats[1].dispose();expect(contacts.size).toBe(0);
    });

    it('grounds each corpse and a loose case, not a carried one, and lets go of all on dispose',()=>{
        const world=groundWorld(),contacts=new ContactShadows(world),scene=new THREE.Scene();attachContactShadows(scene,contacts);
        const carrier=new RatEntity(scene,world,new THREE.Vector3(),'Carrier',{},true),camera=new THREE.PerspectiveCamera();
        const view=new ChaosView(scene,id=>id==='carrier'?carrier:undefined,undefined,false);
        const corpse=(id:string):CorpseState=>({id,victimId:`gone-${id}`,owner:null,appearance:DEFAULT_APPEARANCE,born:0,expires:1e12,
            p:{x:0,y:.5,z:0},q:{x:0,y:0,z:.7071,w:.7071},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}});
        const state:ChaosState={time:0,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:3,y:.3,z:0},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},
            extraCases:[],dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},notice:{serial:0,text:''},corpses:[corpse('a'),corpse('b')],impacts:[],shots:[]};
        view.apply(state);view.update(1/60,camera);
        expect(contacts.size).toBe(1+2+1);
        view.apply({...state,time:50,corpses:[corpse('b')],case:{...state.case,owner:'carrier'}});view.update(1/60,camera);
        expect(contacts.size).toBe(1+1);
        view.apply({...state,time:100,corpses:[corpse('b')]});view.update(1/60,camera);
        expect(contacts.size).toBe(1+1+1);
        view.dispose();expect(contacts.size).toBe(1);
        carrier.dispose();expect(contacts.size).toBe(0);
    });
});
