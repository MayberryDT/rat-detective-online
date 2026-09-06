import { expect, it } from 'vitest';
import { InputState } from '../../src/session/InputState';

it('clears held input when focus/lock is lost and removes listeners when disposed', () => {
    const target = new EventTarget();
    const doc = new EventTarget();
    const input = new InputState(target as Window, doc as Document);
    const key = (type: string) => Object.assign(new Event(type), { code: 'KeyW' });
    target.dispatchEvent(key('keydown'));
    expect(input.keys.KeyW).toBe(true);
    target.dispatchEvent(new Event('blur'));
    expect(input.keys.KeyW).toBeUndefined();
    target.dispatchEvent(key('keydown'));
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(input.keys.KeyW).toBeUndefined();
    input.dispose();
    target.dispatchEvent(key('keydown'));
    expect(input.keys.KeyW).toBeUndefined();
});
