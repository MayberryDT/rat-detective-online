import { AUTHORED_LIGHT_GAIN } from '../session/lightingTuning';
import * as THREE from 'three';

export interface LightRoom {id:string;xmin:number;xmax:number;zmin:number;zmax:number;ymin:number;ymax:number}
export interface OverheadLight {x:number;y:number;z:number;color:number;intensity?:number;distance?:number;angle?:number;room?:LightRoom;floor?:number}
export function insideLightRoom(p:{x:number;y:number;z:number},room:LightRoom):boolean {
    return p.x>=room.xmin&&p.x<=room.xmax&&p.z>=room.zmin&&p.z<=room.zmax&&p.y>=room.ymin&&p.y<room.ymax;
}
/** Four nearby downlights, with no extra shadow maps. The authored lamps and
 * baked illumination remain visible throughout the city in either mode. */
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
                return !room&&p.y>=0&&s.y>p.y-1&&s.y<p.y+9;
            }).sort((a,b)=>a.d-b.d).slice(0,4);
        this.lights.forEach((light,i)=>{
            const entry=nearest[i];if(!entry){light.intensity=0;return;}
            const {source:s,d}=entry;
            light.position.set(s.x,s.y,s.z);light.target.position.set(s.x,s.y-8,s.z);light.color.setHex(s.color);
            light.distance=s.distance??15;light.angle=s.angle??.68;
            light.intensity=AUTHORED_LIGHT_GAIN*(s.intensity??45)*(1-THREE.MathUtils.smoothstep(d,18,32));
        });
    }
    dispose():void {for(const light of this.lights){this.scene.remove(light,light.target);light.dispose();}this.lights.length=0;}
}
