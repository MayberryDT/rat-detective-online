/** Title scene props: paper printed in 2D canvas, pushpins, string and the desk clutter. Every material
 * is Standard/Physical so the path tracer and the raster preview see the same scene. */
import * as THREE from 'three';
import {createRatMesh,type RatOptions} from '../../src/rat/RatModel';

const loader=new THREE.TextureLoader();
/** All path-traced textures share one wrap and filter mode. */
export function prep<T extends THREE.Texture>(t:T,srgb=true):T {
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=8;return t;
}
export const tex=(name:string,srgb=true)=>prep(loader.load(`title-assets/textures/${name}.jpg`),srgb);
export function pbr(name:string):{map:THREE.Texture;normalMap:THREE.Texture;roughnessMap:THREE.Texture} {
    return {map:tex(`${name}_1K-JPG_Color`),normalMap:tex(`${name}_1K-JPG_NormalGL`,false),roughnessMap:tex(`${name}_1K-JPG_Roughness`,false)};
}
/** Repeat a texture across a surface by scaling the geometry's UVs (texture transforms stay identity). */
export function tile<G extends THREE.BufferGeometry>(g:G,sx:number,sy:number):G {
    const uv=g.attributes.uv!;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*sx,uv.getY(i)*sy);return g;
}
export function canvas(w:number,h:number,draw:(c:CanvasRenderingContext2D)=>void):THREE.CanvasTexture {
    const el=document.createElement('canvas');el.width=w;el.height=h;draw(el.getContext('2d')!);return prep(new THREE.CanvasTexture(el));
}
let seed=7;
export const rnd=(a=0,b=1)=>{seed=(seed*16807)%2147483647;return a+(b-a)*(seed/2147483647);};

/** Aged paper: base tone, fibre speckle, a soft stain or two, darker edges. */
function age(c:CanvasRenderingContext2D,w:number,h:number,base:string,stains=2):void {
    c.fillStyle=base;c.fillRect(0,0,w,h);
    for(let i=0;i<w*h/60;i++){c.fillStyle=`rgba(${rnd()<.5?'90,70,40':'255,250,235'},${rnd(.03,.09)})`;c.fillRect(rnd(0,w),rnd(0,h),rnd(1,3),rnd(1,2));}
    for(let i=0;i<stains;i++){const x=rnd(0,w),y=rnd(0,h),r=rnd(.1,.3)*w,g=c.createRadialGradient(x,y,r*.2,x,y,r);
        g.addColorStop(0,'rgba(150,110,50,.10)');g.addColorStop(.8,'rgba(150,110,50,.05)');g.addColorStop(1,'rgba(120,80,30,0)');c.fillStyle=g;c.fillRect(0,0,w,h);}
    const e=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.35,w/2,h/2,Math.max(w,h)*.75);e.addColorStop(0,'rgba(0,0,0,0)');e.addColorStop(1,'rgba(80,55,25,.28)');c.fillStyle=e;c.fillRect(0,0,w,h);
}
function lines(c:CanvasRenderingContext2D,x:number,y:number,w:number,rows:number,step:number,ink='rgba(40,34,30,.55)'):void {
    c.fillStyle=ink;
    for(let r=0;r<rows;r++){let cx=x;const end=r===rows-1?x+w*rnd(.3,.7):x+w;while(cx<end){const ww=Math.min(rnd(8,34),end-cx);c.fillRect(cx,y+r*step,ww,step*.42);cx+=ww+rnd(5,8);}}
}

const paperMaps=pbr('Paper001');
/** A sheet of paper in the XY plane, facing +z, with an optional curled corner and a gentle bow.
 * `corner` is (±1,±1): which corner lifts. */
export function paper(w:number,h:number,map:THREE.Texture,opts:{curl?:number;corner?:[number,number];bow?:number;rough?:number;gloss?:boolean}={}):THREE.Mesh {
    const {curl=0,corner=[1,-1],bow=0,rough=.82,gloss=false}=opts;
    const g=new THREE.PlaneGeometry(w,h,32,32),p=g.attributes.position!;
    for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),u=x/w*2*corner[0],v=y/h*2*corner[1];
        const d=Math.max(0,(u+v)/2-(1-curl));
        p.setZ(i,d*d*Math.min(w,h)*1.4+bow*(1-(x/w*2)**2)*.004);
    }
    g.computeVertexNormals();
    const m=new THREE.MeshPhysicalMaterial({map,normalMap:paperMaps.normalMap,normalScale:new THREE.Vector2(.5,.5),roughness:gloss?.28:rough,
        clearcoat:gloss?.4:0,clearcoatRoughness:.3,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;return mesh;
}

const pinRed=new THREE.MeshPhysicalMaterial({color:0xc4171a,roughness:.28,clearcoat:1,clearcoatRoughness:.08});
const steel=new THREE.MeshStandardMaterial({color:0xb8b8bc,metalness:1,roughness:.3});
const pinHead=new THREE.LatheGeometry([[0,0],[.0045,0],[.0045,.004],[.0028,.006],[.0028,.011],[.0062,.013],[.0066,.017],[.0055,.021],[0,.022]].map(([x,y])=>new THREE.Vector2(x,y)),20);
/** A red pushpin standing out of the board along +z at `at`; returns the point the string ties to. */
export function pin(parent:THREE.Object3D,at:THREE.Vector3):THREE.Vector3 {
    const g=new THREE.Group();g.position.copy(at);g.rotation.set(Math.PI/2+rnd(-.25,.25),rnd(-.3,.3),0);
    const head=new THREE.Mesh(pinHead,pinRed);head.castShadow=true;g.add(head);
    const needle=new THREE.Mesh(new THREE.CylinderGeometry(.0006,.0006,.01,6),steel);needle.position.y=-.004;g.add(needle);parent.add(g);
    return at.clone().add(new THREE.Vector3(0,0,.006));
}
const wool=new THREE.MeshPhysicalMaterial({color:0x9c0f12,roughness:.85,sheen:1,sheenColor:new THREE.Color(0xff4a3a),sheenRoughness:.6});
/** Red string between two tie points, sagging a little and wrapping a hair around each pin. */
export function string(parent:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3):void {
    const len=a.distanceTo(b),pts:THREE.Vector3[]=[];
    for(let i=0;i<=12;i++){const t=i/12,s=Math.sin(Math.PI*t);pts.push(a.clone().lerp(b,t).add(new THREE.Vector3(0,-s*len*.018,-s*.003)));}
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,.0016,6),wool);tube.castShadow=true;parent.add(tube);
}

/** Head-and-shoulders police photo of a real game rat against a height chart, printed as a polaroid. */
export function mugshot(renderer:THREE.WebGLRenderer,look:RatOptions,caption:string,number:string,yaw=0):THREE.CanvasTexture {
    const S=460,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(24,1,.1,20);
    camera.position.set(.15,1.9,2.5);camera.lookAt(0,1.72,0);
    const rat=createRatMesh(look);rat.rotation.y=yaw;scene.add(rat);
    scene.add(new THREE.HemisphereLight(0xf4efe4,0x3a3430,1.4));
    const flash=new THREE.DirectionalLight(0xffffff,2.6);flash.position.set(.6,2.4,4);scene.add(flash);
    const rim=new THREE.DirectionalLight(0xbfd0ff,1.2);rim.position.set(-2,2.5,-2);scene.add(rim);
    renderer.setSize(S,S,false);renderer.setClearColor(0,0);renderer.render(scene,camera);
    return canvas(512,600,c=>{
        age(c,512,600,'#f1ede2',1);
        const x=26,y=26;c.save();c.beginPath();c.rect(x,y,S,S);c.clip();
        c.fillStyle='#8f9295';c.fillRect(x,y,S,S);
        c.strokeStyle='rgba(30,30,34,.7)';c.fillStyle='rgba(30,30,34,.8)';c.font='bold 15px sans-serif';
        for(let i=0;i<9;i++){const ly=y+30+i*50;c.lineWidth=i%2?1.5:3;c.beginPath();c.moveTo(x,ly);c.lineTo(x+S,ly);c.stroke();c.fillText(`${7-i*.5}'`,x+6,ly-4);}
        c.drawImage(renderer.domElement,x,y,S,S);
        c.fillStyle='#16161a';c.fillRect(x+S*.26,y+S*.8,S*.48,S*.17);
        c.fillStyle='#e8e4da';c.font='bold 22px monospace';c.textAlign='center';c.fillText('RAT CITY P.D.',x+S/2,y+S*.87);c.fillText(number,x+S/2,y+S*.94);
        const v=c.createRadialGradient(x+S/2,y+S/2,S*.3,x+S/2,y+S/2,S*.75);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(20,10,0,.45)');c.fillStyle=v;c.fillRect(x,y,S,S);
        c.globalCompositeOperation='color';c.fillStyle='rgba(150,120,80,.35)';c.fillRect(x,y,S,S);c.restore();
        c.fillStyle='#232026';c.font='38px "Permanent Marker"';c.textAlign='center';c.fillText(caption,256,560);
    });
}
/** A halftone reprint of a rat photo for the newspaper. */
function halftone(c:CanvasRenderingContext2D,src:HTMLCanvasElement|HTMLImageElement,x:number,y:number,w:number,h:number):void {
    const tmp=document.createElement('canvas');tmp.width=w/6|0;tmp.height=h/6|0;const t=tmp.getContext('2d')!;
    t.fillStyle='#fff';t.fillRect(0,0,tmp.width,tmp.height);t.drawImage(src,0,0,tmp.width,tmp.height);
    const d=t.getImageData(0,0,tmp.width,tmp.height).data;c.fillStyle='#1c1a1a';
    for(let j=0;j<tmp.height;j++)for(let i=0;i<tmp.width;i++){const k=(j*tmp.width+i)*4,l=(d[k]!*.3+d[k+1]!*.59+d[k+2]!*.11)/255,r=(1-l)*3.4;
        if(r>.3){c.beginPath();c.arc(x+i*6+3,y+j*6+3,r,0,Math.PI*2);c.fill();}}
}
export function newspaper(photo:HTMLCanvasElement):THREE.CanvasTexture {
    return canvas(720,900,c=>{
        age(c,720,900,'#e4dcc6',3);c.fillStyle='#1d1b1c';c.textAlign='center';
        c.font='bold 30px serif';c.fillText('THE DAILY SQUEAK',360,52);c.fillRect(30,64,660,3);c.fillRect(30,70,660,1);
        c.font='13px serif';c.fillText('RAT CITY · LATE CITY EDITION · FIVE CRUMBS',360,90);
        c.font='bold 76px serif';c.fillText('CHEESE HEIST',360,176);c.fillText('ROCKS CITY',360,252);
        c.font='italic 26px serif';c.fillText('Police baffled. Case still hot. Rats everywhere.',360,296);
        halftone(c,photo,40,320,300,300);c.font='italic 15px serif';c.textAlign='left';c.fillText('"I was framed," says local rat.',40,642);
        lines(c,370,322,310,22,15);lines(c,40,662,310,15,15);lines(c,370,662,310,15,15);
    });
}
export function cityMap():THREE.CanvasTexture {
    return canvas(900,700,c=>{
        age(c,900,700,'#e8dfc4',2);c.strokeStyle='rgba(110,90,60,.55)';
        for(let i=0;i<14;i++){c.lineWidth=i%4?3:8;c.beginPath();c.moveTo(i*70+rnd(-20,20),0);c.lineTo(i*70+rnd(-40,40),700);c.stroke();c.beginPath();c.moveTo(0,i*55+rnd(-10,10));c.lineTo(900,i*55+rnd(-30,30));c.stroke();}
        c.strokeStyle='rgba(70,110,150,.55)';c.lineWidth=30;c.beginPath();c.moveTo(0,520);c.bezierCurveTo(300,430,500,660,900,560);c.stroke();
        c.fillStyle='rgba(60,50,40,.8)';c.font='bold 22px serif';c.fillText('HARBOR',640,640);c.fillText('OLD TOWN',120,150);c.fillText('THE DOCKS',520,420);c.font='16px serif';c.fillText('Gouda Ave',260,248);c.fillText('Brie St',560,112);
        c.strokeStyle='#b8191c';c.lineWidth=7;c.beginPath();c.ellipse(430,300,70,52,.2,0,Math.PI*2);c.stroke();
        c.setLineDash([16,12]);c.lineWidth=5;c.beginPath();c.moveTo(150,560);c.bezierCurveTo(220,420,300,340,370,310);c.stroke();c.setLineDash([]);
        c.fillStyle='#b8191c';c.font='44px "Permanent Marker"';c.fillText('HOT CASE?',470,220);c.font='34px "Permanent Marker"';c.fillText('X',140,580);
    });
}
/** Blank stock the HTML overlays print on: the case poster (logo), the index card (name) and a sticky note. */
export function poster():THREE.CanvasTexture {
    return canvas(800,1000,c=>{age(c,800,1000,'#efe6cf',3);c.strokeStyle='rgba(60,45,30,.55)';c.lineWidth=4;c.strokeRect(34,34,732,932);c.lineWidth=1.5;c.strokeRect(46,46,708,908);});
}
/** Index card rules; the HTML name card matches these fractions (see title.css). */
export const CARD_RULES={red:.3,first:.52,step:.2};
export function indexCard():THREE.CanvasTexture {
    return canvas(1000,560,c=>{
        age(c,1000,560,'#f7f2e3',1);c.fillStyle='rgba(200,60,60,.55)';c.fillRect(0,CARD_RULES.red*560,1000,3);
        c.fillStyle='rgba(90,140,200,.45)';for(let y=CARD_RULES.first;y<1;y+=CARD_RULES.step)c.fillRect(0,y*560,1000,2);
    });
}
export function sticky():THREE.CanvasTexture {
    return canvas(512,512,c=>{const g=c.createLinearGradient(0,0,0,512);g.addColorStop(0,'#f4e062');g.addColorStop(1,'#e9cc3c');c.fillStyle=g;c.fillRect(0,0,512,512);
        age(c,512,512,'rgba(0,0,0,0)',0);c.fillStyle='rgba(120,90,0,.12)';c.fillRect(0,0,512,70);});
}
export function receipt():THREE.CanvasTexture {
    return canvas(300,640,c=>{age(c,300,640,'#f3efe6',1);c.fillStyle='#2a2628';c.textAlign='center';c.font='bold 22px monospace';c.fillText('THE RUSTY WHISKER',150,50);
        c.font='15px monospace';c.fillText('JAZZ · LATE',150,76);c.textAlign='left';
        const rows=[['GOUDA NEAT','4.50'],['GOUDA NEAT','4.50'],['BRIE, ROCKS','6.00'],['CRACKERS','1.25'],['GOUDA NEAT','4.50'],['TIP','0.10']];
        rows.forEach(([a,b],i)=>{c.fillText(a!,24,130+i*34);c.fillText(b!,210,130+i*34);});c.fillRect(24,350,250,2);c.font='bold 18px monospace';c.fillText('TOTAL   20.85',24,384);
        c.fillStyle='#b8191c';c.font='30px "Permanent Marker"';c.fillText('who paid?',50,470);});
}
/** A torn scrap with a marker note. */
export function scrawl(text:string,w:number,h:number):THREE.CanvasTexture {
    return canvas(w*3,h*3,c=>{age(c,w*3,h*3,'#efe8d6',1);c.fillStyle='#b8191c';c.font=`${h*.62}px "Permanent Marker"`;c.textAlign='center';c.textBaseline='middle';c.translate(w*1.5,h*1.5);c.rotate(-.05);c.fillText(text,0,0,w*2.7);});
}
export function ace():THREE.CanvasTexture {
    return canvas(250,350,c=>{age(c,250,350,'#f6f2e8',1);c.strokeStyle='#9a2020';c.lineWidth=3;c.strokeRect(10,10,230,330);c.fillStyle='#161416';c.font='bold 44px serif';c.fillText('A',22,58);
        c.beginPath();c.moveTo(125,110);c.bezierCurveTo(60,170,70,230,118,215);c.lineTo(100,262);c.lineTo(150,262);c.lineTo(132,215);c.bezierCurveTo(180,230,190,170,125,110);c.fill();
        c.fillStyle='#b8191c';c.font='28px "Permanent Marker"';c.fillText('dead',150,320);});
}
export function folderLabel():THREE.CanvasTexture {
    return canvas(1024,700,c=>{
        const f=c.createLinearGradient(0,0,1024,700);f.addColorStop(0,'#cfb27a');f.addColorStop(1,'#b8945a');c.fillStyle=f;c.fillRect(0,0,1024,700);age(c,1024,700,'rgba(0,0,0,0)',3);
        c.save();c.translate(560,380);c.rotate(-.12);c.strokeStyle='rgba(170,25,25,.85)';c.lineWidth=10;c.strokeRect(-300,-70,600,140);
        c.fillStyle='rgba(170,25,25,.85)';c.font='96px Bangers';c.textAlign='center';c.fillText('CONFIDENTIAL',0,34);c.restore();
        c.fillStyle='#2a2320';c.font='34px "Special Elite"';c.fillText('CASE No. 0417 — THE GOUDA JOB',80,120);lines(c,80,560,520,3,24,'rgba(40,30,20,.5)');
    });
}

/** Swiss wedge with a bite out of the point and holes through it. Extruded upward from the XZ plane. */
export function cheese():THREE.Mesh {
    const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(.2,-.06);s.lineTo(.2,.07);s.lineTo(.07,.05);
    // Bite: three scallops out of the point.
    s.absarc(.052,.03,.022,.4,2.6,false);s.absarc(.03,.02,.02,.6,3.4,false);s.lineTo(0,0);
    for(const [x,y,r] of [[.14,-.01,.012],[.17,.035,.009],[.105,.02,.008],[.165,-.035,.007]] as const){const h=new THREE.Path();h.absarc(x,y,r,0,Math.PI*2,true);s.holes.push(h);}
    const g=new THREE.ExtrudeGeometry(s,{depth:.07,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:3,curveSegments:18});
    g.rotateX(-Math.PI/2);
    const m=new THREE.Mesh(g,new THREE.MeshPhysicalMaterial({color:0xf2bd3c,roughness:.5,sheen:.4,sheenColor:new THREE.Color(0xffe7a0),clearcoat:.15}));
    m.castShadow=m.receiveShadow=true;return m;
}
const lathe=(pts:number[][],mat:THREE.Material,seg=48)=>{const m=new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x,y])=>new THREE.Vector2(x!,y!)),seg),mat);m.castShadow=m.receiveShadow=true;return m;};
export function mug():THREE.Group {
    const g=new THREE.Group(),ceramic=new THREE.MeshPhysicalMaterial({color:0xe9e3d6,roughness:.25,clearcoat:.8});
    g.add(lathe([[0,0],[.038,0],[.041,.004],[.043,.1],[.045,.104],[.041,.104],[.039,.01],[0,.012]],ceramic));
    g.add(lathe([[0,.082],[.04,.082]],new THREE.MeshPhysicalMaterial({color:0x2a150a,roughness:.04,clearcoat:1}),32));
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.027,.007,12,24,Math.PI*1.2),ceramic);handle.position.set(.043,.055,0);handle.rotation.z=-Math.PI*.6;handle.castShadow=true;g.add(handle);
    return g;
}
export function ashtray():{group:THREE.Group;ember:THREE.Vector3} {
    const g=new THREE.Group();
    g.add(lathe([[0,0],[.065,0],[.07,.006],[.072,.024],[.064,.026],[.058,.012],[0,.012]],new THREE.MeshPhysicalMaterial({color:0x8a5a24,roughness:.06,transmission:.9,thickness:.02,ior:1.5,attenuationColor:new THREE.Color(0x9a5a10),attenuationDistance:.05})));
    const ashMat=new THREE.MeshStandardMaterial({color:0x6d6b68,roughness:1});
    for(let i=0;i<14;i++){const a=new THREE.Mesh(new THREE.SphereGeometry(rnd(.003,.007),8,6),ashMat);a.position.set(rnd(-.03,.03),.014,rnd(-.03,.03));a.scale.y=.5;g.add(a);}
    const cig=new THREE.Group();cig.position.set(.05,.03,.005);cig.rotation.set(0,.4,.12);g.add(cig);
    const paperMat=new THREE.MeshStandardMaterial({color:0xf1ede4,roughness:.7}),filter=new THREE.MeshStandardMaterial({color:0xd08a3c,roughness:.8});
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.0042,.0042,.055,16),paperMat);body.rotation.z=Math.PI/2;body.position.x=-.028;body.castShadow=true;cig.add(body);
    const tip=new THREE.Mesh(new THREE.CylinderGeometry(.0043,.0043,.02,16),filter);tip.rotation.z=Math.PI/2;tip.position.x=.008;cig.add(tip);
    const ash=new THREE.Mesh(new THREE.CylinderGeometry(.0038,.0041,.012,12),ashMat);ash.rotation.z=Math.PI/2;ash.position.x=-.061;cig.add(ash);
    const ember=new THREE.Mesh(new THREE.SphereGeometry(.0036,12,8),Object.assign(new THREE.MeshStandardMaterial({color:0x220000,emissive:0xff5a14,emissiveIntensity:6}),{castShadow:false}));ember.position.x=-.068;cig.add(ember);
    for(const [x,z,r] of [[-.03,.03,1.2],[.02,-.035,-.6]] as const){const butt=new THREE.Mesh(new THREE.CylinderGeometry(.0043,.0043,.024,12),filter);butt.rotation.set(0,r,Math.PI/2);butt.position.set(x,.017,z);butt.castShadow=true;g.add(butt);}
    g.updateMatrixWorld(true);return {group:g,ember:ember.getWorldPosition(new THREE.Vector3())};
}
export function fedora():THREE.Group {
    const g=new THREE.Group(),felt=new THREE.MeshPhysicalMaterial({color:0x2c2a2e,roughness:.92,sheen:1,sheenColor:new THREE.Color(0x77716a),sheenRoughness:.5});
    const crown=lathe([[0,.13],[.05,.128],[.078,.115],[.086,.06],[.09,.012],[.092,0]],felt,64);
    const p=crown.geometry.attributes.position!;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=Math.hypot(x,z);if(y>.09){const pinch=Math.exp(-((x-.02)**2)/.0008)*.03*(y-.09)/.04;p.setY(i,y-.035*Math.max(0,1-r/.06)-.0);p.setZ(i,z*(1-pinch*8*Math.max(0,1-r/.1)));}}
    crown.geometry.computeVertexNormals();crown.scale.set(1,1,.82);g.add(crown);
    const brim=lathe([[.085,.006],[.13,.004],[.165,.012],[.17,.016],[.165,.014],[.13,.0],[.085,0]],felt,64);brim.scale.set(1,1,.86);g.add(brim);
    const band=lathe([[.09,.008],[.089,.03],[.0885,.03],[.0895,.008]],new THREE.MeshPhysicalMaterial({color:0xd9ccaa,roughness:.55,sheen:.6,sheenColor:new THREE.Color(0xffffff)}),64);band.scale.set(1.012,1,.832);g.add(band);
    return g;
}
export function magnifier():THREE.Group {
    const g=new THREE.Group(),brass=new THREE.MeshStandardMaterial({color:0xc8a257,metalness:1,roughness:.22});
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.06,.006,16,64),brass);rim.rotation.x=Math.PI/2;rim.castShadow=true;g.add(rim);
    const pts:THREE.Vector2[]=[];for(let i=0;i<=16;i++){const r=.06*i/16;pts.push(new THREE.Vector2(r,.006*(1-(r/.06)**2)));}
    for(let i=16;i>=0;i--){const r=.06*i/16;pts.push(new THREE.Vector2(r,-.006*(1-(r/.06)**2)));}
    g.add(lathe(pts.map(v=>[v.x,v.y]),new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:0,transmission:1,thickness:.01,ior:1.52}),48));
    const handle=lathe([[0,0],[.009,0],[.011,.02],[.01,.07],[.012,.1],[.008,.11],[0,.11]],new THREE.MeshPhysicalMaterial({color:0x3b1f10,roughness:.35,clearcoat:.7}),24);
    handle.rotation.z=-Math.PI/2;handle.position.x=.066;g.add(handle);
    const ferrule=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.012,20),brass);ferrule.rotation.z=Math.PI/2;ferrule.position.x=.066;g.add(ferrule);
    return g;
}
/** A black rotary telephone: body, dial and handset in its cradle. */
export function phone():THREE.Group {
    const g=new THREE.Group(),bake=new THREE.MeshPhysicalMaterial({color:0x121112,roughness:.22,clearcoat:1,clearcoatRoughness:.08});
    const body=lathe([[0,0],[.1,0],[.1,.01],[.085,.07],[.05,.1],[0,.1]],bake,6);body.rotation.y=Math.PI/6;body.scale.set(1,1,.8);g.add(body);
    const dial=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.006,32),new THREE.MeshPhysicalMaterial({color:0xe8e0cc,roughness:.4,clearcoat:.5}));dial.position.set(0,.078,.055);dial.rotation.x=.75;g.add(dial);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.036,.012,10,32),bake);ring.position.copy(dial.position);ring.rotation.x=.75+Math.PI/2;g.add(ring);
    const hand=new THREE.Group();hand.position.set(0,.125,-.005);g.add(hand);
    const grip=new THREE.Mesh(new THREE.CapsuleGeometry(.016,.14,6,16),bake);grip.rotation.z=Math.PI/2;hand.add(grip);
    for(const s of [-1,1]){const cup=lathe([[0,0],[.028,0],[.03,.02],[.02,.035],[0,.036]],bake,24);cup.position.set(s*.095,-.02,0);hand.add(cup);}
    g.traverse(o=>{o.castShadow=o.receiveShadow=true;});return g;
}
/** A heavy whisky tumbler with two fingers of rye. */
export function tumbler():THREE.Group {
    const g=new THREE.Group();
    g.add(lathe([[0,0],[.038,0],[.04,.004],[.042,.09],[.038,.09],[.036,.014],[0,.014]],new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.02,transmission:1,thickness:.01,ior:1.5}),48));
    g.add(lathe([[0,.017],[.032,.017],[.033,.045],[0,.045]],new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.05,transmission:1,thickness:.03,ior:1.33,attenuationColor:new THREE.Color(0xb86a1a),attenuationDistance:.03}),32));
    return g;
}
/** A green-shaded brass gooseneck lamp standing at `base`, its shade aimed at `target` (both world space). */
export function lamp(base:THREE.Vector3,target:THREE.Vector3):{group:THREE.Group;bulb:THREE.Vector3} {
    const g=new THREE.Group(),brass=new THREE.MeshStandardMaterial({color:0xb99550,metalness:1,roughness:.3});
    const enamel=new THREE.MeshPhysicalMaterial({color:0x1d4a33,roughness:.35,clearcoat:1,clearcoatRoughness:.1});
    g.position.copy(base);
    const foot=lathe([[0,0],[.1,0],[.1,.012],[.085,.03],[.02,.035],[.014,.05],[0,.05]],brass);g.add(foot);
    const tip=new THREE.Vector3(-.1,.44,-.14);
    const arm=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.04,0),new THREE.Vector3(0,.25,.01),new THREE.Vector3(-.04,.4,-.06),tip]);
    const tube=new THREE.Mesh(new THREE.TubeGeometry(arm,48,.009,10),brass);tube.castShadow=true;g.add(tube);
    const head=new THREE.Group();head.position.copy(tip);g.add(head);g.updateMatrixWorld(true);
    head.lookAt(target);
    const shape=[[.012,-.02],[.03,-.008],[.05,.04],[.085,.12],[.087,.125]];
    const shade=lathe(shape,enamel);shade.rotation.x=Math.PI/2;head.add(shade);
    const inner=lathe(shape.map(([x,y])=>[x!-.002,y!]),new THREE.MeshStandardMaterial({color:0xf2ecdf,roughness:.5,side:THREE.BackSide}));inner.rotation.x=Math.PI/2;head.add(inner);
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.026,24,16),Object.assign(new THREE.MeshStandardMaterial({color:0x000000,emissive:0xffc27a,emissiveIntensity:30}),{castShadow:false}));
    bulb.position.z=.04;head.add(bulb);
    g.updateMatrixWorld(true);return {group:g,bulb:bulb.getWorldPosition(new THREE.Vector3())};
}
/** Face values on ±x, ±y, ±z (opposites sum to seven). */
const FACES:[THREE.Vector3,number][]=[[new THREE.Vector3(0,1,0),5],[new THREE.Vector3(0,-1,0),2],[new THREE.Vector3(1,0,0),3],[new THREE.Vector3(-1,0,0),4],[new THREE.Vector3(0,0,1),1],[new THREE.Vector3(0,0,-1),6]];
const PIPS:Record<number,number[][]>={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
/** A jumbo glossy red die, one unit across. */
export function die():THREE.Group {
    const g=new THREE.Group();
    const body=new THREE.Mesh(roundedCube(),new THREE.MeshPhysicalMaterial({color:0xc2121a,roughness:.18,clearcoat:1,clearcoatRoughness:.04}));g.add(body);
    const pip=new THREE.MeshPhysicalMaterial({color:0xf6f1e6,roughness:.35,clearcoat:.6}),disc=new THREE.CylinderGeometry(.085,.085,.012,32);
    for(const [n,v] of FACES)for(const [a,b] of PIPS[v]!){
        const m=new THREE.Mesh(disc,pip);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n);
        const t1=Math.abs(n.y)>.5?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0),t2=n.clone().cross(t1);
        m.position.copy(n).multiplyScalar(.5).add(t1.multiplyScalar(a!*.26)).add(t2.multiplyScalar(b!*.26));g.add(m);
    }
    return g;
}
/** Superellipsoid: a cube with softly rounded edges, one unit across. */
function roundedCube():THREE.BufferGeometry {
    const s=new THREE.SphereGeometry(1,48,32),p=s.attributes.position!,f=(x:number)=>Math.sign(x)*Math.abs(x)**.18*.5;
    for(let i=0;i<p.count;i++)p.setXYZ(i,f(p.getX(i)),f(p.getY(i)),f(p.getZ(i)));
    s.computeVertexNormals();return s;
}
