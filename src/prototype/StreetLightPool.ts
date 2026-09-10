import { AUTHORED_LIGHT_GAIN } from '../session/lightingTuning';
import * as THREE from 'three';

export interface LightRoom {id:string;xmin:number;xmax:number;zmin:number;zmax:number;ymin:number;ymax:number}
type LightAnchor={x:number;y:number;z:number};
export interface OverheadLight {
    x:number;y:number;z:number;color:number;intensity?:number;distance?:number;angle?:number;penumbra?:number;
    room?:LightRoom;floor?:number;target?:LightAnchor;illuminates?:(point:LightAnchor)=>boolean;
}
export function insideLightRoom(p:{x:number;y:number;z:number},room:LightRoom):boolean {
    return p.x>=room.xmin&&p.x<=room.xmax&&p.z>=room.zmin&&p.z<=room.zmax&&p.y>=room.ymin&&p.y<room.ymax;
}
/** Four fixture lights shared by street poles, facade spill and interiors.
 * Positions/aim belong to fixtures; moving the rat only selects the useful four. */
export class StreetLightPool {
    private readonly lights:THREE.SpotLight[]=[];
    constructor(private readonly scene:THREE.Scene,private readonly sources:readonly OverheadLight[],private readonly rooms:readonly LightRoom[]=[]){
        for(let i=0;i<4;i++){
            const light=new THREE.SpotLight(0xffcf96,0,15,.68,.65,2);
            light.name='noir-overhead-light';light.castShadow=false;
            scene.add(light,light.target);this.lights.push(light);
        }
    }
    update(camera:THREE.Camera,anchor:{x:number;y:number;z:number}=camera.position):void {
        // The shoulder camera may sit outside a doorway or above a low ceiling.
        // Select the room/floor from the rat, not from that offset camera.
        const p=anchor,room=this.rooms.find(r=>insideLightRoom(p,r));
        const nearest=this.sources.map(source=>({source,d:Math.hypot(source.x-p.x,source.z-p.z)}))
            .filter(({source:s,d})=>{
                if(d>=32)return false;
                if(s.room)return s.room.id===room?.id&&p.y>=(s.floor??0)-.5&&p.y<(s.floor??0)+7.5;
                // Contact resolution puts grounded feet a fraction below zero.
                // Do not switch the whole street off at that boundary, or at
                // exactly the nine-unit pole height above the pavement.
                return !room&&p.y>=-.5&&s.y>p.y-1&&s.y<=p.y+12&&(!s.illuminates||s.illuminates(p));
            }).map(entry=>{
                // Keep the accepted room/floor selection inside landmarks.
                if(entry.source.room)return {...entry,score:1/(1+entry.d)};
                const s=entry.source,target=s.target??{x:s.x,y:s.y-8,z:s.z};
                const dx=p.x-s.x,dy=p.y+1.2-s.y,dz=p.z-s.z;
                const ax=target.x-s.x,ay=target.y-s.y,az=target.z-s.z;
                const distance=Math.hypot(dx,dy,dz),range=s.distance??15,angle=s.angle??.68;
                const cosine=(dx*ax+dy*ay+dz*az)/Math.max(.001,distance*Math.hypot(ax,ay,az));
                const cone=THREE.MathUtils.smoothstep(cosine,Math.cos(angle),Math.cos(angle*(1-(s.penumbra??.65))));
                const score=(s.intensity??45)*cone*Math.max(0,1-distance/range)**2/Math.max(1,distance*distance);
                return {...entry,score};
            }).filter(entry=>entry.score>0).sort((a,b)=>b.score-a.score).slice(0,4);
        this.lights.forEach((light,i)=>{
            const entry=nearest[i];if(!entry){light.intensity=0;return;}
            const {source:s,d}=entry;
            const target=s.target??{x:s.x,y:s.y-8,z:s.z};
            light.position.set(s.x,s.y,s.z);light.target.position.set(target.x,target.y,target.z);light.color.setHex(s.color);
            light.distance=s.distance??15;light.angle=s.angle??.68;
            light.penumbra=s.penumbra??.65;
            light.intensity=AUTHORED_LIGHT_GAIN*(s.intensity??45)*(1-THREE.MathUtils.smoothstep(d,18,32));
        });
    }
    dispose():void {for(const light of this.lights){this.scene.remove(light,light.target);light.dispose();}this.lights.length=0;}
}
