import * as THREE from 'three';
import {LANDMARK_INTERIORS, LANDMARK_FURNISHINGS, landmarkBoxes} from '../shared/landmarkLayout';
import {registerLandmarkReactions} from './LandmarkReactions';
import {SEWER_MAINTENANCE_FURNISHINGS} from '../shared/sewerLayout';

type Finish='stone'|'steel'|'brick'|'patina'|'trim'|'iron'|'brass'|'glass'|'warm'|'cream'|'cyan'|'rose'|'green'|'wood'|'paper'|'tile'|'machine'|'cloth'|'linen';
interface Skin {body:Finish; light:Finish; pitch:number; windowW:number; windowH:number}
const SKINS:Record<string,Skin>={
    records:{body:'stone',light:'warm',pitch:6,windowW:2.2,windowH:3.8},
    icebox:{body:'steel',light:'cyan',pitch:8,windowW:5.2,windowH:1.3},
    needleworks:{body:'brick',light:'rose',pitch:8,windowW:4.8,windowH:4.8},
    pump:{body:'patina',light:'green',pitch:7,windowW:3.5,windowH:4.2},
};

/** Instanced exterior reconstruction over the preserved playable masonry cores.
 * Shallow fittings never seal a doorway or become extra physics/raycast bodies. */
export class LandmarkArchitecture {
    private readonly geometry=new THREE.BoxGeometry(1,1,1);
    private readonly roundGeometry=new THREE.CylinderGeometry(.5,.5,1,16);
    private readonly batches=new Map<string,THREE.Matrix4[]>();
    private readonly meshes:THREE.InstancedMesh[]=[];
    private readonly materials:THREE.Material[]=[];
    private readonly dummy=new THREE.Object3D();
    private readonly signs:THREE.Mesh[]=[];
    private readonly textures:THREE.Texture[]=[];
    private time=0;
    private recordingWindow=false;
    private readonly windowSlots=new Map<string,Set<number>>();
    private readonly changingWindows:Array<{mesh:THREE.InstancedMesh;index:number;period:number;offset:number}>=[];
    private readonly tint=new THREE.Color();
    private readonly mechanisms:Array<{root:THREE.Group;rotor:THREE.Group;energy:number;phase:number}>=[];
    private readonly unregister:()=>void;
    constructor(private readonly scene:THREE.Scene){
        for(const hall of LANDMARK_INTERIORS)this.shell(hall.cx,hall.cz,hall.w,hall.d,0,36,SKINS[hall.id],hall.id);
        this.records();this.icebox();this.needleworks();this.pump();this.gate();
        this.interiors();this.maintenanceRoom();
        this.craftDetails();
        this.flush();
        this.unregister=registerLandmarkReactions(scene,point=>{
            for(const mechanism of this.mechanisms){
                const p=mechanism.root.position,dx=p.x-point.x,dy=p.y-point.y,dz=p.z-point.z;
                if(dx*dx+dy*dy+dz*dz<5)
                    mechanism.energy=Math.min(10,mechanism.energy+5);
            }
        });
    }
    update(dt:number){
        this.time+=Math.min(dt,.1);
        for(const window of this.changingWindows){
            const phase=(this.time+window.offset)%window.period;
            // Only a few occupied rooms switch during any given moment; two-second fades.
            const fade=THREE.MathUtils.smoothstep(phase,0,2)*(1-THREE.MathUtils.smoothstep(phase,7,9));
            const level=1-fade*.88;
            window.mesh.setColorAt(window.index,this.tint.setRGB(level,level,level));
            window.mesh.instanceColor!.needsUpdate=true;
        }
        for(const mechanism of this.mechanisms){
            mechanism.phase+=mechanism.energy*dt;
            mechanism.energy*=Math.exp(-1.8*dt);
            mechanism.rotor.rotation.z=mechanism.phase;
        }
    }
    /** Shallow built-in craft details preserve all established doors and cover. */
    private craftDetails(){
        for(const hall of LANDMARK_INTERIORS){
            const skin=SKINS[hall.id];
            // Rain leaders, masonry corner courses, roof coping, and service vents on every side.
            for(const sx of [-1,1])for(const sz of [-1,1]){
                const x=hall.cx+sx*(hall.w/2+.18),z=hall.cz+sz*(hall.d/2+.18);
                this.round('iron',x,17,z,.24,33,.24);
                for(let y=1;y<36;y+=2){
                    this.box('trim',x-sx*.45,y,z,1.4,.28,.22);
                    this.box('trim',x,y,z-sz*.45,.22,.28,1.4);
                }
                for(const y of [4,12,20,28])this.round('brass',x,y,z,.36,.12,.36);
            }
            for(const side of [-1,1])for(const dx of [-hall.w*.3,hall.w*.3]){
                const x=hall.cx+dx,z=hall.cz+side*(hall.d/2+.3);
                this.box('iron',x,10.5,z,2.8,1.7,.15);
                for(let row=0;row<6;row++)this.box(skin.body,x,9.88+row*.24,z+side*.1,2.5,.1,.12);
                this.box('trim',x,11.45,z,3.1,.18,.6);
                // Small utility labels remain physically attached to the masonry.
                for(const y of [9.85,11.15])for(const sx of [-1,1])this.round('brass',x+sx*1.28,y,z+side*.13,.09,.06,.09,Math.PI/2);
            }
            for(const side of [-1,1]){
                this.box('trim',hall.cx,35.9,hall.cz+side*(hall.d/2),hall.w+.5,.24,.7);
                this.box('trim',hall.cx+side*(hall.w/2),35.9,hall.cz,.7,.24,hall.d+.5);
            }
        }
        // Records: stone dentils, archive drawer labels, civic mail intake.
        for(let x=-42;x<12;x+=1.7)this.box('stone',x,21.5,-34.2,.6,.9,.8);
        this.sign(['RECORDS BUREAU','PUBLIC ARCHIVE'],-16,20,-33.9,22,2,'#29232d','#bca884');
        this.sign(['RETURNS'],5,3.5,-36.62,3.5,.6,'#25212a','#c0ab81');
        // Icebox: loading bumpers, insulated panel bolts and refrigeration piping.
        for(const x of [112,119,141,148]){
            this.box('iron',x,1.25,-30.42,.65,1.8,.36);
            for(const y of [2.5,4.5,6.5])this.round('brass',x,y,-30.48,.12,.07,.12,Math.PI/2);
        }
        for(const x of [108,152]){
            this.round('steel',x,15,-30.3,.45,28,.45);
            for(const y of [4,10,16,22,28])this.round('trim',x,y,-30.3,.62,.14,.62);
        }
        this.sign(['ICEBOX','COLD STORAGE'],130,14,-30.72,17,3,'#202f39','#91b9c5');
        // Needleworks: riveted lintels and masonry reveals retain the tailoring frontage.
        for(const x of [-134,-118,-94,-78])for(const y of [9,17,25,33]){
            this.box('steel',x,y,108.48,5.6,.32,.22);
            for(const dx of [-2.3,0,2.3])this.round('brass',x+dx,y,108.63,.12,.06,.12,Math.PI/2);
        }
        // Pump Hall: pressure pipes, flange bolts and wall-mounted dial banks.
        for(const x of [106,144]){
            this.round('machine',x,8,137.42,.62,14,.62);
            for(const y of [2,6,10,14]){
                this.round('brass',x,y,137.42,.94,.18,.94);
                for(const dx of [-.36,.36])this.box('iron',x+dx,y,137.42,.1,.28,.1);
            }
        }
        this.sign(['MUNICIPAL','PUMP HALL'],125,17,137.35,15,3,'#24362e','#a3bda0');
        // Gate's masonry cap and riveted metal water-control housing.
        for(const z of [-22,22])for(let y=3;y<42;y+=4){
            this.box('iron',-146.25,y,z,.18,.3,13);
            for(const dz of [-5,0,5])this.round('brass',-146.4,y,z+dz,.14,.06,.14,0,Math.PI/2);
        }
        this.mechanism(5,2.7,-36.48,0,'records');
        this.mechanism(116,3.2,-30.32,0,'icebox');
        this.mechanism(-135,3.2,108.4,0,'needleworks');
        this.mechanism(144,3.2,137.5,0,'pump');
        this.mechanism(-146.4,3.2,22,-Math.PI/2,'gate');
    }
    private mechanism(x:number,y:number,z:number,yaw:number,kind:string){
        const root=new THREE.Group();root.position.set(x,y,z);root.rotation.y=yaw;root.name=kind+'-reactive-service-dial';
        const frame=new THREE.MeshStandardMaterial({color:0x78674c,roughness:.65,metalness:.5});
        const face=new THREE.MeshStandardMaterial({color:0xb0b59b,emissive:0x8b9b78,emissiveIntensity:.15});
        const ink=new THREE.MeshStandardMaterial({color:0x242b2b,roughness:.6});
        this.materials.push(frame,face,ink);
        const base=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.8,.18),frame);root.add(base);
        const dial=new THREE.Mesh(new THREE.CylinderGeometry(.63,.63,.05,20),face);dial.rotation.x=Math.PI/2;dial.position.z=.13;root.add(dial);
        const rotor=new THREE.Group();rotor.position.z=.19;root.add(rotor);
        const needle=new THREE.Mesh(new THREE.BoxGeometry(.065,.9,.045),ink);needle.position.y=.22;rotor.add(needle);
        if(kind==='pump'||kind==='gate'){
            const ring=new THREE.Mesh(new THREE.TorusGeometry(.5,.055,6,16),frame);rotor.add(ring);
            const spoke=new THREE.Mesh(new THREE.BoxGeometry(1,.065,.06),frame);rotor.add(spoke);
        }
        this.scene.add(root);this.mechanisms.push({root,rotor,energy:0,phase:0});
    }
    private records(){
        const skin=SKINS.records;
        this.shell(-16,-70,34,18,36,70,skin);
        this.shell(-16,-70,24,16,70,92,skin);
        this.shell(-16,-70,16,12,92,104,skin);
        // Deep civic portico and fluted columns, no old freestanding statue court.
        for(const x of [-40,-29,-3,8]){
            this.round('stone',x,10,-35.6,1.65,20,1.65);
            for(const y of [.4,1.1,18.9,19.6])this.round('trim',x,y,-35.6,2.1,.35,2.1);
            for(const dx of [-.45,.45])this.box('brass',x+dx,10,-34.88,.10,16,.06);
        }
        this.box('trim',-16,22.2,-35.6,55,.4,3.4);
        for(const x of [-36,-26,-6,4])this.box('stone',x,29,-36.8,2,12,.8);
        this.round('brass',-16,27,-36.7,8,.2,8,Math.PI/2);
        this.box('iron',-16,27,-36.54,.35,6,.12);
        for(const x of [-18,-14])this.box('cream',x,26.5,-36.46,1.1,3,.1);
        for(const x of [-26,-6])this.box('warm',x,82,-61.93,.8,16,.08);
    }
    private icebox(){
        this.shell(130,-81,30,12,36,54,SKINS.icebox);
        for(const x of [114,146]){
            this.round('steel',x,55,-79,10,38,10);
            for(let y=38;y<74;y+=5)this.round('trim',x,y,-79,10.3,.3,10.3);
            this.shell(x,-79,13,13,74,84,SKINS.icebox);
            this.box('cyan',x,78,-72.42,8,.4,.08);
        }
        for(const x of [111,119,141,149]){
            this.box('steel',x,17,-30.83,1.6,33,.36);
            for(let y=2;y<35;y+=2)this.box('trim',x,y,-30.6,1.6,.12,.1);
        }
        this.box('cyan',130,7.65,-27.9,18,.22,.10);
        for(const x of [119,141])this.box('brass',x,5,-30.18,.3,4,.12);
        for(const z of [-86,-70,-54])this.box('steel',130,23.65,z,44,.35,.5);
    }
    private needleworks(){
        this.tailorFrontage();
        this.shell(-74,100,12,12,36,94,SKINS.needleworks);
        for(const x of [-133,-125]){
            this.round('brick',x,63,66,3.4,54,3.4);
            for(const y of [40,52,64,76,88])this.round('trim',x,y,66,3.6,.3,3.6);
        }
        // Sawtooth roof ridges are structural shed forms rather than a thin facade overlay.
        for(const x of [-130,-113,-96]){
            this.box('steel',x,37.5,81,11,.35,43,0,0,.23);
            this.box('rose',x+5.3,37,81,.16,2,40);
        }
        this.round('brass',-74,85,106.13,9,.20,9,Math.PI/2);
        this.round('cream',-74,85,106.25,8.4,.05,8.4,Math.PI/2);
        this.box('iron',-74,86.5,106.33,.3,3.6,.12);
        this.box('iron',-72.8,85,106.33,2.6,.3,.12);
        for(const x of [-136,-120,-90,-74])this.box('brick',x,16,108.2,2.5,32,.4);
        for(const x of [-128,-112,-96,-80])this.box('steel',x,23.65,82,.55,.35,48);
    }
    /** Tailoring court from the supplied reference: shop glazing, striped canvas,
     * coat displays, projecting scissors sign and hanging trade banners. */
    private tailorFrontage(){
        for(const x of [-126,-86]){
            this.box('wood',x,3.65,108.32,12.4,6.1,.24);
            this.box('warm',x,3.65,108.49,11.6,5.6,.06);
            for(const side of [-1,1])this.box('brass',x+side*5.9,3.65,108.56,.16,5.85,.08);
            this.box('wood',x,3.65,108.56,.22,5.85,.1);
            this.box('wood',x,1,108.59,12.1,.24,.1);
            for(const dx of [-2.6,2.6])this.coat(x+dx,3.3,108.61,1);
            // Sloping, alternating canvas strips and rounded hanging valance.
            for(let j=0;j<14;j++){
                const sx=x-6.5+j;
                this.box(j%2?'linen':'cloth',sx,7.12,110.3,1,.1,4.2,-.24,0,0);
                this.box(j%2?'linen':'cloth',sx,6.43,112.3,.98,.65,.1);
                this.round(j%2?'linen':'cloth',sx,6.15,112.3,.98,.08,.5,Math.PI/2);
            }
            for(const sx of [x-6.5,x+6.5])this.box('iron',sx,6.5,110.1,.1,.1,4.4,-.2,0,0);
        }
        this.sign(['NEEDLEWORKS','COURT'],-105,17,108.58,26,6.4,'#817357','#231d22');
        this.sign(['TAILORS · ALTERATIONS'],-105,6.4,108.6,11.4,1.1,'#302733','#dbc18b');
        this.sign(['UNIFORMS','DISCRETION','ALWAYS IN STYLE'],-76.6,4.7,108.6,4.8,3.3,'#6b614d','#211d26');
        for(const x of [-137,-76]){
            this.box('iron',x,18.2,111.1,.17,.17,6.5);
            this.box('brass',x,17.95,114.1,5.4,.15,.22);
            this.box('cloth',x,12.9,114.1,4.8,9.8,.12);
            for(const dx of [-2.35,2.35])this.box('brass',x+dx,12.9,114.18,.08,9.8,.04);
            for(const y of [8.05,17.75])this.box('brass',x,y,114.18,4.8,.08,.04);
        }
        // Oversized open scissors, recognizable before any lettering is readable.
        for(const side of [-1,1]){
            this.round('brass',-137+side*.95,15,114.24,1.7,.08,2.2,Math.PI/2);
            this.round('cloth',-137+side*.95,15,114.31,1.15,.06,1.6,Math.PI/2);
            this.box('brass',-137+side*.48,11.45,114.25,.26,5.9,.10,0,0,-side*.28);
        }
        this.round('cream',-137,12.75,114.34,.3,.08,.3,Math.PI/2);
        this.coat(-76,12.2,114.25,1.9);
        this.sign(['CLEANER CITY','BETTER COATS'],-137,8.8,114.3,4.2,1.05,'#22202b','#bca476');
        // A parked garment rail gives the court a working-shop edge.
        this.box('iron',-128,3.9,117.5,8,.12,.12);
        for(const x of [-131.8,-124.2]){
            this.box('iron',x,2.05,117.5,.12,3.6,.12);
            this.box('iron',x,.28,117.5,.6,.14,1.8);
            for(const z of [116.8,118.2])this.round('iron',x,.24,z,.35,.18,.35,0,Math.PI/2);
        }
        for(const x of [-131,-129,-127,-125])this.coat(x,2.1,117.5,.78);
    }
    private coat(x:number,y:number,z:number,scale:number){
        this.box('cloth',x,y,z,1.3*scale,2.65*scale,.16*scale);
        for(const side of [-1,1]){
            this.box('cloth',x+side*.82*scale,y+.45*scale,z,.42*scale,1.85*scale,.16*scale,0,0,side*.22);
            this.box('linen',x+side*.23*scale,y+.85*scale,z+.1*scale,.10*scale,.85*scale,.04*scale,0,0,-side*.32);
        }
        this.box('iron',x,y+1.48*scale,z,.85*scale,.06*scale,.06*scale);
        for(const yy of [-.5,0,.5])this.box('brass',x,y+yy*scale,z+.1*scale,.055*scale,.055*scale,.035*scale);
    }
    private sign(lines:string[],x:number,y:number,z:number,w:number,h:number,bg:string,ink:string,yaw=0){
        const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
        const ctx=canvas.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);
        ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.font=`bold ${Math.min(94,180/lines.length)}px Georgia,serif`;
        lines.forEach((line,i)=>ctx.fillText(line,512,(i+.5)*256/lines.length,980));
        const texture=new THREE.CanvasTexture(canvas);this.textures.push(texture);
        const material=new THREE.MeshStandardMaterial({map:texture,roughness:.95,emissive:0x332b1c,emissiveIntensity:.08});this.materials.push(material);
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);mesh.rotation.y=yaw;this.scene.add(mesh);this.signs.push(mesh);
    }
    private maintenanceRoom(){
        // A modest municipal workshop: two built-ins at the perimeter, open
        // center and west entrance. Fittings join the existing static batches.
        const [bench,rack]=SEWER_MAINTENANCE_FURNISHINGS;
        this.box('wood',bench.x,-4.57,bench.z,.98,.12,5.25);
        for(const z of [-39.35,-37.2,-35.05]){
            this.box('iron',68.985,-5.8,z,.04,2.16,1.96);
            for(const y of [-5.18,-5.87]){
                this.box('steel',68.955,y,z,.025,.61,1.82);
                this.box('brass',68.93,y+.15,z,.05,.065,.48);
            }
        }
        // Pegboard, a large wrench, hammer and pliers read from the doorway.
        this.box('wood',69.94,-3.38,-37.1,.10,2.0,4.8);
        for(const z of [-39.2,-38.5,-37.8,-37.1,-36.4,-35.7])for(const y of [-4.1,-3.4,-2.7])
            this.box('iron',69.875,y,z,.025,.045,.045);
        this.box('trim',69.82,-3.48,-38.45,.08,1.05,.17);
        this.box('trim',69.82,-2.94,-38.45,.08,.13,.60);
        for(const z of [-38.69,-38.21])this.box('trim',69.82,-2.80,z,.08,.32,.13);
        this.box('wood',69.80,-3.50,-37.25,.13,1.10,.13);
        this.box('trim',69.80,-2.97,-37.25,.22,.26,.65);
        for(const angle of [-.23,.23])this.box('trim',69.80,-3.44,-36.03,.09,1.15,.10,angle);
        this.round('brass',69.75,-3.17,-36.03,.15,.06,.15,0,0,Math.PI/2);
        // A squat vise and a closed parts box on the bench.
        this.box('iron',69.36,-4.43,-38.55,.54,.16,.72);
        this.box('steel',69.36,-4.23,-38.55,.46,.28,.42);
        this.box('brass',69.05,-4.22,-38.55,.42,.06,.07);
        this.box('brick',69.43,-4.32,-35.7,.62,.40,.90);
        this.box('iron',69.43,-4.07,-35.7,.11,.13,.42);
        // Supply rack: recessed bins, two paint/oil tins and a folded rag.
        for(const x of [rack.x-1.5,rack.x+1.5])this.box('iron',x,-5.3,-30.93,.11,3.4,.06);
        for(const y of [-6.86,-5.75,-4.63,-3.61])this.box('trim',rack.x,y,-30.91,3.12,.10,.12);
        for(const x of [65.65,67.10])for(const y of [-6.31,-5.19,-4.12]){
            this.box('iron',x,y,-30.914,1.26,.94,.035);
            this.box('brass',x,y+.21,-30.943,.25,.09,.02);
        }
        for(const x of [65.8,66.7]){
            this.round('patina',x,-3.31,-30.48,.48,.54,.48);
            this.round('trim',x,-3.01,-30.48,.5,.06,.5);
        }
        this.box('cloth',67.38,-3.50,-30.51,.62,.19,.54,0,.13);
        // Wall power cabinet, breakers and a short conduit. Existing sewer
        // lamps light the room; no added light sources or blinking screens.
        this.box('steel',63.2,-3.65,-41.80,2.2,2.15,.34);
        this.box('iron',63.2,-3.65,-41.61,1.9,1.85,.045);
        for(const x of [62.7,63.2,63.7])for(const y of [-3.4,-3.94]){
            this.box('trim',x,y,-41.56,.29,.37,.06);
            this.box('iron',x,y-.035,-41.50,.09,.17,.07);
        }
        this.round('steel',63.2,-2.2,-41.8,.15,.9,.15);
        this.round('steel',65.1,-1.79,-41.8,.15,3.9,.15,0,0,Math.PI/2);
        this.sign(['MAINTENANCE'],69.94,-1.93,-37.1,4.7,.61,'#1d2326','#a39d87',-Math.PI/2);
        this.sign(['POWER'],63.2,-2.85,-41.57,1.22,.28,'#24282b','#a39d87');
    }
    private pump(){
        this.round('patina',125,49,112,20,14,20);
        for(const y of [42.3,46,52,55.7])this.round('brass',125,y,112,20.2,.25,20.2);
        this.shell(105,105,5,5,36,67,{...SKINS.pump,pitch:4,windowW:1.4});
        for(const x of [117,133]){
            this.round('machine',x,20,118,1.2,32,1.2,Math.PI/2);
            for(const z of [103,109,115,121,127,133])this.round('brass',x,20,z,1.5,.18,1.5,Math.PI/2);
        }
        for(const x of [104,146])this.box('patina',x,16,137.15,3,32,.3);
        this.round('brass',141,17,137.35,6,.15,6,Math.PI/2);
        this.round('iron',141,17,137.46,5.4,.08,5.4,Math.PI/2);
        for(const angle of [0,Math.PI/3,-Math.PI/3])this.box('brass',141,17,137.53,.35,5.3,.15,0,0,angle);
        this.box('green',125,11.8,138.46,12,.25,.08);
    }
    private gate(){
        const skin={...SKINS.records,pitch:5,windowW:1.5};
        for(const z of [-22,22]){
            this.shell(-137,z,18,20,0,20,skin);
            this.shell(-137,z,16,18,20,44,skin);
            this.shell(-137,z,12,14,44,58,skin);
            for(const y of [8,16,24,32,40])this.box('brass',-146.1,y,z,.1,.3,9);
        }
        this.round('brass',-146.16,10,22,7,.18,7,0,Math.PI/2);
    }
    private interiors(){
        // Materials, floor joints and fittings follow the actual new playable floors.
        for(const floor of landmarkBoxes()){
            if(floor.rx||floor.rz||Math.abs(floor.h-.6)>.001||floor.y>20||floor.w<2||floor.d<2)continue;
            const top=floor.y+.3;
            for(let z=floor.z-floor.d/2+2;z<floor.z+floor.d/2-.3;z+=3)
                this.box('tile',floor.x,top+.018,z,Math.max(.2,floor.w-.12),.02,.035);
        }
        for(const hall of LANDMARK_INTERIORS){
            const body:Finish=hall.id==='records'?'wood':hall.id==='icebox'?'steel':hall.id==='needleworks'?'brick':'patina';
            // Wall-mounted light housings and baseboards replace bare, floating fixtures.
            for(const y of hall.levels)for(const side of [-1,1])for(const end of [-1,1]){
                const x=hall.cx+side*(hall.w/2-5),z=hall.cz+end*(hall.d/2-5);
                this.box('iron',x,y+5.25,z,1.6,.25,1.6);
                this.box('iron',x+side*1.9,y+5.25,z,4,.12,.14);
                this.box(body,x+side*3.75,y+5.25,z,.18,.65,.5);
            }
            for(const level of hall.levels)for(const side of [-1,1]){
                for(let u=-hall.w/2+3;u<hall.w/2-2;u+=4){
                    if(level===0&&Math.abs(u)<8)continue;
                    this.box(body,hall.cx+u,level+1.25,hall.cz+side*(hall.d/2-1.23),3.6,2.1,.06);
                    this.box('trim',hall.cx+u,level+2.35,hall.cz+side*(hall.d/2-1.28),3.8,.1,.10);
                }
                for(let u=-hall.d/2+3;u<hall.d/2-2;u+=4){
                    if(level===0&&(Math.abs(u)<7||(hall.id==='icebox'&&Math.abs(u-13)<7)))continue;
                    this.box(body,hall.cx+side*(hall.w/2-1.23),level+1.25,hall.cz+u,.06,2.1,3.6);
                    this.box('trim',hall.cx+side*(hall.w/2-1.28),level+2.35,hall.cz+u,.10,.1,3.8);
                }
            }
        }
        for(const wall of landmarkBoxes()){
            if(wall.hidden||wall.rx||wall.rz)continue;
            if(Math.abs(wall.h-1.1)<.001 && (wall.w<.5||wall.d<.5))
                this.box('brass',wall.x,wall.y+.58,wall.z,wall.w+.08,.08,wall.d+.08);
            if(Math.abs(wall.h-6.6)<.001){
                this.box('trim',wall.x,wall.y+3.28,wall.z,wall.w+.08,.16,wall.d+.08);
                this.box('trim',wall.x,wall.y-1.3,wall.z,wall.w+.04,.12,wall.d+.04);
            }
        }
        for(const item of LANDMARK_FURNISHINGS){
            const {x,y,z,w,h,d}=item;
            if(item.kind==='archive'){
                this.box('wood',x,y,z,w+.04,h+.04,d+.04);
                for(let yy=y-h/2+.55;yy<y+h/2;yy+=.65)for(const side of [-1,1]){
                    this.box('brass',x,yy-.15,z+side*(d/2+.035),w-.3,.035,.04);
                    for(let xx=x-w/2+.35;xx<x+w/2-.2;xx+=.55){
                        this.box('paper',xx,yy,z+side*(d/2+.035),.42,.48,.04);
                        this.box('iron',xx,yy,z+side*(d/2+.065),.12,.08,.025);
                    }
                }
            }else if(item.kind==='pump'){
                this.box('iron',x,y-h/2+.2,z,w+.08,.4,d+.08);
                this.round('machine',x,y+.15,z,w*.85,d*.88,w*.85,Math.PI/2);
                this.round('brass',x,y+.15,z+d*.46,w*.92,.16,w*.92,Math.PI/2);
                this.round('iron',x,y+.15,z+d*.56,w*.4,.18,w*.4,Math.PI/2);
            }else if(item.kind==='cold-rack'){
                for(const dx of [-w/2,w/2])this.box('steel',x+dx,y,z,.16,h,d);
                for(let yy=y-h/2+.5;yy<y+h/2-.8;yy+=1.1){
                    this.box('trim',x,yy,z,w,.12,d);
                    for(const side of [-1,1])this.box('paper',x+side*w*.23,yy+.43,z,w*.4,.72,d*.8);
                }
            }else{
                const finish:Finish=item.kind==='console'?'machine':'wood';
                this.box(finish,x,y-h*.2,z,w,h*.6,d);
                this.box('trim',x,y+h*.14,z,w,.08,d);
                if(item.kind==='console'){
                    for(const dx of [-w*.25,0,w*.25])this.box('green',x+dx,y+h*.3,z,.42,.08,.32);
                }else if(item.kind==='workbench'){
                    this.box('iron',x,y+h*.3,z,w*.45,h*.28,d*.5);
                    this.round('brass',x+w*.25,y+h*.3,z,.4,.12,.4,Math.PI/2);
                }else{
                    this.box('paper',x-w*.22,y+h*.23,z,.8,.07,.6);
                    this.box('brass',x+w*.2,y+h*.3,z,.7,h*.2,.4);
                }
            }
        }
    }
    private shell(cx:number,cz:number,w:number,d:number,bottom:number,top:number,skin:Skin,id=''){
        for(const side of [-1,1]){
            this.face(cx,cz,w,d,bottom,top,skin,side,false,id);
            this.face(cx,cz,d,w,bottom,top,skin,side,true,id);
        }
    }
    private face(cx:number,cz:number,span:number,depth:number,bottom:number,top:number,skin:Skin,side:number,rotate:boolean,id:string){
        const place=(finish:Finish,u:number,y:number,width:number,height:number,thickness=.10,offset=.06)=>{
            this.box(finish,cx+(rotate?side*(depth/2+offset):u),y,cz+(rotate?u:side*(depth/2+offset)),rotate?thickness:width,height,rotate?width:thickness);
        };
        const door=(u:number)=>{
            if(!id||bottom>0)return false;
            if(!rotate){return Math.abs(u)<(id==='icebox'||id==='needleworks'?7:6);}
            if(id==='records')return side<0&&Math.abs(u)<5;
            if(id==='icebox')return side>0&&Math.abs(u-13)<6;
            if(id==='needleworks')return side>0&&Math.abs(u)<6;
            return side>0&&Math.abs(u)<5;
        };
        // Cornices follow every floor, while the ground threshold remains completely open.
        for(let y=bottom+7.8;y<top;y+=8)place('trim',0,y,span+.22,.28,.16,.12);
        place('trim',0,top-.25,span+.35,.5,.20,.15);
        for(let u=-span/2+1;u<span/2;u+=skin.pitch){
            const lower=bottom===0&&door(u)?7:bottom;
            place(skin.body,u,(top+lower)/2,.72,top-lower,.18,.12);
            place('trim',u,top-.9,1.1,.18,.22,.16);
        }
        let row=0;
        for(let y=bottom+4.5;y<top-1.5;y+=8,row++){
            let col=0;
            for(let u=-span/2+skin.pitch/2;u<span/2-2;u+=skin.pitch,col++){
                if(y<7&&door(u))continue;
                const lit=(row*7+col*3+(rotate?2:0)+(side>0?1:0))%7<4;
                const tone:Finish=lit?((row+col)%5===0?'cream':skin.light):'glass';
                place('iron',u,y,skin.windowW+.45,skin.windowH+.45,.09,.11);
                this.recordingWindow=lit;
                place(tone,u,y,skin.windowW,skin.windowH,.04,.18);
                this.recordingWindow=false;
                // Thin mullions keep even bright factory panes readable as architecture.
                place('iron',u,y,.12,skin.windowH,.05,.22);
                if(skin.windowH>2)place('iron',u,y,skin.windowW,.12,.05,.22);
                if(id==='needleworks'){
                    for(const shift of [-1.2,1.2])place('iron',u+shift,y,.08,skin.windowH,.05,.22);
                }
                place('trim',u,y-skin.windowH/2-.18,skin.windowW+.65,.22,.16,.17);
            }
        }
    }
    private box(finish:Finish,x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0){
        this.instance(finish,'box',x,y,z,w,h,d,rx,ry,rz);
    }
    private round(finish:Finish,x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0){
        this.instance(finish,'round',x,y,z,w,h,d,rx,ry,rz);
    }
    private instance(finish:Finish,shape:string,x:number,y:number,z:number,w:number,h:number,d:number,rx:number,ry:number,rz:number){
        this.dummy.position.set(x,y,z);this.dummy.scale.set(w,h,d);this.dummy.rotation.set(rx,ry,rz);this.dummy.updateMatrix();
        const key=finish+':'+shape;
        if(!this.batches.has(key))this.batches.set(key,[]);
        const matrices=this.batches.get(key)!;
        if(this.recordingWindow){
            const hash=Math.abs(Math.round(x*31+y*17+z*13));
            if(hash%3===0){if(!this.windowSlots.has(key))this.windowSlots.set(key,new Set());this.windowSlots.get(key)!.add(matrices.length);}
        }
        matrices.push(this.dummy.matrix.clone());
    }
    private flush(){
        const colors:Record<Finish,number>={stone:0x302c35,steel:0x24323c,brick:0x352630,patina:0x283832,trim:0x55505a,iron:0x141820,brass:0x8b7050,glass:0x172128,warm:0xe1b878,cream:0xbab9a3,cyan:0x6697aa,rose:0xc69b87,green:0x87ab98,wood:0x57433b,paper:0x9b947d,tile:0x585357,machine:0x415750,cloth:0x252331,linen:0xa59572};
        for(const [key,matrices] of this.batches){
            const [name,shape]=key.split(':');const finish=name as Finish;
            const glowing=['warm','cream','cyan','rose','green'].includes(finish);
            const material=new THREE.MeshStandardMaterial({color:colors[finish],roughness:.85,metalness:finish==='brass'?.45:.05,emissive:glowing?colors[finish]:0,emissiveIntensity:glowing?.65:0});
            this.materials.push(material);
            const mesh=new THREE.InstancedMesh(shape==='round'?this.roundGeometry:this.geometry,material,matrices.length);
            matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
            const slots=this.windowSlots.get(key);
            if(slots?.size){
                material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',
                    '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor;\n#endif');};
                matrices.forEach((matrix,i)=>{
                    mesh.setColorAt(i,new THREE.Color(1,1,1));
                    if(slots.has(i)){
                        const e=matrix.elements,hash=Math.abs(Math.round(e[12]*31+e[13]*17+e[14]*13));
                        this.changingWindows.push({mesh,index:i,period:18+hash%25,offset:hash%47});
                    }
                });
            }
            mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=false;
            this.scene.add(mesh);this.meshes.push(mesh);
        }
        this.batches.clear();
    }
    dispose(){this.unregister();for(const item of this.mechanisms){item.root.removeFromParent();item.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}for(const sign of this.signs){this.scene.remove(sign);sign.geometry.dispose();}for(const texture of this.textures)texture.dispose();for(const mesh of this.meshes){this.scene.remove(mesh);mesh.dispose();}this.geometry.dispose();this.roundGeometry.dispose();for(const material of this.materials)material.dispose();}
}
