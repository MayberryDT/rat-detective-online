import * as THREE from 'three';

let reflection:THREE.DataTexture|undefined;
/** Shared neutral reflection bands for polished metal in the dark city. This is
 * a tiny static material texture, not a scene capture, light or shadow source. */
export function metalReflection():THREE.DataTexture {
    if(reflection)return reflection;
    const width=128,height=64,pixels=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const u=x/width,v=y/height;
        const stripe=(center:number,spread:number)=>Math.exp(-Math.pow((u-center)/spread,2));
        const bands=stripe(.12,.035)*.8+stripe(.46,.07)*.6+stripe(.8,.028)*.95;
        const level=Math.min(1,.10+(1-v)*.16+bands*(.4+.6*Math.sin(v*Math.PI)));
        const i=(y*width+x)*4;
        pixels[i]=Math.round(level*240);pixels[i+1]=Math.round(level*247);pixels[i+2]=Math.round(level*255);pixels[i+3]=255;
    }
    reflection=new THREE.DataTexture(pixels,width,height);reflection.name='silver-reflection-bands';
    reflection.mapping=THREE.EquirectangularReflectionMapping;reflection.colorSpace=THREE.SRGBColorSpace;
    reflection.needsUpdate=true;return reflection;
}
