import { AUTHORED_LIGHT_GAIN } from '../session/lightingTuning';
import * as THREE from 'three';

export interface LightRoom {id:string;xmin:number;xmax:number;zmin:number;zmax:number;ymin:number;ymax:number}
type LightAnchor={x:number;y:number;z:number};
export interface OverheadLight {
    x:number;y:number;z:number;color:number;intensity?:number;distance?:number;angle?:number;penumbra?:number;
    room?:LightRoom;floor?:number;target?:LightAnchor;illuminates?:(point:LightAnchor)=>boolean;
    brightness?:()=>number;
    /** How far above a rat an exterior light may hang and still be picked (default 12: street poles and windows; floodlight masts reach further). */
    above?:number;
}
export function insideLightRoom(p:{x:number;y:number;z:number},room:LightRoom):boolean {
    return p.x>=room.xmin&&p.x<=room.xmax&&p.z>=room.zmin&&p.z<=room.zmax&&p.y>=room.ymin&&p.y<room.ymax;
}
/** The innermost room holding `p` (a harbour master's office inside a warehouse is its own room). */
export function lightRoomAt(p:{x:number;y:number;z:number},rooms:readonly LightRoom[]):LightRoom|undefined {
    let best:LightRoom|undefined,volume=Infinity;
    for(const r of rooms){
        if(!insideLightRoom(p,r))continue;
        const v=(r.xmax-r.xmin)*(r.zmax-r.zmin)*(r.ymax-r.ymin);
        if(v<volume){best=r;volume=v;}
    }
    return best;
}
/** Actor lights in the pool; program warm-up lights the stand-ins with this many. */
export const ACTOR_SPOTS=4;
/** Four fixture lights shared by street poles, facade spill and interiors.
 * Positions/aim belong to fixtures; moving the rat only selects the useful four. */
export class StreetLightPool {
    private readonly lights:THREE.SpotLight[]=[];
    private readonly exteriorPositions={value:Array.from({length:4},()=>new THREE.Vector4(0,0,0,0))};
    private readonly scenery=new Set<THREE.MeshStandardMaterial>();
    constructor(private readonly scene:THREE.Scene,private readonly sources:readonly OverheadLight[],private readonly rooms:readonly LightRoom[]=[]){
        for(let i=0;i<ACTOR_SPOTS;i++){
            const light=new THREE.SpotLight(0xffcf96,0,15,.68,.65,2);
            light.name='noir-overhead-light';light.castShadow=false;
            scene.add(light,light.target);this.lights.push(light);
        }
    }
    /** Exterior scenery already has fixed illumination. Reassigning the four
     * actor lights must not switch pools on the pavement or walls on and off.
     * Match view-space positions, not renderer light indices (shadow sorting). */
    applyToScenery(material:THREE.MeshStandardMaterial):void {
        if(this.scenery.has(material))return;
        this.scenery.add(material);
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
        material.onBeforeCompile=(shader,renderer)=>{
            compile.call(material,shader,renderer);
            shader.uniforms.exteriorActorLights=this.exteriorPositions;
            shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
                uniform vec4 exteriorActorLights[4];
                float scenerySpot(vec3 position){
                    for(int j=0;j<4;j++){
                        if(exteriorActorLights[j].w>0.5 && distance(position,exteriorActorLights[j].xyz)<0.001)return 0.0;
                    }
                    return 1.0;
                }`).replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replace(
                    'getSpotLightInfo( spotLight, geometryPosition, directLight );',
                    'getSpotLightInfo( spotLight, geometryPosition, directLight );\n directLight.color *= scenerySpot(spotLight.position);'));
        };
        material.customProgramCacheKey=()=>key+'-steady-exterior-v1';material.needsUpdate=true;
    }
    update(camera:THREE.Camera,anchor:{x:number;y:number;z:number}=camera.position):void {
        // The shoulder camera may sit outside a doorway or above a low ceiling.
        // Select the room/floor from the rat, not from that offset camera.
        const p=anchor,room=lightRoomAt(p,this.rooms);
        // Best four by score, highest first; equal scores keep source order
        // (the former stable sort). Runs every frame over ~230 sources: no allocation.
        const top=this.top,topD=this.topD,topScore=this.topScore;let count=0;
        for(const s of this.sources){
            const d=Math.hypot(s.x-p.x,s.z-p.z);
            if(d>=32||(s.brightness?.()??1)<=0)continue;
            let score:number;
            if(s.room){
                if(!(s.room.id===room?.id&&p.y>=(s.floor??0)-.5&&p.y<(s.floor??0)+7.5))continue;
                // Keep the accepted room/floor selection inside landmarks.
                score=1/(1+d);
            }else{
                // Contact resolution puts grounded feet a fraction below zero.
                // Do not switch the whole street off at that boundary, or at
                // exactly the nine-unit pole height above the pavement.
                if(!(!room&&p.y>=-.5&&s.y>p.y-1&&s.y<=p.y+(s.above??12)&&(!s.illuminates||s.illuminates(p))))continue;
                const tx=s.target?.x??s.x,ty=s.target?.y??s.y-8,tz=s.target?.z??s.z;
                const dx=p.x-s.x,dy=p.y+1.2-s.y,dz=p.z-s.z;
                const ax=tx-s.x,ay=ty-s.y,az=tz-s.z;
                const distance=Math.hypot(dx,dy,dz),range=s.distance??15,angle=s.angle??.68;
                const cosine=(dx*ax+dy*ay+dz*az)/Math.max(.001,distance*Math.hypot(ax,ay,az));
                const cone=THREE.MathUtils.smoothstep(cosine,Math.cos(angle),Math.cos(angle*(1-(s.penumbra??.65))));
                score=(s.intensity??45)*(s.brightness?.()??1)*cone*Math.max(0,1-distance/range)**2/Math.max(1,distance*distance);
            }
            if(!(score>0))continue;
            let at=count;while(at>0&&topScore[at-1]<score)at--;
            if(at>=4)continue;
            for(let k=Math.min(count,3);k>at;k--){top[k]=top[k-1];topD[k]=topD[k-1];topScore[k]=topScore[k-1];}
            top[at]=s;topD[at]=d;topScore[at]=score;count=Math.min(4,count+1);
        }
        camera.updateMatrixWorld();
        for(let i=0;i<this.lights.length;i++){
            const light=this.lights[i];
            this.exteriorPositions.value[i].set(0,0,0,0);
            if(i>=count){light.intensity=0;continue;}
            const s=top[i]!,d=topD[i];
            light.position.set(s.x,s.y,s.z);light.target.position.set(s.target?.x??s.x,s.target?.y??s.y-8,s.target?.z??s.z);light.color.setHex(s.color);
            light.distance=s.distance??15;light.angle=s.angle??.68;
            light.penumbra=s.penumbra??.65;
            light.intensity=AUTHORED_LIGHT_GAIN*(s.intensity??45)*(s.brightness?.()??1)*(1-THREE.MathUtils.smoothstep(d,18,32));
            if(!s.room){
                const view=this.view.copy(light.position).applyMatrix4(camera.matrixWorldInverse);
                this.exteriorPositions.value[i].set(view.x,view.y,view.z,1);
            }
        }
    }
    private readonly top:(OverheadLight|undefined)[]=[undefined,undefined,undefined,undefined];
    private readonly topD=new Float64Array(4);
    private readonly topScore=new Float64Array(4);
    private readonly view=new THREE.Vector3();
    dispose():void {for(const light of this.lights){this.scene.remove(light,light.target);light.dispose();}this.lights.length=0;this.scenery.clear();}
}
