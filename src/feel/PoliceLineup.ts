import * as THREE from 'three';
import {createRatMesh,ratAccessory,type RatOptions} from '../utils/RatModel';
import type {Award} from '../shared/networkProtocol';
import {awardValue} from '../shared/awardUnits';
import {disposeMeshResources} from '../utils/disposeMeshResources';
import './policeLineup.css';
import {replay} from '../ui/motion';

export interface LineupEntry {id:string;name:string;appearance:RatOptions;award?:Award;winner:boolean}

/** Far below the city and its sewers; nothing else is ever this deep. */
const ORIGIN=new THREE.Vector3(0,-320,0);
const SPACING=1.75,WALL_Z=-1.3,ROOM_HALF_WIDTH=6.8,ROOM_HEIGHT=4.6;
/** Seconds: first flash, then one per rat; the winner (last) gets a double flash. */
const FIRST_FLASH=.8,FLASH_STEP=1,WINNER_PAUSE=.5;

/** Juice T5: a noir police lineup at round end. The top rats stand against a
 * height chart in a precinct room, lit by the stage's own spotlight (moved here,
 * so no extra light is added); flashbulbs pop one rat at a time, each gets a
 * rubber-stamped award, and the winner goes last. */
export class PoliceLineup {
    private readonly room=new THREE.Group();
    private readonly rats:THREE.Group[]=[];
    private entries:LineupEntry[]=[];
    private overlay?:HTMLDivElement;
    private flashNode?:HTMLDivElement;
    private readonly plates:HTMLDivElement[]=[];
    private readonly stamps:HTMLDivElement[]=[];
    private age=0;
    private fired=0;
    private flash=0;
    private baseIntensity=0;
    private baseAngle=0;
    private light?:THREE.SpotLight;
    private running=false;
    private readonly point=new THREE.Vector3();

    constructor(scene:THREE.Scene,private readonly doc:Document|undefined,private readonly onFlash:()=>void){
        this.buildRoom();
        this.room.position.copy(ORIGIN);this.room.name='police-lineup';
        // Always present (so the title warm-up compiles it) but never on screen during play.
        scene.add(this.room);
    }
    get active():boolean {return this.running;}

    start(entries:readonly LineupEntry[]):void {
        this.end();
        if(!entries.length)return;
        // Winner last: the list arrives winner first.
        this.entries=[...entries].reverse();
        this.entries.forEach((entry,i)=>{
            const rat=createRatMesh({...entry.appearance,accessory:ratAccessory(entry.name)});
            rat.position.set((i-(this.entries.length-1)/2)*SPACING,0,0);
            rat.traverse(object=>{object.castShadow=true;});
            this.room.add(rat);this.rats.push(rat);
        });
        this.age=0;this.fired=0;this.flash=0;this.running=true;
        this.buildOverlay();
        this.doc?.body?.classList.add('lineup-on');
    }

    /** Aim the camera and the stage spotlight into the room. Call after the normal camera update. */
    update(dt:number,camera:THREE.PerspectiveCamera,light:THREE.SpotLight):void {
        if(!this.running)return;
        if(!this.light){this.light=light;this.baseIntensity=light.intensity;this.baseAngle=light.angle;}
        this.age+=dt;
        const due=this.flashTime(this.fired);
        if(this.fired<this.entries.length+1&&this.age>=due){
            this.fired++;this.flash=1;this.onFlash();
            if(this.flashNode)replay(this.flashNode,'on');
            const index=Math.min(this.fired,this.entries.length)-1;
            this.stamps[index]?.classList.add('on');
        }
        this.flash=Math.max(0,this.flash-dt*7);
        // A slow push-in, drifting toward the rat being photographed.
        const focus=Math.min(this.fired,this.entries.length)-1,target=focus>=0?this.rats[focus]!.position.x*.2:0;
        const push=Math.min(1,this.age/8);
        camera.position.set(ORIGIN.x+target,ORIGIN.y+1.45,ORIGIN.z+7.4-push*1.1);
        camera.lookAt(ORIGIN.x+target*.8,ORIGIN.y+1.05,ORIGIN.z);
        camera.updateMatrixWorld();
        light.position.set(ORIGIN.x,ORIGIN.y+4.1,ORIGIN.z+5.2);light.target.position.set(ORIGIN.x,ORIGIN.y+.9,ORIGIN.z);
        light.target.updateMatrixWorld();
        light.intensity=this.baseIntensity*(4.5+this.flash*9);light.angle=.95;
        this.rats.forEach((rat,i)=>{
            const winner=this.entries[i]!.winner,shot=i<this.fired;
            // Shuffle, look at the camera once photographed; the winner bounces on its flash.
            rat.rotation.y=Math.sin(this.age*1.3+i*1.7)*(shot?.05:.18);
            rat.position.y=winner&&shot?Math.max(0,Math.sin(Math.min(1,(this.age-this.flashTime(i))*3)*Math.PI)*.35):0;
        });
        this.place(camera);
    }

    end():void {
        this.running=false;
        // The session re-aims the spotlight every frame; only its strength needs restoring.
        if(this.light){this.light.intensity=this.baseIntensity;this.light.angle=this.baseAngle;}
        this.light=undefined;
        for(const rat of this.rats){rat.removeFromParent();disposeMeshResources(rat);}
        this.rats.length=0;this.entries=[];
        this.overlay?.remove();this.overlay=undefined;this.flashNode=undefined;this.plates.length=0;this.stamps.length=0;
        this.doc?.body?.classList.remove('lineup-on');
    }

    dispose():void {
        this.end();this.room.removeFromParent();
        this.room.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const m of [object.material].flat()){if(m instanceof THREE.MeshStandardMaterial)m.map?.dispose();m.dispose();}}});
    }

    private flashTime(index:number):number {
        const last=this.entries.length-1;
        return FIRST_FLASH+Math.min(index,last)*FLASH_STEP+(index>=last?WINNER_PAUSE:0)+(index>last?.35:0);
    }

    private buildRoom():void {
        const wall=new THREE.MeshStandardMaterial({color:0x6f7266,roughness:.9,map:this.heightChart()});
        const dark=new THREE.MeshStandardMaterial({color:0x1d1c21,roughness:.95});
        const floor=new THREE.MeshStandardMaterial({color:0x2c2a2e,roughness:.8});
        const add=(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,ry=0,rx=0)=>{
            const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,0);
            mesh.receiveShadow=true;mesh.userData.noNoir=true;mesh.raycast=()=>{};this.room.add(mesh);
        };
        add(new THREE.PlaneGeometry(ROOM_HALF_WIDTH*2,ROOM_HEIGHT),wall,0,ROOM_HEIGHT/2,WALL_Z);
        add(new THREE.PlaneGeometry(ROOM_HALF_WIDTH*2,12),floor,0,0,4.7,0,-Math.PI/2);
        add(new THREE.PlaneGeometry(ROOM_HALF_WIDTH*2,12),dark,0,ROOM_HEIGHT,4.7,0,Math.PI/2);
        for(const side of [-1,1])add(new THREE.PlaneGeometry(12,ROOM_HEIGHT),dark,side*ROOM_HALF_WIDTH,ROOM_HEIGHT/2,4.7,-side*Math.PI/2);
        add(new THREE.PlaneGeometry(ROOM_HALF_WIDTH*2,ROOM_HEIGHT),dark,0,ROOM_HEIGHT/2,10.7,Math.PI);
    }

    /** Height chart: a line every half foot, labelled every foot (one unit is two feet). */
    private heightChart():THREE.Texture|null {
        const canvas=typeof this.doc?.createElement==='function'?this.doc.createElement('canvas'):undefined;
        const context=typeof canvas?.getContext==='function'?canvas.getContext('2d'):null;
        if(!canvas||!context)return null;
        canvas.width=512;canvas.height=512;
        context.fillStyle='#b9b6a4';context.fillRect(0,0,512,512);
        const feet=ROOM_HEIGHT*2,px=512/feet;
        context.strokeStyle='#26221f';context.fillStyle='#26221f';context.font='bold 34px Impact, sans-serif';
        for(let half=1;half<feet*2;half++){
            const y=512-half*px/2,foot=half%2===0;
            context.lineWidth=foot?5:2;context.beginPath();context.moveTo(0,y);context.lineTo(512,y);context.stroke();
            if(foot){context.fillText(`${half/2}'`,14,y-6);context.fillText(`${half/2}'`,440,y-6);}
        }
        const texture=new THREE.CanvasTexture(canvas);
        texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.repeat.set(2.4,1);
        return texture;
    }

    private buildOverlay():void {
        if(!this.doc)return;
        const overlay=this.doc.createElement('div');overlay.id='police-lineup';
        const flash=this.doc.createElement('div');flash.className='lineup-flash';overlay.appendChild(flash);
        this.entries.forEach((entry,i)=>{
            const plate=this.doc!.createElement('div');plate.className='lineup-plate'+(entry.winner?' winner':'');
            const number=this.doc!.createElement('b');number.textContent=`No. ${this.entries.length-i}`;
            const name=this.doc!.createElement('span');name.textContent=entry.name;
            plate.appendChild(number);plate.appendChild(name);overlay.appendChild(plate);this.plates.push(plate);
            const stamp=this.doc!.createElement('div');stamp.className='lineup-stamp'+(entry.winner?' winner':'');
            const title=this.doc!.createElement('b');title.textContent=entry.winner?'CASE CLOSED':entry.award?.title??'PERSON OF INTEREST';
            const detail=this.doc!.createElement('span');
            detail.textContent=entry.award?`${entry.winner?`${entry.award.title} · `:''}${awardValue(entry.award)}`:entry.winner?'THE WINNER':'NO COMMENT';
            stamp.appendChild(title);stamp.appendChild(detail);overlay.appendChild(stamp);this.stamps.push(stamp);
        });
        this.doc.body?.appendChild(overlay);this.overlay=overlay;this.flashNode=flash;
    }

    /** Pin the plates under each rat's feet and the stamps over their hats. */
    private place(camera:THREE.Camera):void {
        if(!this.overlay)return;
        const width=this.doc?.defaultView?.innerWidth??1280,height=this.doc?.defaultView?.innerHeight??720;
        this.rats.forEach((rat,i)=>{
            // Stamped across the chest, like on the mugshot itself.
            for(const [node,y] of [[this.plates[i],-.12],[this.stamps[i],1.35]] as const){
                if(!node)continue;
                this.point.set(rat.position.x,y,rat.position.z).add(ORIGIN).project(camera);
                node.style.left=`${(this.point.x*.5+.5)*width}px`;node.style.top=`${(-this.point.y*.5+.5)*height}px`;
            }
        });
    }
}
