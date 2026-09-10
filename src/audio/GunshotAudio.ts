import * as THREE from 'three';
import type { Vec3Data } from '../shared/networkProtocol';
import { AudioVoicePool } from './AudioVoicePool';
import { worldSoundGain as gunshotGain } from './worldSoundGain';
export { worldSoundGain as gunshotGain } from './worldSoundGain';

const MAX_VOICES = 12;
export const GUNSHOT_VOLUME = .3;

type Voice = { sound: THREE.Audio; priority: number };
/** Independent, bounded voices keep distant AI from cutting off your own pistol. */
export class GunshotAudio {
    private buffer?: AudioBuffer;
    private readonly pool: AudioVoicePool;
    private readonly voices = new Set<Voice>();
    private readonly ear = new THREE.Vector3();
    private disposed = false;
    constructor(private readonly listener: THREE.AudioListener) {
        this.pool = new AudioVoicePool(listener, MAX_VOICES);
        const loader = new THREE.AudioLoader();
        loader.load('/sounds/gunshot.mp3', buffer => { if (!this.disposed) this.buffer = buffer; }, undefined,
            () => { if (!this.disposed) console.warn('Gunshot sound could not load'); });
    }
    play(origin: Vec3Data, local: boolean, cue: 'normal' | 'malfunction'): void {
        const buffer = this.buffer;
        if (this.disposed || !buffer || this.listener.context.state !== 'running') return;
        this.listener.getWorldPosition(this.ear);
        const gain = local ? 1 : gunshotGain(Math.hypot(origin.x-this.ear.x, origin.y-this.ear.y, origin.z-this.ear.z));
        if (gain < .001) return;
        const priority = local ? 2 : gain;
        if (this.voices.size >= MAX_VOICES) {
            let quietest = this.voices.values().next().value!;
            for (const voice of this.voices) if (voice.priority < quietest.priority) quietest = voice;
            if (quietest.priority > priority) return;
            this.release(quietest);
        }
        // Match the local gun's global playback, including when firing behind you.
        const sound = this.pool.acquire();
        if (!sound) return;
        sound.setBuffer(buffer);
        sound.setVolume(GUNSHOT_VOLUME * gain);
        sound.setPlaybackRate(cue === 'malfunction' ? 1.45 : 1);
        const voice = {sound, priority};
        sound.onEnded = () => { this.pool.finish(sound); this.voices.delete(voice); };
        this.voices.add(voice);
        try { sound.play(); }
        catch { this.release(voice); }
    }
    private release(voice: Voice): void {
        if (!this.voices.delete(voice)) return;
        this.pool.release(voice.sound);
    }
    dispose(): void {
        this.disposed = true;
        for (const voice of this.voices) this.release(voice);
        this.pool.dispose();
        this.buffer = undefined;
    }
}
