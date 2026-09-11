import * as THREE from 'three';
import {sampleStreetSpill,type SpillSource,type SpillBlocker} from './StreetReadability';
import {AUTHORED_LIGHT_GAIN} from '../session/lightingTuning';

interface Box {x:number;y:number;z:number;w:number;h:number;d:number}
type Point={x:number;y:number;z:number};
export function windowBrightness(source:SpillSource):number {
    return source.occupancy?THREE.MathUtils.smoothstep(source.occupancy.value,.04,1):1;
}

/** Clip the full shaft against real 3D building/room bounds, not an infinite
 * ground footprint. All samples start at the visible aperture. */
export function beamReach(s:SpillSource,boxes:readonly Box[]):number {
    let fraction=1;
    const width=(s.width??(s.kind==='door'?1.7:s.kind==='sign'?2.1:1.35))/2;
    const height=(s.height??(s.kind==='window'?.85:.24))/2;
    const intersect=(a:Point,b:Point,box:Box)=>{
        let lo=0,hi=1;
        for(const [start,delta,min,max] of [[a.x,b.x-a.x,box.x-box.w/2,box.x+box.w/2],
            [a.y,b.y-a.y,box.y-box.h/2,box.y+box.h/2],[a.z,b.z-a.z,box.z-box.d/2,box.z+box.d/2]]){
            if(Math.abs(delta)<1e-8){if(start<min||start>max)return 1;continue;}
            const first=(min-start)/delta,last=(max-start)/delta;
            lo=Math.max(lo,Math.min(first,last));hi=Math.min(hi,Math.max(first,last));
        }
        return lo<=hi&&hi>0?Math.max(0,lo-.015/s.reach):1;
    };
    const nearby=boxes.filter(b=>Math.abs(b.x-s.x)<b.w/2+s.reach+width&&Math.abs(b.z-s.z)<b.d/2+s.reach+width
        &&b.y-b.h/2<s.y+height&&b.y+b.h/2>s.y-s.reach*1.1-height);
    for(const side of [-1,0,1])for(const vertical of [-1,1]){
        const a={x:s.x+s.nz*width*side,y:s.y+height*vertical,z:s.z-s.nx*width*side};
        const b={x:a.x+s.nx*s.reach+s.nz*side*s.reach*.22,
            y:a.y-s.reach*.85+vertical*s.reach*.12,z:a.z+s.nz*s.reach-s.nx*side*s.reach*.22};
        for(const box of nearby)fraction=Math.min(fraction,intersect(a,b,box));
    }
    return s.reach*fraction;
}

/** A few cell batches of fixed, downward rectangular shafts. The tiny shared
 * occupancy strip follows the same room uniforms as the actual window panes;
 * positions never follow the camera. There are no extra live lights/shadows. */
export class FacadeBeams {
    private readonly meshes:THREE.Mesh[]=[];
    private readonly states:(SpillSource['occupancy'])[]=[undefined];
    private readonly texture:THREE.DataTexture;
    private readonly material:THREE.ShaderMaterial;
    constructor(scene:THREE.Scene,sources:readonly SpillSource[],boxes:readonly Box[],blockers:readonly SpillBlocker[]){
        const stateIds=new Map<SpillSource['occupancy'],number>([[undefined,0]]);
        for(const s of sources)if(!stateIds.has(s.occupancy)){stateIds.set(s.occupancy,this.states.length);this.states.push(s.occupancy);}
        const size=THREE.MathUtils.ceilPowerOfTwo(this.states.length),data=new Uint8Array(size*4);
        this.texture=new THREE.DataTexture(data,size,1,THREE.RGBAFormat);
        this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;this.texture.generateMipmaps=false;
        this.material=new THREE.ShaderMaterial({
            uniforms:{occupancy:{value:this.texture}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
            vertexShader:`attribute vec3 tint; attribute vec2 beamUv; attribute float roomUv; attribute float strength;
                varying vec3 vTint; varying vec2 vBeamUv; varying float vRoomUv; varying float vStrength; varying vec3 vWorld;
                void main(){vTint=tint;vBeamUv=beamUv;vRoomUv=roomUv;vStrength=strength;vWorld=position;
                    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
            fragmentShader:`uniform sampler2D occupancy;
                varying vec3 vTint; varying vec2 vBeamUv; varying float vRoomUv; varying float vStrength; varying vec3 vWorld;
                void main(){
                    if(vWorld.y<.055)discard;
                    float across=pow(max(0.0,1.0-abs(vBeamUv.x*2.0-1.0)),.6);
                    float along=pow(max(0.0,1.0-vBeamUv.y),1.3);
                    float alpha=texture2D(occupancy,vec2(vRoomUv,.5)).r*vStrength*across*along;
                    gl_FragColor=vec4(vTint,alpha);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }`,
        });
        type Batch={positions:number[];colors:number[];uvs:number[];rooms:number[];strengths:number[]};
        const cells=new Map<string,Batch>(),boxCells=new Map<string,Box[]>(),color=new THREE.Color();
        for(const s of sources){
            const cx=Math.floor(s.x/60),cz=Math.floor(s.z/60),key=`${cx},${cz}`;
            let nearbyBoxes=boxCells.get(key);
            if(!nearbyBoxes){nearbyBoxes=boxes.filter(b=>b.x+b.w/2>=cx*60-20&&b.x-b.w/2<=(cx+1)*60+20
                &&b.z+b.d/2>=cz*60-20&&b.z-b.d/2<=(cz+1)*60+20);boxCells.set(key,nearbyBoxes);}
            const reach=beamReach(s,nearbyBoxes);if(reach<.35)continue;
            let batch=cells.get(key);if(!batch){batch={positions:[],colors:[],uvs:[],rooms:[],strengths:[]};cells.set(key,batch);}
            color.setHex(s.color);
            const roomUv=(stateIds.get(s.occupancy)!+.5)/size;
            const vertex=(p:Point,u:number,v:number,strength:number)=>{
                batch.positions.push(p.x,p.y,p.z);batch.colors.push(color.r,color.g,color.b);
                batch.uvs.push(u,v);batch.rooms.push(roomUv);batch.strengths.push(strength);
            };
            const w=(s.width??(s.kind==='door'?1.7:s.kind==='sign'?2.1:1.35))/2,h=(s.height??(s.kind==='window'?.85:.24))/2;
            const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
            const point=(corner:number,d:number)=>{
                const [side,vertical]=corners[corner];
                return {x:s.x+s.nx*d+s.nz*side*(w+d*.22),y:s.y-d*.85+vertical*(h+d*.12),z:s.z+s.nz*d-s.nx*side*(w+d*.22)};
            };
            // Fade to zero before a blocker; no hard wall-crossing wedge ends.
            for(let side=0;side<4;side++){
                const next=(side+1)%4;
                for(const [corner,d,u] of [[side,0,0],[next,0,1],[next,reach,1],[side,0,0],[next,reach,1],[side,reach,0]])
                    vertex(point(corner,d),u,d/reach,.010*AUTHORED_LIGHT_GAIN);
            }
            // Occupancy-driven ground footprint for apartment windows. Steady
            // workshop/door footprints are already in the one baked atlas.
            if(!s.occupancy||s.y/.85>reach)continue;
            const nearby=blockers.filter(b=>Math.abs(b.x-s.x)<b.w/2+s.reach&&Math.abs(b.z-s.z)<b.d/2+s.reach);
            const steps=8,half=w+reach*.22;
            const ground=(i:number,j:number)=>{
                const d=i/steps*reach,a=(j/steps*2-1)*half;
                return {x:s.x+s.nx*d+s.nz*a,y:.065,z:s.z+s.nz*d-s.nx*a};
            };
            for(let i=0;i<steps;i++)for(let j=0;j<steps;j++){
                for(const [di,dj] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
                    const p=ground(i+di,j+dj),amount=sampleStreetSpill(s,p.x,p.z,nearby);
                    vertex(p,.5,0,amount*AUTHORED_LIGHT_GAIN);
                }
            }
        }
        for(const [cell,b] of cells){
            const geometry=new THREE.BufferGeometry();
            for(const [name,values,size] of [['position',b.positions,3],['tint',b.colors,3],['beamUv',b.uvs,2],['roomUv',b.rooms,1],['strength',b.strengths,1]] as const)
                geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
            geometry.computeBoundingSphere();
            const mesh=new THREE.Mesh(geometry,this.material);mesh.name=`facade-downward-beams-${cell}`;mesh.raycast=()=>{};
            scene.add(mesh);this.meshes.push(mesh);
        }
        this.update();
    }
    update():void {
        const data=this.texture.image.data as Uint8Array;let changed=false;
        this.states.forEach((occupancy,i)=>{
            const next=Math.round((occupancy?THREE.MathUtils.smoothstep(occupancy.value,.04,1):1)*255);
            if(data[i*4]!==next){data[i*4]=next;changed=true;}
        });
        if(changed)this.texture.needsUpdate=true;
    }
    dispose():void {for(const mesh of this.meshes){mesh.removeFromParent();mesh.geometry.dispose();}this.meshes.length=0;this.texture.dispose();this.material.dispose();}
}
