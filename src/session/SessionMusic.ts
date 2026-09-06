import * as THREE from 'three';

export class SessionMusic {
    private readonly sound: THREE.Audio;
    private active = false;
    private disposed = false;
    constructor(private readonly listener: THREE.AudioListener) {
        this.sound = new THREE.Audio(listener);
        new THREE.AudioLoader().load('/music/main-theme.mp3', buffer => {
            if (this.disposed) return;
            this.sound.setBuffer(buffer).setLoop(true).setVolume(0.4);
            void this.play();
        }, undefined, () => console.warn('Background music could not be loaded.'));
    }
    async unlock(): Promise<void> {
        try {
            if (this.listener.context.state === 'suspended') await this.listener.context.resume();
            await this.play();
        } catch { /* A later user gesture can retry audio permission. */ }
    }
    start(): void { this.active = true; void this.unlock(); }
    private async play(): Promise<void> {
        if (this.disposed || !this.active || !this.sound.buffer || this.sound.isPlaying) return;
        if (this.listener.context.state !== 'running') return;
        this.sound.play();
    }
    dispose(): void {
        this.disposed = true;
        this.active = false;
        if (this.sound.isPlaying) this.sound.stop();
        this.sound.disconnect();
    }
}
