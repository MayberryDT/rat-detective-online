import * as THREE from 'three';

const DIRECT='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
let guarded=false;

/** Point and spot lights skip the lighting model wherever they add nothing: outside the cone
 * or range, or switched off (the light pool parks unused actor lights at zero intensity so no
 * program relinks, and exterior scenery zeroes them). The pixels are the same; most fragments
 * evaluate one or two lights instead of every spot and lamp. Call before any program links. */
export function guardLightLoops():void {
    if(guarded)return;
    const chunk=THREE.ShaderChunk.lights_fragment_begin,split=chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 )');
    const parts=chunk.slice(0,split).split(DIRECT);
    // Point and spot loops, nothing else: a three upgrade that moves them must be looked at.
    if(split<0||parts.length!==3)throw Error('three lights_fragment_begin changed: review guardLightLoops');
    THREE.ShaderChunk.lights_fragment_begin=parts.join(`if ( directLight.visible ) ${DIRECT}`)+chunk.slice(split);
    guarded=true;
}
