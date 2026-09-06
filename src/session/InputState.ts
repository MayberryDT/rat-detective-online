/** Input lifetime belongs to the session, including keys released outside the window. */
export class InputState {
    readonly keys: Record<string, boolean> = {};
    private readonly controller = new AbortController();
    constructor(target: Window = window, doc: Document = document) {
        const options = { signal: this.controller.signal };
        target.addEventListener('keydown', event => { this.keys[event.code] = true; }, options);
        target.addEventListener('keyup', event => { this.keys[event.code] = false; }, options);
        target.addEventListener('blur', () => this.clear(), options);
        doc.addEventListener('visibilitychange', () => { if (doc.hidden) this.clear(); }, options);
        doc.addEventListener('pointerlockchange', () => { if (!doc.pointerLockElement) this.clear(); }, options);
    }
    clear(): void { for (const key of Object.keys(this.keys)) delete this.keys[key]; }
    dispose(): void { this.controller.abort(); this.clear(); }
}
