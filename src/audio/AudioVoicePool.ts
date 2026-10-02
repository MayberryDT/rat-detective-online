import * as THREE from 'three';
import { worldInput } from './PlayerAudioMix';

/** Reuse Three objects/gains; Web Audio buffer sources themselves are single-use. */
export class AudioVoicePool {
    private readonly idle: THREE.Audio[] = [];
    private readonly all = new Set<THREE.Audio>();
    private readonly active = new Set<THREE.Audio>();
    private readonly ended = new Map<THREE.Audio, () => void>();
    /** Where each sound's gain feeds now: the world duck (true) or the listener directly (false). */
    private readonly routed = new Map<THREE.Audio, boolean>();
    private disposed = false;
    constructor(private readonly listener: THREE.AudioListener, private readonly capacity: number) {}

    /** `world` routes the voice through the ranked mix's world duck (true) or straight to the listener (false);
     * omitted, the sound keeps whatever its owner connected it to. */
    acquire(world?: boolean): THREE.Audio | undefined {
        if (this.disposed) return;
        let sound = this.idle.pop();
        if (!sound) {
            if (this.all.size >= this.capacity) return;
            sound = new THREE.Audio(this.listener);
            this.all.add(sound);
            this.ended.set(sound, sound.onEnded.bind(sound));
        }
        this.active.add(sound);
        if (world !== undefined && this.routed.get(sound) !== world) {
            const target = world ? worldInput(this.listener) : this.listener.getInput?.();
            if (target) { sound.gain.disconnect(); sound.gain.connect(target); this.routed.set(sound, world); }
        }
        return sound;
    }

    release(sound: THREE.Audio): void {
        if (!this.active.delete(sound)) return;
        if (sound.isPlaying) sound.stop();
        sound.disconnect();
        this.idle.push(sound);
    }

    finish(sound: THREE.Audio): void {
        if (!this.active.has(sound)) return;
        this.ended.get(sound)!();
        this.release(sound);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const sound of this.active) this.release(sound);
        // THREE.Audio.disconnect() only disconnects the source, not this output.
        for (const sound of this.all) sound.gain.disconnect();
        this.idle.length = 0;
        this.all.clear();
        this.ended.clear();
        this.routed.clear();
    }
}
