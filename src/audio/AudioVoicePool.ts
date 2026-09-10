import * as THREE from 'three';

/** Reuse Three objects/gains; Web Audio buffer sources themselves are single-use. */
export class AudioVoicePool {
    private readonly idle: THREE.Audio[] = [];
    private readonly all = new Set<THREE.Audio>();
    private readonly active = new Set<THREE.Audio>();
    private readonly ended = new Map<THREE.Audio, () => void>();
    private disposed = false;
    constructor(private readonly listener: THREE.AudioListener, private readonly capacity: number) {}

    acquire(): THREE.Audio | undefined {
        if (this.disposed) return;
        let sound = this.idle.pop();
        if (!sound) {
            if (this.all.size >= this.capacity) return;
            sound = new THREE.Audio(this.listener);
            this.all.add(sound);
            this.ended.set(sound, sound.onEnded.bind(sound));
        }
        this.active.add(sound);
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
    }
}
