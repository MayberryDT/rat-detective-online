import {expect, it, vi} from 'vitest';
import {bindScoreboardHold} from '../../src/session/ScoreboardHold';

function fixture() {
    const doc = Object.assign(new EventTarget(), {hidden: false, pointerLockElement: {}});
    const target = new EventTarget(), controller = new AbortController(), show = vi.fn(), scroll = vi.fn();
    let available = true;
    bindScoreboardHold({doc: doc as unknown as Document, target: target as Window, signal: controller.signal,
        available: () => available, show, scroll});
    const key = (type: string, extra = {}) => {
        const e = Object.assign(new Event(type, {cancelable: true}), {code: 'Tab', repeat: false, ...extra});
        doc.dispatchEvent(e); return e;
    };
    return {doc, target, controller, show, scroll, key, unavailable: () => { available = false; }};
}
it('shows only during a held Tab, prevents browser focus traversal and does not toggle on repeat', () => {
    const f = fixture();
    expect(f.key('keydown').defaultPrevented).toBe(true); expect(f.show).toHaveBeenLastCalledWith(true);
    f.key('keydown', {repeat: true}); expect(f.show).toHaveBeenCalledTimes(1);
    expect(f.key('keyup').defaultPrevented).toBe(true); expect(f.show).toHaveBeenLastCalledWith(false);
    f.key('keydown'); expect(f.show).toHaveBeenLastCalledWith(true);
    f.controller.abort(); expect(f.show).toHaveBeenLastCalledWith(false);
    f.show.mockClear(); f.key('keydown'); expect(f.show).not.toHaveBeenCalled();
});
it('clears on blur, hidden document, pointer unlock and Escape; repeat cannot reopen after loss', () => {
    const f = fixture();
    for (const clear of [() => f.target.dispatchEvent(new Event('blur')),
        () => {f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange'));},
        () => {f.doc.pointerLockElement = null as unknown as object; f.doc.dispatchEvent(new Event('pointerlockchange'));},
        () => f.key('keydown', {code: 'Escape'})]) {
        f.key('keydown'); clear(); expect(f.show).toHaveBeenLastCalledWith(false);
        f.key('keydown', {repeat: true}); expect(f.show).toHaveBeenLastCalledWith(false);
    }
    f.controller.abort();
});
it('preserves title/modifier shortcuts and scrolls a long roster only while held', () => {
    const f = fixture();
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) expect(f.key('keydown', {[modifier]: true}).defaultPrevented).toBe(false);
    expect(f.show).not.toHaveBeenCalled();
    f.key('keydown');
    const wheel = () => Object.assign(new Event('wheel', {cancelable: true}), {deltaY: 3, deltaX: 0, deltaMode: 1});
    const held = wheel(); f.doc.dispatchEvent(held); expect(held.defaultPrevented).toBe(true); expect(f.scroll).toHaveBeenCalledWith(72, 0);
    f.doc.dispatchEvent(Object.assign(wheel(), {shiftKey: true})); expect(f.scroll).toHaveBeenLastCalledWith(0, 72);
    f.key('keyup'); f.doc.dispatchEvent(wheel()); expect(f.scroll).toHaveBeenCalledTimes(2);
    f.unavailable(); expect(f.key('keydown').defaultPrevented).toBe(false); f.controller.abort();
});
