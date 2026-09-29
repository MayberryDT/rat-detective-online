/** Offline title backdrop: a noir detective's office at night, path traced once (three-gpu-pathtracer)
 * into the images under public/title/. See test/visual/title-assets/README.md for how to render.
 * ?variant=desktop|phone  ?mode=raster|trace  ?spp=N  ?pass=beauty|blinds|lamp|die
 * Publishes `window.titleRender` (a promise of PNG data URLs) and `window.titleLayout` (overlay CSS). */
import * as THREE from 'three';
import {WebGLPathTracer,PhysicalCamera,PhysicalSpotLight,GradientEquirectTexture} from 'three-gpu-pathtracer';
import {pbr,tile,canvas,prep,rnd,paper,pin,string,mugshot,newspaper,cityMap,poster,indexCard,sticky,receipt,folderLabel,scrawl,ace,phone,tumbler,cheese,mug,ashtray,fedora,magnifier,lamp,die} from './title-props';

const q=new URLSearchParams(location.search);
const pass=q.get('pass')??'beauty',trace=q.get('mode')==='trace',spp=Number(q.get('spp')??300);
/** Each variant is one camera on the same room; `w`×`h` is the delivered image. */
const VARIANTS:Record<string,{w:number;h:number;eye:[number,number,number];look:[number,number,number];fov:number}>={
    desktop:{w:1920,h:1080,eye:[.12,1.5,1.95],look:[.12,1.3,0],fov:48},
    phone:{w:1920,h:888,eye:[.14,1.47,2.2],look:[.14,1.32,0],fov:38.5},
};
const variant=VARIANTS[q.get('variant')??'desktop']!,shrink=Number(q.get('scale')??1),exposure=Number(q.get('exposure')??1);
const status=document.getElementById('status')!;
await document.fonts.load('40px Bangers');await document.fonts.load('40px "Permanent Marker"');await document.fonts.load('40px "Special Elite"');

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:pass==='die',premultipliedAlpha:false});
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=exposure;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;
renderer.setPixelRatio(1);document.body.appendChild(renderer.domElement);
const photo=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});photo.toneMapping=THREE.ACESFilmicToneMapping;

const scene=new THREE.Scene();
const camera=new PhysicalCamera(variant.fov,variant.w/variant.h,.05,40);
camera.position.set(...variant.eye);camera.lookAt(...variant.look);
camera.focusDistance=camera.position.distanceTo(new THREE.Vector3(...variant.look));camera.fStop=5.6;camera.apertureBlades=6;

// ── Room ─────────────────────────────────────────────────────────────────────────────────────────────
const W={left:-1.6,right:1.9,front:3.4,ceiling:2.9,desk:.76};
const plaster=pbr('PaintedPlaster017'),wallMat=new THREE.MeshStandardMaterial({...plaster,color:0x7d8a7a,roughness:1});
function box(w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number,uv=1):THREE.Mesh {
    const m=new THREE.Mesh(tile(new THREE.BoxGeometry(w,h,d),Math.max(w,d)*uv,h*uv),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);return m;
}
// Back wall with the visible window (x -1.42..-0.92); the left wall's window, out of frame, throws the stripes.
const back={x0:-1.42,x1:-.92,y0:.98,y1:2.3};
box(back.x0-W.left,W.ceiling,.1,wallMat,(W.left+back.x0)/2,W.ceiling/2,-.05,.8);
box(W.right-back.x1,W.ceiling,.1,wallMat,(back.x1+W.right)/2,W.ceiling/2,-.05,.8);
box(back.x1-back.x0,back.y0,.1,wallMat,(back.x0+back.x1)/2,back.y0/2,-.05,.8);
box(back.x1-back.x0,W.ceiling-back.y1,.1,wallMat,(back.x0+back.x1)/2,(W.ceiling+back.y1)/2,-.05,.8);
box(.1,W.ceiling,W.front,wallMat,W.right+.05,W.ceiling/2,W.front/2,.8);
box(W.right-W.left,W.ceiling,.1,wallMat,(W.left+W.right)/2,W.ceiling/2,W.front+.05,.8);
box(W.right-W.left+.2,.1,W.front+.2,new THREE.MeshStandardMaterial({color:0x2a2622,roughness:.9}),(W.left+W.right)/2,W.ceiling+.05,W.front/2);
const floorWood=pbr('Wood026');box(W.right-W.left,.1,W.front,new THREE.MeshStandardMaterial({...floorWood,color:0x6a5a4a}),(W.left+W.right)/2,-.05,W.front/2,1.2);
// Left wall with the stripe window (out of frame): z 0.55..1.75, sill 0.98, head 2.42.
const win={z0:.55,z1:1.75,y0:.98,y1:2.42};
box(.1,win.y0,W.front,wallMat,W.left-.05,win.y0/2,W.front/2,.8);
box(.1,W.ceiling-win.y1,W.front,wallMat,W.left-.05,(W.ceiling+win.y1)/2,W.front/2,.8);
box(.1,win.y1-win.y0,win.z0,wallMat,W.left-.05,(win.y0+win.y1)/2,win.z0/2,.8);
box(.1,win.y1-win.y0,W.front-win.z1,wallMat,W.left-.05,(win.y0+win.y1)/2,(W.front+win.z1)/2,.8);
const trim=new THREE.MeshPhysicalMaterial({color:0x2f2a24,roughness:.45,clearcoat:.5});
// Rain on the glass: a normal map of drops and runs.
const rain=(()=>{const S=512,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d')!;x.fillStyle='#000';x.fillRect(0,0,S,S);
    for(let i=0;i<260;i++){const px=rnd(0,S),py=rnd(0,S),r=rnd(1.5,6),g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'#fff');g.addColorStop(1,'#000');x.fillStyle=g;x.beginPath();x.ellipse(px,py,r*.8,r,0,0,Math.PI*2);x.fill();}
    x.strokeStyle='rgba(255,255,255,.5)';for(let i=0;i<22;i++){let px=rnd(0,S),py=rnd(0,S*.5);x.lineWidth=rnd(1.5,3);x.beginPath();x.moveTo(px,py);for(let k=0;k<12;k++){px+=rnd(-3,3);py+=rnd(10,26);x.lineTo(px,py);}x.stroke();}
    const h=x.getImageData(0,0,S,S).data,out=x.createImageData(S,S),at=(i:number,j:number)=>h[(((j+S)%S)*S+((i+S)%S))*4]!/255;
    for(let j=0;j<S;j++)for(let i=0;i<S;i++){const dx=(at(i+1,j)-at(i-1,j))*2,dy=(at(i,j+1)-at(i,j-1))*2,k=(j*S+i)*4;
        const n=new THREE.Vector3(-dx,dy,1).normalize();out.data[k]=(n.x*.5+.5)*255;out.data[k+1]=(n.y*.5+.5)*255;out.data[k+2]=(n.z*.5+.5)*255;out.data[k+3]=255;}
    x.putImageData(out,0,0);return prep(new THREE.CanvasTexture(c),false);})();
// Shadow rays pass the glass (the tracer has no caustics), so window light reaches the room.
const glassMat=Object.assign(new THREE.MeshPhysicalMaterial({color:0xdfe8f0,roughness:.04,transmission:1,thickness:.004,ior:1.5,normalMap:rain,normalScale:new THREE.Vector2(.45,.45)}),{castShadow:false});
const slatMat=new THREE.MeshPhysicalMaterial({color:0xd9d2c0,roughness:.45,clearcoat:.3,side:THREE.DoubleSide}),tapeMat=new THREE.MeshStandardMaterial({color:0xcfc6b2,roughness:.9});
/** A rainy window in its local XY plane (room on +z): trim, glass, and venetian blinds (wide painted slats,
 * `tilt` radians off level, outer edge up when positive) lowered to `foot` above the sill. */
function blindsWindow(w:number,h:number,foot:number,tilt:number,glazed=true):THREE.Group {
    const g=new THREE.Group(),add=(m:THREE.Mesh,x:number,y:number,z:number)=>{m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);return m;};
    if(glazed)add(new THREE.Mesh(tile(new THREE.PlaneGeometry(w,h),w*2,h*2),glassMat),0,0,-.06);
    add(new THREE.Mesh(new THREE.BoxGeometry(w+.1,.04,.16),trim),0,-h/2-.02,-.02);add(new THREE.Mesh(new THREE.BoxGeometry(w+.1,.05,.14),trim),0,h/2+.025,-.03);
    for(const s of [-1,1])add(new THREE.Mesh(new THREE.BoxGeometry(.04,h,.14),trim),s*(w/2+.01),0,-.03);
    add(new THREE.Mesh(new THREE.BoxGeometry(w,.035,.05),trim),0,.1,-.07);
    const slat=new THREE.PlaneGeometry(w+.04,.052,1,6),p=slat.attributes.position!;
    for(let i=0;i<p.count;i++)p.setZ(i,-((p.getY(i)/.026)**2)*.004);slat.computeVertexNormals();
    const bottom=-h/2+foot;
    for(let y=bottom;y<h/2-.04;y+=.047)add(new THREE.Mesh(slat,slatMat),0,y,.03).rotation.x=tilt-Math.PI/2;
    add(new THREE.Mesh(new THREE.BoxGeometry(w+.06,.05,.04),trim),0,h/2-.03,.03);add(new THREE.Mesh(new THREE.BoxGeometry(w+.04,.02,.03),slatMat),0,bottom-.03,.03);
    for(const x of [-w/2+.2,w/2-.2])add(new THREE.Mesh(new THREE.BoxGeometry(.04,h/2-bottom,.012),tapeMat),x,(h/2+bottom)/2-.02,.03);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.003,.003,h/2-bottom+.25,6),tapeMat),w/2-.05,(h/2+bottom)/2-.12,.06);
    return g;
}
const stripeWindow=blindsWindow(win.z1-win.z0,win.y1-win.y0,.42,-.27,false);stripeWindow.position.set(W.left,(win.y0+win.y1)/2,(win.z0+win.z1)/2);stripeWindow.rotation.y=Math.PI/2;scene.add(stripeWindow);
const backWindow=blindsWindow(back.x1-back.x0,back.y1-back.y0,.5,.3);backWindow.position.set((back.x0+back.x1)/2,(back.y0+back.y1)/2,0);scene.add(backWindow);
// The city outside: a glowing skyline in the rain, behind both windows.
const skyline=canvas(2048,1024,c=>{
    const g=c.createLinearGradient(0,0,0,1024);g.addColorStop(0,'#05070f');g.addColorStop(.55,'#1a2440');g.addColorStop(.8,'#4a3a48');g.addColorStop(1,'#1a1418');c.fillStyle=g;c.fillRect(0,0,2048,1024);
    for(let layer=0;layer<3;layer++)for(let x=-40;x<2048;x+=rnd(60,160)){
        const w=rnd(70,190),top=rnd(260,640)+layer*110,shade=12+layer*8;c.fillStyle=`rgb(${shade},${shade+2},${shade+10})`;c.fillRect(x,top,w,1024-top);
        for(let wy=top+14;wy<1000;wy+=22)for(let wx=x+8;wx<x+w-10;wx+=16)if(rnd()<.28){c.fillStyle=rnd()<.85?`rgba(255,${rnd(170,215)|0},110,${rnd(.5,.95)})`:'rgba(120,220,230,.8)';c.fillRect(wx,wy,8,11);}
    }
    c.shadowBlur=30;c.font='120px Bangers';c.shadowColor='#ff2a2a';c.fillStyle='#ff5a4a';c.fillText('HOTEL',1180,420);c.shadowColor='#2ae0e0';c.fillStyle='#8af4f0';c.font='90px Bangers';c.fillText('CHEESE',420,560);
    c.shadowBlur=0;c.filter='blur(7px)';c.drawImage(c.canvas,0,0);
});
const cityMat=new THREE.MeshStandardMaterial({color:0,emissive:0xffffff,emissiveMap:skyline,emissiveIntensity:pass==='beauty'?1.05:0});
const city=new THREE.Mesh(new THREE.PlaneGeometry(9,4.5),cityMat);city.rotation.y=Math.PI/2;city.position.set(W.left-4.5,1.6,.9);scene.add(city);
const backCity=new THREE.Mesh(new THREE.PlaneGeometry(9,4.5),cityMat);backCity.position.set(-2.4,1.2,-4);scene.add(backCity);

// ── Desk ─────────────────────────────────────────────────────────────────────────────────────────────
const deskWood=pbr('Wood066'),deskMat=new THREE.MeshPhysicalMaterial({...deskWood,roughness:.55,clearcoat:.45,clearcoatRoughness:.25});
box(W.right-W.left-.02,.045,.92,deskMat,(W.left+W.right)/2,W.desk-.0225,.47,1.6);
box(W.right-W.left-.02,.7,.04,new THREE.MeshPhysicalMaterial({...deskWood,roughness:.6}),(W.left+W.right)/2,W.desk-.4,.88,1.6);
const leather=pbr('Leather037');box(.9,.006,.46,new THREE.MeshStandardMaterial({...leather,color:0x3d4a38}),.05,W.desk+.003,.36,1.4);

// ── Cork board ───────────────────────────────────────────────────────────────────────────────────────
const B={x:.3,y:1.46,w:2.2,h:1.08};
const cork=pbr('Cork003');box(B.w,B.h,.02,new THREE.MeshStandardMaterial({...cork,roughness:1}),B.x,B.y,.01,2.2);
const frameMat=new THREE.MeshPhysicalMaterial({...pbr('Wood026'),color:0x7a5a3c,roughness:.5,clearcoat:.4});
for(const s of [-1,1]){box(B.w+.1,.05,.04,frameMat,B.x,B.y+s*(B.h/2+.025),.02,2);box(.05,B.h,.04,frameMat,B.x+s*(B.w/2+.025),B.y,.02,2);}
const board=new THREE.Group();board.position.set(B.x,B.y,.021);scene.add(board);
const world=(x:number,y:number,z=0)=>new THREE.Vector3(x,y,z).add(board.position);
type Item={x:number;y:number;w:number;h:number;r:number;map:THREE.Texture;curl?:number;corner?:[number,number];pins?:[number,number][];gloss?:boolean};
const ties:Record<string,THREE.Vector3>={};
function pinUp(name:string,it:Item):THREE.Mesh {
    const m=paper(it.w,it.h,it.map,{curl:it.curl??.25,corner:it.corner,gloss:it.gloss,bow:1});
    m.position.set(it.x,it.y,.001+rnd(0,.002));m.rotation.z=it.r;board.add(m);m.updateMatrixWorld(true);
    (it.pins??[[0,.42]]).forEach(([px,py],i)=>{ties[i?`${name}${i}`:name]=pin(scene,m.localToWorld(new THREE.Vector3(px*it.w,py*it.h,.004)));});
    return m;
}
const looks=[
    {coatColor:0x885b89,hatColor:0x386caa,furColor:0xb4b0ab,highlightColor:0xe9dfc9,accessory:'cigarette' as const},
    {coatColor:0xc5a044,hatColor:0x7c899c,furColor:0xe8b84d,highlightColor:0xcbb596,accessory:'scarf' as const},
    {coatColor:0x398d92,hatColor:0x97765f,furColor:0xe8dac0,highlightColor:0xd9bf80,accessory:'badge' as const},
    {coatColor:0x43825e,hatColor:0x885b89,furColor:0xb79d83,highlightColor:0xb8b9c8},
];
const mug1=mugshot(photo,looks[0]!,'"THE CHEDDAR KID"','No. 0417',.25);
const mug2=mugshot(photo,looks[1]!,'BIG GOUDA','No. 0231',-.3);
const mug3=mugshot(photo,looks[2]!,'slippery sal?','No. 0666',.1);
const mug4=mugshot(photo,looks[3]!,'ALIBI: NONE','No. 0099',-.15);
const paperOnly=(mug4.image as HTMLCanvasElement);
/** Overlay stock: the HTML prints on these (see layout below). */
const stock={
    poster:{x:-.05,y:.09,w:.62,h:.72,r:-.018,map:poster(),curl:.18,corner:[1,-1] as [number,number],pins:[[-.42,.46],[.42,.46]] as [number,number][]},
    card:{x:-.68,y:-.34,w:.64,h:.36,r:.03,map:indexCard(),curl:.2,corner:[-1,-1] as [number,number],pins:[[0,.4]] as [number,number][]},
    enter:{x:.56,y:-.36,w:.5,h:.22,r:-.04},
    sticky:{x:.44,y:.26,w:.26,h:.26,r:.09,map:sticky(),curl:.35,corner:[1,-1] as [number,number],pins:[[0,.42]] as [number,number][]},
};
const posterMesh=pinUp('poster',stock.poster),cardMesh=pinUp('card',stock.card),stickyMesh=pinUp('sticky',stock.sticky);
pinUp('clip',{x:-.88,y:.26,w:.3,h:.37,r:-.05,map:newspaper(paperOnly),curl:.3,corner:[1,-1]});
pinUp('mug1',{x:-.54,y:.31,w:.24,h:.28,r:.07,map:mug1,gloss:true,corner:[1,-1]});
pinUp('mug2',{x:-.62,y:.02,w:.24,h:.28,r:-.06,map:mug2,gloss:true,corner:[-1,-1]});
pinUp('mug3',{x:.7,y:.3,w:.24,h:.28,r:-.08,map:mug3,gloss:true,corner:[1,-1]});
pinUp('note',{x:.03,y:-.41,w:.2,h:.13,r:-.12,map:scrawl('who squeaked?',200,130),curl:.3,corner:[1,-1]});
pinUp('ace',{x:.7,y:-.02,w:.1,h:.14,r:.2,map:ace(),curl:.2,corner:[-1,-1]});
pinUp('map',{x:.9,y:.0,w:.32,h:.25,r:.05,map:cityMap(),curl:.2,corner:[-1,-1]});
pinUp('receipt',{x:.98,y:-.34,w:.09,h:.19,r:.14,map:receipt(),curl:.4,corner:[1,-1]});
// ENTER CITY is an HTML scrap; its pin is baked so the string ends on it.
const enterPin=world(stock.enter.x,stock.enter.y+stock.enter.h*.42,.004);ties.enter=pin(scene,enterPin);
for(const [a,b] of [['poster','mug1'],['mug1','clip'],['mug2','clip'],['mug2','card'],['poster1','mug3'],['mug3','map'],['map','enter'],['card','enter'],['sticky','poster1'],['receipt','map'],['note','card'],['ace','mug3']] as const)string(scene,ties[a]!,ties[b]!);

// ── Desk clutter ─────────────────────────────────────────────────────────────────────────────────────
const put=(o:THREE.Object3D,x:number,z:number,ry=0,y=W.desk)=>{o.position.set(x,y,z);o.rotation.y=ry;o.traverse(c=>{c.castShadow=c.receiveShadow=true;});scene.add(o);return o;};
const folders=new THREE.Group(),manila=pbr('Paper005');
for(let i=0;i<4;i++){const f=new THREE.Mesh(new THREE.BoxGeometry(.36,.008,.26),new THREE.MeshStandardMaterial({...manila,color:0xd9bd84}));f.position.set(rnd(-.01,.01),.004+i*.009,rnd(-.01,.01));f.rotation.y=rnd(-.06,.06);folders.add(f);
    const sheet=new THREE.Mesh(new THREE.BoxGeometry(.3,.003,.24),new THREE.MeshStandardMaterial({color:0xf0ebe0,roughness:.9}));sheet.position.set(.03,.009+i*.009,-.01);sheet.rotation.y=rnd(-.1,.1);folders.add(sheet);}
const top=paper(.36,.26,folderLabel(),{rough:.9});top.rotation.x=-Math.PI/2;top.position.y=.042;folders.add(top);
put(folders,-.55,.34,.3);
put(magnifier(),-.5,.36,-.5,W.desk+.052);
put(mug(),-.78,.5,.6);
put(fedora(),1.02,.4,-.4).rotation.z=.04;
const tray=ashtray();put(tray.group,.72,.34,.8);
put(cheese(),.5,.42,-2.2);
put(phone(),-1.0,.28,.5);
put(tumbler(),.28,.3,0);
const lampBase=new THREE.Vector3(1.24,W.desk,.5),lampAim=world(0,.04);
const desk=lamp(lampBase,lampAim);scene.add(desk.group);
const pencil=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.18,6),new THREE.MeshStandardMaterial({color:0xd8a520,roughness:.5}));pencil.rotation.set(Math.PI/2,0,1.2);put(pencil,-.22,.46,.3,W.desk+.01);
const dieSpot=new THREE.Vector3(.06,W.desk,.34);

// ── Light ────────────────────────────────────────────────────────────────────────────────────────────
const on=(name:string)=>pass==='beauty'||pass===name||pass==='die';
const lampLight=new PhysicalSpotLight(0xffc88a,on('lamp')?20:0,0,.84,1,2);lampLight.radius=.03;lampLight.position.copy(desk.bulb);lampLight.target.position.copy(lampAim);
const street=new PhysicalSpotLight(0xb3c8ff,on('blinds')?380:0,0,.42,.5,2);street.radius=.006;street.position.set(W.left-1.3,2.9,1.55);street.target.position.copy(world(-.55,.05));
const pool=new PhysicalSpotLight(0xfff0dc,pass==='beauty'?120:0,0,.12,.6,2);pool.radius=.04;pool.position.set(dieSpot.x+.25,W.ceiling-.05,dieSpot.z+.55);pool.target.position.copy(dieSpot);
for(const l of [lampLight,street,pool]){scene.add(l,l.target);l.castShadow=true;l.shadow.mapSize.set(2048,2048);l.shadow.bias=-.0002;l.shadow.radius=4;l.shadow.blurSamples=12;}
street.shadow.mapSize.set(4096,4096);
const env=new GradientEquirectTexture();env.topColor.set(0x1b2233);env.bottomColor.set(0x0a0806);env.update();
scene.environment=env;scene.environmentIntensity=pass==='beauty'?.35:0;scene.background=new THREE.Color(0x000000);
if(!trace)scene.add(new THREE.HemisphereLight(0x33405a,0x140e0a,pass==='beauty'?.6:0));

// ── Layout: overlay quads in image pixels, written as CSS the title uses ─────────────────────────────
camera.updateMatrixWorld();scene.updateMatrixWorld(true);
function px(v:THREE.Vector3):[number,number]{const p=v.clone().project(camera);return [Math.round((p.x+1)/2*variant.w*10)/10,Math.round((1-p.y)/2*variant.h*10)/10];}
/** matrix3d taking a w×h element (origin top-left) onto the quad tl,tr,br,bl. */
function quad(pts:[number,number][],w:number,h:number):string {
    const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=pts as [[number,number],[number,number],[number,number],[number,number]];
    const sx=x0-x1+x2-x3,sy=y0-y1+y2-y3,dx1=x1-x2,dy1=y1-y2,dx2=x3-x2,dy2=y3-y2,den=dx1*dy2-dx2*dy1;
    const g=(sx*dy2-dx2*sy)/den,hh=(dx1*sy-sx*dy1)/den;
    const a=x1-x0+g*x1,b=x3-x0+hh*x3,d=y1-y0+g*y1,e=y3-y0+hh*y3;
    return `matrix3d(${[a/w,d/w,0,g/w,b/h,e/h,0,hh/h,0,0,1,0,x0,y0,0,1].map(n=>+n.toFixed(6)).join(',')})`;
}
const corners=(m:THREE.Object3D,w:number,h:number)=>[[-w/2,h/2],[w/2,h/2],[w/2,-h/2],[-w/2,-h/2]].map(([x,y])=>px(m.localToWorld(new THREE.Vector3(x,y,.001))));
const enterFrame=new THREE.Object3D();enterFrame.position.set(stock.enter.x,stock.enter.y,.004);enterFrame.rotation.z=stock.enter.r;board.add(enterFrame);board.updateMatrixWorld(true);
const glassCorners=[[back.x0,back.y0+.47],[back.x1,back.y0+.47],[back.x1,back.y0],[back.x0,back.y0]].map(([x,y])=>px(new THREE.Vector3(x!,y!,-.06)));
const layout={
    '--plate-w':`${variant.w}px`,'--plate-h':`${variant.h}px`,
    // Overlay elements are sized in millimetres of the paper they print on.
    '--poster':quad(corners(posterMesh,stock.poster.w,stock.poster.h),620,720),
    '--card':quad(corners(cardMesh,stock.card.w,stock.card.h),640,360),
    '--sticky':quad(corners(stickyMesh,stock.sticky.w,stock.sticky.h),260,260),
    '--enter':quad(corners(enterFrame,stock.enter.w,stock.enter.h),500,220),
    '--die':`translate(${px(dieSpot).join('px,')}px)`,'--smoke':`translate(${px(tray.group.localToWorld(tray.ember.clone())).join('px,')}px)`,
    '--glass':`polygon(${glassCorners.map(([x,y])=>`${(x/variant.w*100).toFixed(2)}% ${(y/variant.h*100).toFixed(2)}%`).join(',')})`,
};
Object.assign(window,{titleLayout:layout});console.log(JSON.stringify(layout));

// ── Render ───────────────────────────────────────────────────────────────────────────────────────────
renderer.setSize(variant.w*shrink,variant.h*shrink,false);
const tracer=new WebGLPathTracer(renderer);
renderer.domElement.addEventListener('webglcontextlost',()=>console.error('WebGL context lost at sample',tracer.samples));
tracer.tiles.set(4,4);tracer.renderDelay=0;tracer.fadeDuration=0;tracer.minSamples=1;tracer.bounces=6;tracer.transmissiveBounces=4;tracer.filterGlossyFactor=.5;tracer.renderToCanvas=false;
/** Path trace `target` to `samples` and develop the averaged float target on the CPU (ACES filmic, as the
 * raster preview, then sRGB): the image never goes through a canvas blit, which loses the context here. */
async function traced(target:THREE.Scene,cam:THREE.Camera,samples:number):Promise<HTMLCanvasElement> {
    tracer.setScene(target,cam);
    // Wait for each tile on a fence before queueing the next (WebGL finish() does not block): an unbounded
    // GPU queue makes the final readback wait long enough to trip Chrome's GPU watchdog.
    const gl=renderer.getContext() as WebGL2RenderingContext;
    while(tracer.samples<samples){
        tracer.renderSample();const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0)!;gl.flush();
        while(gl.clientWaitSync(fence,0,0)===gl.TIMEOUT_EXPIRED)await pause(1);
        gl.deleteSync(fence);status.textContent=`${pass} ${tracer.samples.toFixed(0)}/${samples}`;
    }
    const t=tracer.target,w=t.width,h=t.height,buf=new Float32Array(w*h*4);renderer.readRenderTargetPixels(t,0,0,w,h,buf);
    const film=document.createElement('canvas');film.width=w;film.height=h;const c=film.getContext('2d')!,img=c.createImageData(w,h);
    const fit=(v:number)=>(v*(v+.0245786)-.000090537)/(v*(.983729*v+.432951)+.238081);
    const srgb=(v:number)=>255*Math.min(1,Math.max(0,v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=((h-1-y)*w+x)*4,o=(y*w+x)*4,r=buf[i]!*exposure/.6,g=buf[i+1]!*exposure/.6,b=buf[i+2]!*exposure/.6;
        const R=fit(.59719*r+.35458*g+.04823*b),G=fit(.076*r+.90834*g+.01566*b),B=fit(.0284*r+.13383*g+.83777*b);
        img.data[o]=srgb(1.60475*R-.53108*G-.07367*B);img.data[o+1]=srgb(-.10208*R+1.10813*G-.00605*B);img.data[o+2]=srgb(-.00327*R-.07276*G+1.07602*B);
        img.data[o+3]=pass==='die'?Math.min(255,buf[i+3]!*255):255;
    }
    c.putImageData(img,0,0);return film;
}
function pause(ms:number):Promise<void> {return new Promise(resolve=>setTimeout(resolve,ms));}
async function run():Promise<Record<string,string>> {
    await pause(500);
    if(pass==='die')return dieStrip();
    const image=trace?await traced(scene,camera,spp):(renderer.render(scene,camera),renderer.domElement);
    status.textContent='';return {image:image.toDataURL('image/png')};
}
/** The die tumbling through one full turn, rendered as a strip of transparent frames for CSS steps(). */
async function dieStrip():Promise<Record<string,string>> {
    const frames=Number(q.get('frames')??12),S=Number(q.get('size')??192),stage=new THREE.Scene();
    const cube=die();stage.add(cube);
    const view=camera.position.clone().sub(dieSpot).normalize();
    const cam=new PhysicalCamera(18,1,.1,20);cam.position.copy(view.multiplyScalar(5.6));cam.lookAt(0,0,0);cam.fStop=64;
    const key=new PhysicalSpotLight(0xfff0dc,60,0,.4,.6,2);key.radius=.4;key.position.set(1.2,5,2.4);stage.add(key,key.target);
    const warm=new PhysicalSpotLight(0xffc88a,30,0,.5,.8,2);warm.radius=.3;warm.position.set(4,2,1);stage.add(warm,warm.target);
    const envDie=new GradientEquirectTexture();envDie.topColor.set(0x8d95a8);envDie.bottomColor.set(0x2a1a10);envDie.update();stage.environment=envDie;stage.environmentIntensity=.5;stage.background=null;
    renderer.setClearColor(0,0);renderer.setSize(S,S,false);renderer.domElement.style.width=renderer.domElement.style.height=`${S}px`;
    const strip=document.createElement('canvas');strip.width=S*frames;strip.height=S;const c=strip.getContext('2d')!;
    const axis=new THREE.Vector3(1,.35,.55).normalize(),rest=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,.42,0));
    for(let f=0;f<frames;f++){
        cube.quaternion.setFromAxisAngle(axis,Math.PI*2*f/frames).premultiply(rest);
        if(!trace)stage.add(new THREE.HemisphereLight(0xffffff,0x332211,.2));
        c.drawImage(trace?await traced(stage,cam,spp):(renderer.render(stage,cam),renderer.domElement),f*S,0);
    }
    return {image:strip.toDataURL('image/png')};
}
Object.assign(window,{titleRender:run()});
