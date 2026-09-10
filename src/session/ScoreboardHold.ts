/** Holding Tab never changes pointer lock, focus, movement or match state. */
export function bindScoreboardHold(options: {
    available: () => boolean;
    show: (visible: boolean) => void;
    scroll: (deltaY: number, deltaX: number) => void;
    signal: AbortSignal;
    doc?: Document;
    target?: Window;
}): void {
    const doc = options.doc ?? document, target = options.target ?? window;
    const listeners = {signal: options.signal, capture: true};
    let held = false;
    const hide = () => { held = false; options.show(false); };
    doc.addEventListener('keydown', event => {
        if (event.code === 'Escape') { hide(); return; }
        if (event.code !== 'Tab' || !options.available() || event.altKey || event.ctrlKey || event.metaKey) return;
        const el = event.target as HTMLElement | null;
        if (el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '')) return;
        event.preventDefault();
        if (!event.repeat) { held = true; options.show(true); }
    }, listeners);
    doc.addEventListener('keyup', event => {
        if (event.code !== 'Tab') return;
        if (held) event.preventDefault();
        hide();
    }, listeners);
    doc.addEventListener('wheel', event => {
        if (!held || !options.available()) return;
        event.preventDefault();
        const scale = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? 400 : 1;
        options.scroll(event.shiftKey ? 0 : event.deltaY * scale, (event.deltaX + (event.shiftKey ? event.deltaY : 0)) * scale);
    }, {...listeners, passive: false});
    target.addEventListener('blur', hide, listeners);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) hide(); }, listeners);
    doc.addEventListener('pointerlockchange', () => { if (!doc.pointerLockElement) hide(); }, listeners);
    options.signal.addEventListener('abort', hide, {once: true});
}
