import {afterEach, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as entityAudio from '../../src/audio/EntityAudio';
import {RatEntity} from '../../src/entities/RatEntity';

afterEach(()=>vi.restoreAllMocks());

it.each([false,true])('supplies the source for remote hit/death/corpse audio, leaving your reactions full (local=%s)', local=>{
    const play=vi.spyOn(entityAudio,'playEntitySound').mockImplementation(()=>{});
    const rat=new RatEntity(new THREE.Scene(),new CANNON.World(),new THREE.Vector3(150,0,20),'Rat',{});
    rat.isPlayer=local;
    try {
        rat.takeDamage(1,new THREE.Vector3());
        if(local)expect(play).toHaveBeenLastCalledWith('playerHit',.6);
        else expect(play).toHaveBeenLastCalledWith('ratHit',.5,rat.body.position);
        play.mockClear();
        rat.takeDamage(2,new THREE.Vector3());
        expect(play).toHaveBeenCalledWith('ratDeath',.6,local?undefined:rat.body.position);
        if(local)expect(play).toHaveBeenLastCalledWith('playerHit',.6);
        else expect(play).toHaveBeenLastCalledWith('ratHit',.4,rat.body.position);
        rat.update(.2);
        rat.body.dispatchEvent({type:'collide',contact:{getImpactVelocityAlongNormal:()=>8}});
        expect(play).toHaveBeenLastCalledWith('ratHit',.45,rat.body.position);
        rat.respawn({x:150,y:0,z:20,hp:3});
        play.mockClear();
        rat.useSharedCorpse();rat.useSharedCorpse();
        expect(play).toHaveBeenCalledExactlyOnceWith('ratDeath',.6,local?undefined:rat.body.position);
    } finally {rat.dispose();}
});
