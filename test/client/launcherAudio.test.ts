import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {LauncherAudio} from '../../src/audio/LauncherAudio';
import {PressureMachine} from '../../src/prototype/PressureMachine';
import {LAUNCH_MACHINES} from '../../src/shared/chaosState';
import {worldSoundGain} from '../../src/audio/worldSoundGain';

function fixture() {
    const parameter = () => ({value:0, setValueAtTime:vi.fn(), linearRampToValueAtTime:vi.fn(), exponentialRampToValueAtTime:vi.fn(), setTargetAtTime:vi.fn()});
    const node = () => ({gain:parameter(), pan:parameter(), frequency:parameter(), connect:vi.fn(), disconnect:vi.fn(), start:vi.fn(), stop:vi.fn(), onended:null as null | (() => void)});
    const nodes: ReturnType<typeof node>[] = [], gains: ReturnType<typeof node>[] = [], sources: ReturnType<typeof node>[] = [];
    const make = () => {const result=node();nodes.push(result);return result;};
    const ctx = {state:'running', currentTime:0, sampleRate:8000, destination:{},
        createBuffer:vi.fn((_channels:number,length:number) => ({getChannelData:() => new Float32Array(length)})),
        createGain:() => {const result=make();gains.push(result);return result;},
        createOscillator:make, createStereoPanner:make, createBiquadFilter:make,
        createBufferSource:() => {const result=make();sources.push(result);return result;}};
    const camera=new THREE.PerspectiveCamera();camera.position.y=.13;
    return {audio:new LauncherAudio(ctx as unknown as AudioContext),ctx,camera,nodes,gains,sources};
}
const pad={x:0,y:0,z:0,radius:4};

describe('launcher spatial audio', () => {
    it('lowers every launcher ceiling by 30% and applies the shared fade to both sound layers', () => {
        const {audio,camera,gains,nodes}=fixture();
        for (const machine of LAUNCH_MACHINES) audio.play(machine.kind,pad,camera);
        for (let i=0;i<gains.length;i+=3) {
            expect(gains[i].gain.value).toBeCloseTo(.85*.7);
            expect(gains[i+1].connect).toHaveBeenCalledWith(gains[i]);
            expect(gains[i+2].connect).toHaveBeenCalledWith(gains[i]);
        }
        camera.position.x=100;audio.play('pressure',pad,camera);
        expect(gains.at(-3)!.gain.value).toBeCloseTo(.85*.7*worldSoundGain(100,20/112));
        expect(gains.at(-3)!.gain.value/(.85*.7)).toBeLessThan(.03);
        audio.dispose();expect(nodes.every(node=>node.disconnect.mock.calls.length===1)).toBe(true);
    });

    it('allocates no voices at the cutoff, across the city, overhead, or without a live listener', () => {
        const {audio,camera,ctx,nodes}=fixture();
        for (const [x,y,z] of [[120,.13,0],[300,.13,300],[0,120.13,0],[NaN,0,0]]) {
            camera.position.set(x,y,z);audio.play('pressure',pad,camera);
        }
        audio.play('pressure',pad);
        camera.position.set(0,.13,0);ctx.state='suspended';audio.play('pressure',pad,camera);
        expect(nodes).toHaveLength(0);expect(ctx.createBuffer).not.toHaveBeenCalled();audio.dispose();
    });

    it('fades the existing air tail as a listener moves upward and uses parented world positions', () => {
        const {audio,camera,gains}=fixture();
        const parent=new THREE.Group();parent.add(camera);parent.position.x=50;
        audio.play('fan',pad,camera);
        expect(gains[0].gain.value).toBeCloseTo(.85*.7*worldSoundGain(50,70/112));
        parent.position.set(0,100,0);audio.update(camera);
        expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(.85*.7*worldSoundGain(100,20/112),8),0,.03);
        for (let i=0;i<100;i++) audio.update(camera);
        expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledTimes(1);
        parent.position.y=200;audio.update(camera);
        expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0,0,.03);audio.dispose();
    });

    it('bounds overlapping voices, reuses noise, and cleans up ended and disposed sources', () => {
        const {audio,camera,ctx,nodes,sources}=fixture();
        for (let i=0;i<13;i++) audio.play('pressure',pad,camera);
        expect(sources[0].disconnect).toHaveBeenCalledOnce();
        expect(sources.slice(1).every(source=>source.disconnect.mock.calls.length===0)).toBe(true);
        expect(ctx.createBuffer).toHaveBeenCalledOnce();
        sources[1].onended!();audio.dispose();audio.dispose();audio.play('pressure',pad,camera);
        expect(sources).toHaveLength(13);expect(nodes.every(node=>node.disconnect.mock.calls.length===1)).toBe(true);
    });

    it('routes simultaneous Pressure Surge activations through the distance fade without replay', () => {
        const {ctx,camera,sources,gains}=fixture();
        const view=new PressureMachine(new THREE.Scene(),ctx as unknown as AudioContext);
        const nearest=LAUNCH_MACHINES[0];camera.position.set(nearest.pad.x,.13,nearest.pad.z);
        view.update({serial:0,until:0,cooldowns:{},launches:[]},1000,camera);
        const cooldowns=Object.fromEntries(LAUNCH_MACHINES.map(machine=>[machine.id,1100+machine.cooldownMs]));
        const state={serial:6,until:cooldowns.pressure,cooldowns,launches:[]};
        view.update(state,1200,camera);view.update(state,1250,camera);
        const audible=LAUNCH_MACHINES.filter(machine=>Math.hypot(machine.pad.x-camera.position.x,machine.pad.z-camera.position.z)<120);
        expect(audible.length).toBeLessThan(LAUNCH_MACHINES.length);
        expect(sources).toHaveLength(audible.length);expect(gains[0].gain.value).toBeCloseTo(.85*.7);
        view.dispose();expect(sources.every(source=>source.disconnect.mock.calls.length===1)).toBe(true);
    });
});
