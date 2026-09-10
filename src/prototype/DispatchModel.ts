import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

/** A bright municipal incident kiosk; the large red target is the only switch. */
export function buildDispatchModel(root:THREE.Group,screen:THREE.Texture){
    const enamel=new THREE.MeshStandardMaterial({color:0xe4b847,roughness:.4,metalness:.35,emissive:0x946526,emissiveIntensity:.24});
    const red=new THREE.MeshStandardMaterial({color:0xe63c32,emissive:0xf23825,emissiveIntensity:.65,roughness:.35});
    const dark=new THREE.MeshStandardMaterial({color:0x182936,roughness:.65,metalness:.45});
    const chrome=new THREE.MeshStandardMaterial({color:0xbcb9a4,roughness:.32,metalness:.75});
    const put=(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material,round=false)=>{
        const mesh=new THREE.Mesh(round?new RoundedBoxGeometry(w,h,d,3,.05):new THREE.BoxGeometry(w,h,d),mat);
        mesh.position.set(x,y,z);root.add(mesh);return mesh;
    };
    put(1.8,3.35,1.05,0,-.05,0,enamel,true);
    put(1.94,.22,1.17,0,-1.68,0,dark,true);
    put(1.94,.18,1.17,0,1.67,0,chrome,true);
    put(1.51,2.7,.10,0,.10,.555,dark,true);
    for(const x of [-.75,.75])for(const y of [-1.3,1.35])put(.07,.07,.035,x,y,.62,chrome);
    put(1.33,.62,.07,0,1.20,.62,chrome,true);
    const sign=put(1.19,.48,.015,0,1.20,.665,new THREE.MeshBasicMaterial({map:screen}));
    sign.name='dispatch-status-screen';
    put(1.12,1.04,.09,0,.50,.555,dark,true);
    const targetRed=new THREE.MeshBasicMaterial({color:0xff1008,toneMapped:false});
    const switchHandle=put(.84,.84,.10,0,.50,.64,targetRed,true);
    switchHandle.name='dispatch-shoot-target';
    const targetInk=new THREE.MeshBasicMaterial({color:0xfff2bb});
    for(const side of [-1,1]){
        const arrow=new THREE.Mesh(new THREE.ConeGeometry(.12,.23,3),targetInk);
        arrow.position.set(side*.62,.50,.71);arrow.rotation.z=side*Math.PI/2;root.add(arrow);
    }
    const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=64;
    const context=labelCanvas.getContext('2d')!;context.fillStyle='#fff0ad';context.fillRect(0,0,256,64);
    context.fillStyle='#43191d';context.font='bold 44px monospace';context.textAlign='center';context.fillText('SHOOT',128,48);
    const labelTexture=new THREE.CanvasTexture(labelCanvas);
    const labelMaterial=new THREE.MeshBasicMaterial({map:labelTexture});labelMaterial.addEventListener('dispose',()=>labelTexture.dispose());
    put(.86,.15,.02,0,-.08,.65,labelMaterial);
    // A wide red target reads clearly without changing the cabinet silhouette.
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.34,.025,6,20),targetRed);ring.position.set(0,.50,.70);root.add(ring);

    for(let row=0;row<6;row++)put(.85,.045,.025,0,-.20-row*.12,.62,chrome);
    put(1.16,.28,.04,0,-1.19,.615,chrome,true);
    put(.94,.075,.045,0,-1.18,.64,dark);
    for(const side of [-1,1]){
        put(.10,.7,.18,side*.93,.15,.20,chrome,true);
        for(let row=0;row<4;row++)put(.028,.07,.5,side*.915,-.7+row*.15,0,dark);
        put(.12,2.8,.12,side*.72,-.05,-.55,dark);
    }
    const lamp=put(.74,.16,.2,0,1.83,0,red,true);
    for(const x of [-.56,.56])put(.12,.28,.14,x,1.81,0,chrome,true);
    // A municipal red/blue lightbar: alternating visible lamps, not a dim ornament.
    const siren=new THREE.Group();siren.name='dispatch-ready-siren';siren.position.y=1.98;root.add(siren);
    const base=new THREE.Mesh(new THREE.BoxGeometry(1.45,.14,.65),dark);siren.add(base);
    const glass=new THREE.Mesh(new THREE.SphereGeometry(.30,20,12,0,Math.PI*2,0,Math.PI/2),
        new THREE.MeshStandardMaterial({color:0xb82720,emissive:0xff2812,emissiveIntensity:.06,roughness:.22,metalness:.1}));
    glass.position.set(-.4,.08,0);glass.scale.set(1.15,1.55,1.15);siren.add(glass);
    const blueGlass=glass.clone();blueGlass.material=(glass.material as THREE.MeshStandardMaterial).clone();
    blueGlass.material.color.setHex(0x294a96);blueGlass.material.emissive.setHex(0x537fff);blueGlass.position.x=.4;siren.add(blueGlass);
    const rotor=new THREE.Group();rotor.name='dispatch-siren-reflector';rotor.position.y=.18;siren.add(rotor);
    const reflector=new THREE.Mesh(new THREE.SphereGeometry(.19,12,8,0,Math.PI,0,Math.PI),
        new THREE.MeshBasicMaterial({color:0xe3a16f,toneMapped:false}));
    reflector.rotation.y=Math.PI/2;reflector.scale.z=.35;rotor.add(reflector);
    const glow=new THREE.Mesh(new THREE.SphereGeometry(.48,16,10),new THREE.MeshBasicMaterial({color:0xff3820,transparent:true,opacity:.2,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
    glow.position.set(-.4,.24,0);glow.scale.y=.85;siren.add(glow);
    const blueGlow=glow.clone();blueGlow.material=(glow.material as THREE.MeshBasicMaterial).clone();blueGlow.material.color.setHex(0x608dff);blueGlow.position.x=.4;siren.add(blueGlow);
    rotor.visible=false;glow.visible=false;blueGlow.visible=false;
    return {switchHandle,lamp,siren,glass,blueGlass,rotor,glow,blueGlow};
}

export function updateDispatchSiren(model:ReturnType<typeof buildDispatchModel>,ready:boolean,time:number):void {
    const red=Math.sin(time*9)>0;
    model.rotor.visible=ready;model.glow.visible=ready&&red;model.blueGlow.visible=ready&&!red;
    const material=model.glass.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity=ready?(red?5:.25):.06;
    (model.blueGlass.material as THREE.MeshStandardMaterial).emissiveIntensity=ready?(!red?5:.25):.06;
    if(ready)model.rotor.rotation.y=time*5;
}
