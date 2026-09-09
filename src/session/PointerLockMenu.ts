/** Keep a pause/HUD menu usable after pointer lock.

Esc releases the lock and browsers still deliver the leftover click at the
cursor. Requesting lock from that click, or letting it hit a menu control, is
the cycle this stops. Resume only from the explicit play control. A leftover
click has no new pointerdown after unlock; a real menu click does. Pointerdowns
in the same instant as unlock are leftover too.
*/
export function bindPointerLockMenu(options: {
    canvas: HTMLElement;
    panel: HTMLElement;
    play: HTMLElement;
    lock: () => void;
    veil?: HTMLElement;
    doc?: Document;
    now?: () => number;
    leftoverMs?: number;
    signal?: AbortSignal;
}): { dispose(): void } {
    const doc = options.doc ?? document;
    const now = options.now ?? (() => performance.now());
    const leftoverMs = options.leftoverMs ?? 50;
    const abort = options.signal ? undefined : new AbortController();
    const listener = { capture: true as const, signal: options.signal ?? abort!.signal };
    let seenLock = false;
    let requireFreshDown = false;
    let unlockedAt = 0;

    const playing = () => doc.pointerLockElement === options.canvas;
    const swallow = (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
    };

    const sync = () => {
        const locked = playing();
        doc.body.classList.toggle('playing', locked);
        options.panel.hidden = locked;
        if (options.veil) options.veil.hidden = locked;
        if (locked) {
            seenLock = true;
            requireFreshDown = false;
            const active=doc.activeElement as {blur?:()=>void}|null; active?.blur?.();
        } else if (seenLock) {
            requireFreshDown = true;
            unlockedAt = now();
        }
    };

    const gated = (event: Event) => {
        if (playing()) {
            if (event.type === 'click' || event.type === 'auxclick' || event.type === 'contextmenu') swallow(event);
            return;
        }
        if (!requireFreshDown) return;
        if (event.type === 'pointerdown' && now() - unlockedAt >= leftoverMs) {
            requireFreshDown = false;
            return;
        }
        swallow(event);
    };

    options.play.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (requireFreshDown) return;
        options.lock();
    }, { signal: listener.signal });

    doc.addEventListener('pointerlockchange', sync, { signal: listener.signal });
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'auxclick', 'contextmenu'] as const) {
        doc.addEventListener(type, gated, listener);
    }
    sync();
    return { dispose() { abort?.abort(); } };
}
