import * as THREE from 'three';

/** Same 0.15-radius cheese ball; shallow surface pores are visual only. */
export function createCheeseBallGeometry(): THREE.SphereGeometry {
    const geometry = new THREE.SphereGeometry(0.15, 24, 16);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count*3);
    const direction = new THREE.Vector3();
    const pores = [new THREE.Vector3(0.2,0.4,1), new THREE.Vector3(-0.7,-0.2,0.8),
        new THREE.Vector3(0.8,-0.4,0.3), new THREE.Vector3(-0.2,0.8,-0.5),
        new THREE.Vector3(0.3,-0.6,-0.9),new THREE.Vector3(-0.9,0.1,-0.4)].map(v => v.normalize());
    for (let i = 0; i < positions.count; i++) {
        direction.fromBufferAttribute(positions, i).normalize();
        let inset = 0;
        for (const pore of pores) {
            const proximity = Math.max(0,(direction.dot(pore) - 0.95) / 0.05);
            inset = Math.max(inset, proximity * proximity * 0.008);
        }
        positions.setXYZ(i,direction.x * (0.15-inset),direction.y * (0.15-inset),direction.z * (0.15-inset));
        // Pores remain readable even under the small emissive visibility fill.
        const shade=1-inset/.008*.82;
        colors.set([shade,shade,shade],i*3);
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    return geometry;
}

/** Yellow ordinary cheese; red cheese after a lethal Crossfire bank shot.
 * Pores and surface shading remain visible in both materials. */
export function createCheeseBallMaterial(crossfire=false):THREE.MeshStandardMaterial {
    const material=new THREE.MeshStandardMaterial({color:crossfire?0xe64032:0xffdb3d,emissive:crossfire?0x9c2015:0xe0ad25,emissiveIntensity:.35,roughness:.68,vertexColors:true});
    material.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor;');
    };
    material.customProgramCacheKey=()=> 'cheese-pore-emission-v1';
    return material;
}
