import {PresentationEvents} from '../../src/shared/PresentationEvents';
import {WorldPresentationClock} from '../../src/shared/WorldPresentationClock';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {GameSession} from '../../src/session/GameSession';
import {TouchInput} from '../../src/session/TouchInput';
import {SimulationClock} from '../../src/session/SimulationClock';
import {RemotePlayers} from '../../src/session/RemotePlayers';
import {RatController} from '../../src/player/RatController';
import {CheeseGun} from '../../src/weapons/CheeseGun';
import {MotionFoley} from '../../src/audio/MotionFoley';
import {parseClientMessage} from '../../src/shared/messageValidation';
import type {ClientMessage, ShotDescriptor} from '../../src/shared/networkProtocol';

const canvasDocument = document;
beforeEach(() => vi.stubGlobal('document', canvasDocument));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([true, false])('keeps rendering and sends one shot per tap when randomUUID is available: %s', secure => {
    const browserCrypto = globalThis.crypto;
    // HTTP on a private IP exposes getRandomValues, but not randomUUID.
    vi.stubGlobal('crypto', secure ? browserCrypto : {getRandomValues: browserCrypto.getRandomValues.bind(browserCrypto)});
    const scene = new THREE.Scene(), world = new CANNON.World();
    const camera = new THREE.PerspectiveCamera(60, 844 / 390, .1, 600);
    const rat = new RatController(scene, world, camera, 'Phone', {}, new THREE.Vector3(0, 2, 0));
    const gun = new CheeseGun(scene, world, {} as THREE.AudioListener);
    gun.authoritative = true; gun.setPlayer(camera, rat.entity);
    const remotes = new RemotePlayers(scene, world);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    const render = vi.fn(), shots: ShotDescriptor[] = [];
    const input = new TouchInput((dx, dy) => rat.onMouseMove(dx, dy));
    // Exercise the production frame -> touch tap -> shoot -> transport path.
    // GPU, city and transport are replaced; no browser input automation.
    const session = Object.assign(Object.create(GameSession.prototype), {
        disposed: false, previousTime: 0, stats: null, remoteEvents:new PresentationEvents(),worldPresentation:new WorldPresentationClock(), bots: null, chaos: null, rat, gun, remotes,
        roundWon: false, myId: 'phone', shotsAttempted: 0, shotsSent: 0,
        lastMovementAt: 0, lastMovement: '', direction: new THREE.Vector3(), input: {keys: {}},
        stage: {scene, world, camera, renderer: {render}, flashlight: new THREE.SpotLight()},
        simulation: new SimulationClock(), city: {update() {}},
        foleyWorld: {listener() {}, motion: new MotionFoley(() => {})},
        transport: {state: 'playing', send(message: ClientMessage) {
            expect(parseClientMessage(message)).toEqual(message);
            if (message.type === 'shoot') shots.push(message);
            return true;
        }},
        touch: {active: true, input, update(now: number) { input.tick(now, () => Reflect.get(GameSession.prototype, 'shoot').call(session)); }},
    });
    try {
        frames.push(now => Reflect.get(GameSession.prototype, 'animate').call(session, now));
        for (let frame = 0; frame < 300; frame++) {
            if (frame === 120) input.start(1, 'fire', 720, 300);
            if (frame === 180) input.move(1, 745, 280);
            if (frame === 220) input.end(1);
            if (frame === 240) input.start(2, 'fire', 720, 300);
            if (frame === 250) input.end(2);
            const callback = frames.shift();
            expect(callback).toBeTypeOf('function');
            callback!(1000 + frame * 1000 / 60);
            expect(frames).toHaveLength(1);
        }
        expect(render).toHaveBeenCalledTimes(300);
        expect(shots).toHaveLength(2);
        expect(new Set(shots.map(shot => shot.shotId)).size).toBe(shots.length);
        for (const shot of shots) expect(shot.shotId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(scene.children.filter(child=>child instanceof THREE.Mesh)).toHaveLength(0);
    } finally { gun.dispose(); rat.dispose(); remotes.dispose(); }
});
