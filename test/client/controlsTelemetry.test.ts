import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {GameSession} from '../../src/session/GameSession';
import {SimulationClock} from '../../src/session/SimulationClock';
import {RatController} from '../../src/player/RatController';
import {RemotePlayers} from '../../src/session/RemotePlayers';
import {CheeseGun} from '../../src/weapons/CheeseGun';
import {MotionFoley} from '../../src/audio/MotionFoley';
import {parseClientMessage} from '../../src/shared/messageValidation';
import type {ClientMessage, MovementInput} from '../../src/shared/networkProtocol';
import {FeelDirector} from '../../src/feel/FeelDirector';
import {FeelState} from '../../src/feel/feelState';

const canvasDocument = document;
beforeEach(() => vi.stubGlobal('document', canvasDocument));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// The player's controls ride their movement sends for the city map. Ways it could go wrong: a key tap or jump
// between two sends (sends are at most 20 a second, a 60 Hz step is 17 ms) never reaches the server; a rat that
// stands still while only its keys change sends nothing until the one-second keepalive; counts sent twice.
it('sends taps shorter than one send, at once, even while the rat holds still', () => {
    const scene = new THREE.Scene(), world = new CANNON.World();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 600);
    const rat = new RatController(scene, world, camera, 'Keys', {}, new THREE.Vector3(0, 2, 0));
    // Pinned in place, so only the controls can change between sends.
    rat.entity.body.type = CANNON.Body.STATIC;
    const frames: FrameRequestCallback[] = [], sent: MovementInput[] = [], keys: Record<string, boolean> = {};
    const gun = new CheeseGun(scene, world, {} as THREE.AudioListener), remotes = new RemotePlayers(scene, world);
    gun.authoritative = true; gun.setPlayer(camera, rat.entity);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    const session = Object.assign(Object.create(GameSession.prototype), {
        disposed: false, previousTime: 0, stats: null, bots: null, chaos: null, rat, gun, remotes,
        title: {}, roundWon: false, myId: 'keys', lastMovementAt: 0, lastMovement: [], direction: new THREE.Vector3(), aim: new THREE.Vector3(), input: {keys},
        stage: {syncViewport: () => false, scene, world, camera, renderer: {render() {}}, flashlight: new THREE.SpotLight()},
        simulation: new SimulationClock(), city: {update() {}}, perf: {frame() {}},
        foleyWorld: {listener() {}, motion: new MotionFoley(() => {})},
        feel: new FeelDirector(new FeelState('on'), undefined),
        transport: {state: 'playing', send(message: ClientMessage) {
            expect(parseClientMessage(message)).toEqual(message);
            if (message.type === 'updateMovement') sent.push(message);
            return true;
        }},
    });
    const run = (from: number, to: number, press?: (frame: number) => void) => {
        for (let frame = from; frame < to; frame++) {
            for (const key of Object.keys(keys)) delete keys[key];
            press?.(frame);
            frames.shift()!(1000 + frame * 1000 / 60);
        }
    };
    try {
        frames.push(now => Reflect.get(GameSession.prototype, 'animate').call(session, now));
        // Settle: the model turns toward the look, then nothing changes until the one-second keepalive (frame 60).
        run(0, 30);
        const settled = sent.length;
        run(30, 58);
        expect(sent.length).toBe(settled);
        run(58, 66);
        const before = sent.length;
        // A one-step D tap and, later, a one-step jump: each sent within a send's spacing (50 ms, 3 frames).
        run(66, 70, frame => { if (frame === 66) keys.KeyD = true; });
        expect(sent.length).toBeGreaterThan(before);
        run(70, 100, frame => { if (frame === 76) keys.Space = true; });
        const after = sent.slice(before);
        expect(after.reduce((n, m) => n + (m.controls?.rx ?? 0), 0)).toBe(2);
        expect(after.reduce((n, m) => n + (m.controls?.j ?? 0), 0)).toBe(1);
        expect(after.reduce((n, m) => n + (m.controls?.fx ?? 0), 0)).toBe(0);
        // Sent counts are not sent again.
        const quiet = sent.length;
        run(100, 130);
        expect(sent.length).toBe(quiet);
    } finally { gun.dispose(); rat.dispose(); remotes.dispose(); }
});
