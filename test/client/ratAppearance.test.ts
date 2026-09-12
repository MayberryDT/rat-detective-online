import { expect, it } from 'vitest';
import * as THREE from 'three';
import { APPEARANCE_COUNT, appearanceAt, DEFAULT_APPEARANCE, generateRandomAppearance, HIGHLIGHT_COLORS } from '../../src/shared/ratAppearance';
import { parseClientMessage, parseServerMessage } from '../../src/shared/messageValidation';
import { PROTOCOL_VERSION } from '../../src/shared/networkProtocol';
import { createPlayer, respawnPlayer } from '../../src/worker/gameState';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { ChaosEncoder, ChaosDecoder } from '../../src/shared/chaosWire';
import { createRatMesh } from '../../src/utils/RatModel';
import { disposeMeshResources } from '../../src/utils/disposeMeshResources';

it('exposes exactly 1,024 independent assignments with one hat shape', () => {
    const pool = Array.from({length:APPEARANCE_COUNT},(_,i)=>appearanceAt(i));
    expect(pool).toHaveLength(1024);
    expect(new Set(pool.map(p=>JSON.stringify(p))).size).toBe(1024);
    expect(new Set(pool.map(p=>p.hatType))).toEqual(new Set(['fedora']));
    for(const field of ['hatColor','coatColor','highlightColor','furColor'] as const)
        expect(new Set(pool.map(p=>p[field])).size).toBe(field==='hatColor'||field==='coatColor'?8:4);
    expect(generateRandomAppearance(()=>0)).toEqual(pool[0]);
    expect(generateRandomAppearance(()=>.999999)).toEqual(pool[1023]);
});
it('preserves validated highlights through join, remote player data and compact corpse playback',()=>{
    const appearance={...DEFAULT_APPEARANCE,highlightColor:HIGHLIGHT_COLORS[2]};
    const join={type:'join',protocolVersion:PROTOCOL_VERSION,name:'Rat',appearance};
    expect(parseClientMessage(JSON.stringify(join))).toMatchObject({appearance});
    const player=createPlayer('one','Rat',appearance,{x:0,y:0,z:0});
    const welcome={type:'welcome',protocolVersion:PROTOCOL_VERSION,id:'one',player,players:{one:player},
        world:{seed:1,version:2},round:{phase:'playing'},serverTime:1000};
    expect(parseServerMessage(JSON.stringify(welcome))).toMatchObject({player:{highlightColor:appearance.highlightColor}});
    for(const highlightColor of [-1,0x1000000,1.5,null,'tan'])
        expect(parseClientMessage(JSON.stringify({...join,appearance:{...appearance,highlightColor}}))).toBeNull();
    const {highlightColor: _highlight, ...legacy}=appearance;
    expect(parseClientMessage(JSON.stringify({...join,appearance:legacy}))).toMatchObject({appearance:legacy});
    const sim=new ChaosSimulation(new Map([[player.id,player]]),()=>{});
    {
        sim.death(player,{x:0,y:0,z:1});
        const decoded=new ChaosDecoder().read(new ChaosEncoder().encode(sim.snapshot(false)).payload);
        expect(decoded?.message).toMatchObject({type:'chaos',state:{corpses:[{appearance}]}});
        const respawned=respawnPlayer(player,{x:1,y:0,z:0});
        expect(respawned.highlightColor).toBe(appearance.highlightColor);
    }
});
it('shares a single highlight material and preserves the muzzle while changing outfits',()=>{
    const roots=[createRatMesh(),createRatMesh({...appearanceAt(745),hatType:'porkpie'})];
    try {
        for(const root of roots){
            const names=['rat-hatband','rat-collar','rat-lapel-left','rat-lapel-right','rat-pistol-cuff'];
            const materials=names.map(name=>(root.getObjectByName(name) as THREE.Mesh).material);
            expect(new Set(materials).size).toBe(1);
            expect((materials[0] as THREE.Material).name).toBe('rat-highlight');
            const buttons:THREE.Object3D[]=[];root.traverse(o=>{if(o.name.startsWith('rat-button-'))buttons.push(o);});
            expect(buttons).toHaveLength(3);
            expect(new Set(buttons.map(b=>b.position.x)).size).toBe(1);
            const all=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh)all.add(o.material);});
            expect(all.size).toBeLessThanOrEqual(16); // retain the one-draw remote palette path
        }
        const position=(root:THREE.Group,name:string)=>root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
        expect(position(roots[0],'rat-muzzle')).toEqual(position(roots[1],'rat-muzzle'));
        expect(new THREE.Box3().setFromObject(roots[0].getObjectByName('hat-crown')!))
            .toEqual(new THREE.Box3().setFromObject(roots[1].getObjectByName('hat-crown')!));
    } finally {roots.forEach(disposeMeshResources);}
});
