import * as THREE from 'three';
import {PICKUP_TUNING} from '../shared/pickups';
import {disposeMeshResources} from '../utils/disposeMeshResources';

/** An ink-stamped cheese wedge refills from bottom to top. No digits or per-frame canvas work. */
export class PickupRespawnVisual {
    readonly root=new THREE.Group();
    private readonly fill:THREE.ShaderMaterial;
    private readonly texture:THREE.CanvasTexture;
    private readonly crumbs:THREE.Mesh[]=[];
    constructor(){
        this.root.name='supply-restock-cheese';this.root.position.y=1.3;
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
        const c=canvas.getContext('2d')!;
        c.lineJoin='round';c.lineCap='round';
        const shape=(points:number[][],fill:string,width=8)=>{
            c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();
            c.fillStyle=fill;c.fill();c.strokeStyle='#100c17';c.lineWidth=width;c.stroke();
        };
        // Uneven paper/ink rays and a chunky wedge with shaded side and comic pores.
        shape([[14,163],[40,129],[30,108],[72,108],[94,52],[121,65],[154,30],[170,79],[210,73],[207,116],[245,141],[230,177],[244,217],[204,215],[166,246],[135,231],[91,249],[74,225],[27,234],[35,200]],'#d9d5cd',5);
        shape([[45,184],[130,78],[222,151],[222,187],[45,230]],'#b98529');
        shape([[45,184],[130,78],[222,151]],'#f4cb58');
        shape([[45,184],[222,151],[222,187],[45,230]],'#ddb145');
        for(const [x,y,r] of [[122,132,13],[102,165,8],[164,148,10],[79,204,8],[154,191,10],[198,173,5]]){
            c.beginPath();c.ellipse(x,y,r,r*.7,-.22,0,Math.PI*2);c.fillStyle='#785820';c.fill();
            c.strokeStyle='#100c17';c.lineWidth=3;c.stroke();
        }
        // A detective's tipped fedora supplies the noir silhouette.
        shape([[90,90],[98,60],[122,68],[141,51],[159,79]],'#282130',5);
        shape([[78,92],[116,81],[166,75],[169,85],[101,107]],'#17111e',4);
        c.strokeStyle='#d9d5cd';c.lineWidth=4;c.beginPath();c.moveTo(100,78);c.lineTo(151,67);c.stroke();
        this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
        this.fill=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:this.texture},progress:{value:0}},
            vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
            fragmentShader:`uniform sampler2D map;uniform float progress;varying vec2 vUv;
                void main(){vec4 color=texture2D(map,vUv);if(color.a<.02)discard;
                    bool cheese=color.r>color.g*1.12&&color.g>color.b*1.3;
                    float height=clamp((vUv.y-.1)/.6,0.,1.);
                    if(cheese&&height>progress)color.rgb=vec3(.15,.12,.17);
                    if(cheese&&abs(height-progress)<.018)color.rgb=vec3(1.,.85,.48);
                    gl_FragColor=color;
                    #include <colorspace_fragment>
                }`});
        this.root.add(new THREE.Mesh(new THREE.PlaneGeometry(2.05,2.05),this.fill));
        for(let i=0;i<4;i++){
            const crumb=new THREE.Mesh(new THREE.PlaneGeometry(.07,.07),new THREE.MeshBasicMaterial({color:0xffd875,transparent:true,depthWrite:false}));
            crumb.position.z=.02;this.root.add(crumb);this.crumbs.push(crumb);
        }
    }
    update(now:number,availableAt:number,camera:THREE.Camera):void {
        camera.getWorldQuaternion(this.root.quaternion);
        const progress=1-Math.max(0,Math.min(1,(availableAt-now)/PICKUP_TUNING.respawnMs));
        this.fill.uniforms.progress.value=progress;
        for(let i=0;i<this.crumbs.length;i++){
            const crumb=this.crumbs[i],phase=(now*.0016+i*.25)%1;
            crumb.position.x=Math.sin(i*2.1+now*.001)*(.2+progress*.35);
            crumb.position.y=-.8+progress*1.23+phase*.22;crumb.rotation.z=now*.004+i;
            (crumb.material as THREE.MeshBasicMaterial).opacity=(1-phase)*.8;
        }
    }
    dispose():void {this.root.removeFromParent();this.texture.dispose();disposeMeshResources(this.root);}
}
