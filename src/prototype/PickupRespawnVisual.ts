import * as THREE from 'three';
import {PICKUP_TUNING,type PickupKind} from '../shared/pickups';
import {disposeMeshResources} from '../utils/disposeMeshResources';

/** Item-specific restock dial. One depth-tested plane; only its progress uniform changes. */
export class PickupRespawnVisual {
    readonly root=new THREE.Group();
    private readonly fill:THREE.ShaderMaterial;
    private readonly texture:THREE.CanvasTexture;
    constructor(kind:PickupKind){
        this.root.name='supply-restock-'+kind;this.root.position.y=1.3;
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
        const c=canvas.getContext('2d')!;
        c.scale(2.56,2.56);c.lineJoin='round';c.lineCap='round';
        const path=(d:string,fill:string,stroke='#15101b',width=5)=>{
            const shape=new Path2D(d);c.fillStyle=fill;c.fill(shape);
            c.strokeStyle=stroke;c.lineWidth=width;c.stroke(shape);
        };
        // Recognizable supply silhouettes, deliberately subdued while unavailable.
        if(kind==='ironclad'){
            path('M30 20 43 14 57 14 70 20 84 57 68 63 65 47 70 88 30 88 35 47 32 63 16 57Z','#9aa9b8');
            path('m43 16 7 25-17-7 7 23 10-10 10 10 7-23-17 7 7-25','#c1cbd1');
            c.strokeStyle='#15101b';c.lineWidth=4;c.stroke(new Path2D('M32 69h36M50 48v37'));
        }else if(kind==='hustle'){
            for(const x of [0,34]){
                c.save();c.translate(x,0);
                path('M20 22 40 24 37 55 48 66 49 81 43 86H13L9 75 16 57Z','#be5148');
                c.strokeStyle='#ccbab1';c.lineWidth=3;c.stroke(new Path2D('m17 59 17 5m-20 3 18 5M14 80h30'));
                c.restore();
            }
        }else{
            path('M37 15H63V37H85V63H63V85H37V63H15V37H37Z','#75b792');
        }
        this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
        this.fill=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,toneMapped:false,
            uniforms:{map:{value:this.texture},progress:{value:0},accent:{value:new THREE.Color(kind==='ironclad'?0xc4d2df:kind==='hustle'?0xe16a59:0x87d8a5)}},
            vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
            fragmentShader:`uniform sampler2D map;uniform float progress;uniform vec3 accent;varying vec2 vUv;
                void main(){
                    vec2 p=vUv-.5;float radius=length(p);
                    float aa=max(fwidth(radius),.001);
                    float alpha=1.-smoothstep(.477-aa,.477+aa,radius);
                    if(alpha<.01)discard;
                    vec3 color=vec3(.025,.018,.032);
                    float face=1.-smoothstep(.337-aa,.337+aa,radius);
                    color=mix(color,vec3(.055,.042,.062),face);
                    float ring=smoothstep(.371-aa,.371+aa,radius)*(1.-smoothstep(.445-aa,.445+aa,radius));
                    // atan(x,y) starts at twelve o'clock and advances clockwise.
                    float turn=mod(atan(p.x,p.y)+6.2831853,6.2831853)/6.2831853;
                    float filled=progress>0.&&turn<progress?1.:0.;
                    color=mix(color,mix(vec3(.115,.095,.13),accent,filled),ring);
                    vec2 iconUv=p/.61+.5;
                    if(all(greaterThanEqual(iconUv,vec2(0.)))&&all(lessThanEqual(iconUv,vec2(1.)))){
                        vec4 icon=texture2D(map,iconUv);color=mix(color,icon.rgb*.78,icon.a*face);
                    }
                    gl_FragColor=vec4(color,alpha);
                    #include <colorspace_fragment>
                }`});
        this.root.add(new THREE.Mesh(new THREE.PlaneGeometry(1.75,1.75),this.fill));
    }
    update(now:number,availableAt:number,camera:THREE.Camera):void {
        camera.getWorldQuaternion(this.root.quaternion);
        this.fill.uniforms.progress.value=1-Math.max(0,Math.min(1,(availableAt-now)/PICKUP_TUNING.respawnMs));
    }
    dispose():void {this.root.removeFromParent();this.texture.dispose();disposeMeshResources(this.root);}
}
