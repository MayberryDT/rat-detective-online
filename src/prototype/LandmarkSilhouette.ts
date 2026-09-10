import * as THREE from 'three';

/** Draw only the outside of the union mask. Overlapping roofs/volumes cannot
 * produce internal lines, face fills or wireframe edges, even behind scenery. */
export class LandmarkSilhouette {
    readonly scene=new THREE.Scene();
    readonly ink=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
    private readonly mask=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false,samples:4});
    private readonly overlay=new THREE.Scene();
    private readonly camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    private readonly size=new THREE.Vector2();
    private readonly clearColor=new THREE.Color();
    private readonly viewport=new THREE.Vector4();
    private readonly scissor=new THREE.Vector4();
    private readonly material=new THREE.ShaderMaterial({
        transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
        uniforms:{mask:{value:this.mask.texture},pixel:{value:new THREE.Vector2(1,1)},strength:{value:.85},color:{value:new THREE.Color(0xcab267)}},
        vertexShader:`varying vec2 uvMask;void main(){uvMask=uv;gl_Position=vec4(position.xy,0.,1.);}`,
        fragmentShader:`
            uniform sampler2D mask;uniform vec2 pixel;uniform float strength;uniform vec3 color;varying vec2 uvMask;
            void main(){
                float inside=texture2D(mask,uvMask).r;
                if(inside>.99)discard;
                float edge=0.,halo=0.;
                for(int i=0;i<12;i++){
                    float angle=float(i)*6.2831853/12.;vec2 direction=vec2(cos(angle),sin(angle));
                    edge=max(edge,texture2D(mask,uvMask+direction*pixel*2.).r);
                    halo=max(halo,texture2D(mask,uvMask+direction*pixel*5.).r);
                }
                float alpha=(1.-inside)*(edge*.82+(halo-edge)*.13)*strength;
                if(alpha<.005)discard;
                gl_FragColor=vec4(color,alpha);
                #include <colorspace_fragment>
            }`,
    });
    private readonly quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);
    constructor(){this.scene.background=new THREE.Color(0);this.quad.frustumCulled=false;this.overlay.add(this.quad);}
    render(renderer:THREE.WebGLRenderer,camera:THREE.Camera,strength:number):void {
        renderer.getDrawingBufferSize(this.size);
        // One small binary target, bounded independently of device pixel ratio.
        const scale=Math.min(1,960/this.size.x,720/this.size.y);
        const w=Math.max(1,Math.round(this.size.x*scale)),h=Math.max(1,Math.round(this.size.y*scale));
        if(this.mask.width!==w||this.mask.height!==h)this.mask.setSize(w,h);
        this.material.uniforms.pixel.value.set(1/w,1/h);this.material.uniforms.strength.value=strength;
        const target=renderer.getRenderTarget(),clearAlpha=renderer.getClearAlpha(),autoClear=renderer.autoClear;
        const xr=renderer.xr.enabled,autoReset=renderer.info.autoReset;
        renderer.getClearColor(this.clearColor);renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);
        const scissorTest=renderer.getScissorTest();
        try{
            renderer.xr.enabled=false;renderer.info.autoReset=false;renderer.autoClear=false;
            renderer.setRenderTarget(this.mask);renderer.setScissorTest(false);renderer.setClearColor(0,1);renderer.clear(true,false,false);
            renderer.render(this.scene,camera);
            renderer.setRenderTarget(target);renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);
            renderer.render(this.overlay,this.camera);
        }finally{
            renderer.setRenderTarget(target);renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);
            renderer.setClearColor(this.clearColor,clearAlpha);renderer.autoClear=autoClear;renderer.xr.enabled=xr;renderer.info.autoReset=autoReset;
        }
    }
    dispose():void {this.mask.dispose();this.quad.geometry.dispose();this.material.dispose();this.ink.dispose();this.scene.clear();this.overlay.clear();}
}
