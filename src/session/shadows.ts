import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {useShadowDepthForm} from '../utils/shadowDepthForms';

/** City extent on x and z (both axes share it), as `CITY_BOUNDS`. */
export interface CityExtent {min:number;max:number}
export interface MoonFit {
    position:THREE.Vector3;target:THREE.Vector3;
    left:number;right:number;top:number;bottom:number;near:number;far:number;
    /** Shadow map texels across and up; at most `maxSize` each. */
    width:number;height:number;
}

/** Heights that must lie inside the moon map: surfaces that show a shadow (street, sewer, sea
 * floor, low roofs) and anything that casts one (tower tops). Taller receivers fall outside and
 * read as moonlit, which is how a roof above every neighbour looks anyway. */
const RECEIVERS={low:-14,high:48},CASTERS={low:-14,high:185},MARGIN=6;

/** An orthographic moon camera covering the whole city once, sized to `texel` world units per
 * shadow texel. It keeps world up, as the old moon camera did: for a moon over the diagonal the
 * texel grid then lies at 45° to the streets, so every wall's shadow edge steps one texel at a
 * time. A grid turned a few degrees off the streets (the tightest fit) draws long visible stairs. */
export function fitMoonShadow(towardGround:THREE.Vector3,city:CityExtent,texel:number,maxSize:number):MoonFit {
    const d=towardGround.clone().normalize();
    const lo=city.min-MARGIN,hi=city.max+MARGIN,mid=(city.min+city.max)/2;
    const target=new THREE.Vector3(mid,0,mid),position=target.clone().addScaledVector(d,-(CASTERS.high-CASTERS.low+hi-lo));
    const corners=(yLow:number,yHigh:number)=>[lo,hi].flatMap(x=>[yLow,yHigh].flatMap(y=>[lo,hi].map(z=>new THREE.Vector3(x,y,z).sub(position))));
    // Matrix4.lookAt's basis: x = up × z, y = z × x, with z pointing back at the light.
    const z=d.clone().negate(),x=new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP,z).normalize(),y=new THREE.Vector3().crossVectors(z,x);
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity,near=Infinity,far=-Infinity;
    for(const p of corners(RECEIVERS.low,RECEIVERS.high)){const u=p.dot(x),v=p.dot(y);left=Math.min(left,u);right=Math.max(right,u);bottom=Math.min(bottom,v);top=Math.max(top,v);}
    for(const p of corners(CASTERS.low,CASTERS.high)){const depth=p.dot(d);near=Math.min(near,depth);far=Math.max(far,depth);}
    const size=(span:number)=>Math.min(maxSize,Math.ceil(span/texel/64)*64);
    return {position,target,left,right,top,bottom,near:Math.max(.5,near-MARGIN),far:far+MARGIN,width:size(right-left),height:size(top-bottom)};
}

/** The moon's shadow of the static city (W8, decision D5: shadows stay, very light).
 *
 * The city never moves, so its moon shadow map is drawn once over the whole city and then only
 * when the scenery changes (`adoptCity`). Nothing else ever enters it: every caster outside the
 * adopted scenery is left out of that one draw, so a rat, corpse or case never leaves a shadow
 * behind. Moving things are grounded by the flashlight's per-frame map and `ContactShadows`.
 *
 * Until a city is adopted the map follows the old per-frame behaviour, so art previews that
 * build their own scenes still show every shadow. */
export class StaticMoonShadow {
    private scenery=new Set<THREE.Object3D>();
    private pending=false;
    /** This render was asked to draw the map. */
    private drawing=false;
    private readonly muted:THREE.Object3D[]=[];
    /** Draws of the moon map so far (diagnostics and tests). */
    bakes=0;
    constructor(readonly light:THREE.DirectionalLight,private readonly shadowMap:{enabled:boolean;autoUpdate:boolean;needsUpdate:boolean}) {}

    /** Every scene child not in `before` is the city's static scenery, replacing any earlier
     * city; the map is redrawn with the next frame. Call after the city is built. The scenery's
     * instanced casters get their form's depth material (see `useShadowDepthForm`). */
    adoptCity(scene:THREE.Scene,before:ReadonlySet<THREE.Object3D>):void {
        this.scenery=new Set(scene.children.filter(object=>!before.has(object)));
        for(const root of this.scenery)root.traverse(object=>{if(object instanceof THREE.Mesh)useShadowDepthForm(object);});
        this.pending=true;this.light.shadow.autoUpdate=false;
    }

    /** Scene `onBeforeRender`: on a redraw frame, cast only the scenery. Nothing on other frames. */
    beforeRender(scene:THREE.Scene):void {
        if(!this.pending)return;
        // A render that skips shadow maps (a warm-up with scenery hidden) must not take the redraw.
        if(!this.shadowMap.enabled||!this.shadowMap.autoUpdate&&!this.shadowMap.needsUpdate||!this.light.castShadow)return;
        for(const root of this.scenery)if(root.parent!==scene)this.scenery.delete(root);
        for(const child of scene.children)if(!this.scenery.has(child))this.mute(child);
        this.light.shadow.needsUpdate=true;this.drawing=true;
    }
    /** Scene `onAfterRender`: restore the casters left out of the redraw. */
    afterRender():void {
        if(!this.drawing)return;
        this.drawing=false;
        for(const object of this.muted)object.castShadow=true;
        this.muted.length=0;
        // three clears `needsUpdate` once the map is drawn; if the light was culled, try again next frame.
        if(this.light.shadow.needsUpdate)this.light.shadow.needsUpdate=false;
        else {this.pending=false;this.bakes++;}
    }
    /** Leave `object` and its children out of the moon map. Lights keep casting: muting one
     * (the moon itself, the flashlight) would drop its whole map from this render. */
    private mute(object:THREE.Object3D):void {
        if(object.castShadow&&!(object instanceof THREE.Light)){object.castShadow=false;this.muted.push(object);}
        for(const child of object.children)this.mute(child);
    }
}

/** Largest number of grounded things at once: every rat of a full room plus the corpse cap. */
const CONTACT_CAPACITY=64;
/** The ray starts a little above the anchor, so a rat standing on a step still finds that step. */
const RAY_LIFT=.35,RAY_DROP=6,FADE_HEIGHT=3.2,STILL=.04*.04;

interface Contact {object:THREE.Object3D;radius:number;centre?:THREE.Vector3;hit:boolean;x:number;y:number;z:number;ground:THREE.Vector3;normal:THREE.Vector3}

/** A soft dark disc on the ground under each moving thing (rats, corpses, the loose case): the
 * light replacement for their moon shadow. One instanced draw, no lights, no shadow map. The
 * ground comes from one short ray down through the static city, repeated only when the thing
 * has moved; the disc fades and widens with height and vanishes above `FADE_HEIGHT`. */
export class ContactShadows {
    readonly mesh:THREE.InstancedMesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
    private readonly contacts=new Map<THREE.Object3D,Contact>();
    private readonly ray=new CANNON.Ray();
    private readonly result=new CANNON.RaycastResult();
    private readonly aabb=new CANNON.AABB();
    private readonly bodies:CANNON.Body[]=[];
    private readonly fixed:CANNON.Body[]=[];
    private readonly fade:THREE.InstancedBufferAttribute;
    private readonly matrix=new THREE.Matrix4();
    private readonly quaternion=new THREE.Quaternion();
    private readonly scale=new THREE.Vector3();
    private readonly at=new THREE.Vector3();
    private readonly anchor=new THREE.Vector3();
    private static readonly UP=new THREE.Vector3(0,1,0);
    constructor(private readonly world:CANNON.World) {
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,-.5,.5,0,-.5,.5,0,.5,-.5,0,.5],3));
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
        geometry.setIndex([0,2,1,0,3,2]);
        this.fade=new THREE.InstancedBufferAttribute(new Float32Array(CONTACT_CAPACITY),1);this.fade.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('contactFade',this.fade);
        const material=new THREE.ShaderMaterial({
            uniforms:THREE.UniformsUtils.clone(THREE.UniformsLib.fog),fog:true,transparent:true,depthWrite:false,
            polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
            vertexShader:`attribute float contactFade;varying float vFade;varying vec2 vUv;
                #include <fog_pars_vertex>
                void main(){vFade=contactFade;vUv=uv*2.-1.;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
                #include <fog_vertex>
                }`,
            fragmentShader:`varying float vFade;varying vec2 vUv;
                #include <fog_pars_fragment>
                void main(){float r=dot(vUv,vUv);float a=vFade*.5*(1.-smoothstep(.05,1.,r));
                #ifdef USE_FOG
                #ifdef FOG_EXP2
                a*=exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
                #else
                a*=1.-smoothstep(fogNear,fogFar,vFogDepth);
                #endif
                #endif
                if(a<.004)discard;gl_FragColor=vec4(0.,0.,0.,a);}`,
        });
        this.mesh=new THREE.InstancedMesh(geometry,material,CONTACT_CAPACITY);
        this.mesh.name='contact-shadows';this.mesh.count=0;this.mesh.frustumCulled=false;
        this.mesh.castShadow=this.mesh.receiveShadow=false;this.mesh.renderOrder=-1;
        this.mesh.raycast=()=>{};this.mesh.userData.noNoir=true;this.mesh.matrixAutoUpdate=false;
        this.ray.mode=CANNON.Ray.CLOSEST;this.ray.skipBackfaces=true;this.ray.collisionFilterMask=1;
    }
    get size():number {return this.contacts.size;}
    /** Ground `object` with a disc of `radius` under its position, or under `centre` (in the
     * object's own frame) when its origin is not its middle, as for a corpse lying on its side.
     * The object's parent must sit at the world origin (the scene or an untransformed group).
     * Adding an object already grounded keeps its disc as it is. */
    add(object:THREE.Object3D,radius:number,centre?:THREE.Vector3):void {
        if(!this.contacts.has(object))this.contacts.set(object,{object,radius,...(centre?{centre}:{}),hit:false,x:NaN,y:NaN,z:NaN,ground:new THREE.Vector3(),normal:new THREE.Vector3(0,1,0)});
    }
    remove(object:THREE.Object3D):void {this.contacts.delete(object);}

    /** Place the discs for this frame. Rays only run for things that moved. */
    update():void {
        let count=0;
        for(const contact of this.contacts.values()){
            if(count>=CONTACT_CAPACITY)break;
            const object=contact.object;
            if(!visibleInScene(object))continue;
            const p=contact.centre?this.anchor.copy(contact.centre).applyQuaternion(object.quaternion).add(object.position):object.position;
            // Negated so a new contact (last position NaN) casts its first ray.
            if(!((p.x-contact.x)**2+(p.y-contact.y)**2+(p.z-contact.z)**2<=STILL)){
                contact.x=p.x;contact.y=p.y;contact.z=p.z;
                contact.hit=this.ground(p.x,p.y+RAY_LIFT,p.z,contact);
            }
            if(!contact.hit)continue;
            const height=Math.max(0,p.y-contact.ground.y);
            if(height>=FADE_HEIGHT)continue;
            const fade=1-height/FADE_HEIGHT,width=contact.radius*2*(1+height*.18);
            this.quaternion.setFromUnitVectors(ContactShadows.UP,contact.normal);
            this.at.copy(contact.ground).addScaledVector(contact.normal,.03);
            this.matrix.compose(this.at,this.quaternion,this.scale.set(width,1,width));
            this.mesh.setMatrixAt(count,this.matrix);
            this.fade.setX(count,fade*fade);
            count++;
        }
        if(count||this.mesh.count){this.mesh.instanceMatrix.needsUpdate=true;this.fade.needsUpdate=true;}
        this.mesh.count=count;
    }
    /** The static city surface below (x, y, z), within `RAY_DROP`. */
    private ground(x:number,y:number,z:number,contact:Contact):boolean {
        const {ray,result,aabb}=this;
        ray.from.set(x,y,z);ray.to.set(x,y-RAY_DROP,z);
        aabb.lowerBound.set(x-.01,y-RAY_DROP,z-.01);aabb.upperBound.set(x+.01,y,z+.01);
        this.bodies.length=0;this.fixed.length=0;
        this.world.broadphase.aabbQuery(this.world,aabb,this.bodies);
        // Static only: moving rats, corpses and the case are bodies too, and stand in the ray.
        for(const body of this.bodies)if(body.type===CANNON.Body.STATIC)this.fixed.push(body);
        result.reset();
        ray.intersectBodies(this.fixed,result);
        if(!result.hasHit)return false;
        contact.ground.set(result.hitPointWorld.x,result.hitPointWorld.y,result.hitPointWorld.z);
        contact.normal.set(result.hitNormalWorld.x,result.hitNormalWorld.y,result.hitNormalWorld.z);
        if(contact.normal.y<.5)contact.normal.set(0,1,0);
        return true;
    }
    dispose():void {this.contacts.clear();this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}

function visibleInScene(object:THREE.Object3D):boolean {
    let node:THREE.Object3D|null=object;
    for(;node;node=node.parent){if(!node.visible)return false;if(!node.parent)return node instanceof THREE.Scene;}
    return false;
}

const contactsByScene=new WeakMap<THREE.Scene,ContactShadows>();
/** The contact shadows of a stage's scene (none for scenes without a stage). */
export function contactShadowsOf(scene:THREE.Scene):ContactShadows|undefined {return contactsByScene.get(scene);}
export function attachContactShadows(scene:THREE.Scene,contacts:ContactShadows):void {contactsByScene.set(scene,contacts);scene.add(contacts.mesh);}
