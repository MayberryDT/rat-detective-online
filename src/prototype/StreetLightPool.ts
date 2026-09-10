import * as THREE from 'three';

export interface OverheadLight {x:number;y:number;z:number;color:number}
/** Four nearby downlights, with no extra shadow maps. The authored lamps and
 * baked illumination remain visible throughout the city in either mode. */
export class StreetLightPool {
    private readonly lights:THREE.SpotLight[]=[];
    constructor(private readonly scene:THREE.Scene,private readonly sources:readonly OverheadLight[]){
        for(let i=0;i<4;i++){
            const light=new THREE.SpotLight(0xffcf96,0,11,.82,.65,2);
            light.name='noir-overhead-light';light.castShadow=false;
            scene.add(light,light.target);this.lights.push(light);
        }
    }
    update(camera:THREE.Camera):void {
        const p=camera.position;
        if(p.y<0){for(const light of this.lights)light.intensity=0;return;}
        const nearest=this.sources.map(source=>({source,d:Math.hypot(source.x-p.x,source.z-p.z)}))
            .filter(({source,d})=>d<32&&source.y>p.y-1&&source.y<p.y+9).sort((a,b)=>a.d-b.d).slice(0,4);
        this.lights.forEach((light,i)=>{
            const entry=nearest[i];if(!entry){light.intensity=0;return;}
            const {source:s,d}=entry;
            light.position.set(s.x,s.y,s.z);light.target.position.set(s.x,s.y-8,s.z);light.color.setHex(s.color);
            light.intensity=45*(1-THREE.MathUtils.smoothstep(d,18,32));
        });
    }
    dispose():void {for(const light of this.lights){this.scene.remove(light,light.target);light.dispose();}this.lights.length=0;}
}
