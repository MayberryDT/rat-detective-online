import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION, type PlayerData, type ServerMessage } from '../../src/shared/networkProtocol';
import type { ChaosState } from '../../src/shared/chaosState';
import { createAssignment } from '../../src/shared/assignments';
import {ChaosView} from '../../src/prototype/ChaosView';

const harness = vi.hoisted(() => {
    const appearance = { hatType: 'fedora' as const, hatColor: 1, furColor: 2, coatColor: 3 };

    class FakeTransport {
        state = 'idle';
        onMessage: ((message: ServerMessage) => void) | null = null;
        onState: ((state: string, message?: string) => void) | null = null;
        sent: unknown[] = [];
        connect = vi.fn(() => { this.state = 'connecting'; });
        retry = vi.fn();
        prepare = vi.fn();
        send = vi.fn((message: unknown) => { this.sent.push(message); return true; });
        destroy = vi.fn();
        constructor() { harness.transports.push(this); }
    }

    class FakeHud {
        setConnection = vi.fn();
        enterPlaying = vi.fn();
        setScores = vi.fn();
        addKillFeed = vi.fn();
        showVictory = vi.fn();
        hideVictory = vi.fn();
        showRespawn = vi.fn();
        showHitMarker = vi.fn();
        hideRespawn = vi.fn();
        dispose = vi.fn();
        constructor(_doc: Document, public onRetry?: () => void) { harness.huds.push(this); }
    }

    class FakeScoreboard {
        setAvailable = vi.fn();
        setVisible = vi.fn();
        scroll = vi.fn();
        receive = vi.fn();
        dispose = vi.fn();
        constructor() { harness.scoreboards.push(this); }
    }

    class FakeGun {
        authoritative = false;
        onHitEntity: ((victim: unknown, damage: number) => void) | null = null;
        setPlayer = vi.fn();
        setIncident = vi.fn();
        setProtectedRats = vi.fn();
        shoot = vi.fn(() => ({ shotId: 'shot-1', origin: { x: 1, y: 1.45, z: 0 }, direction: { x: 0, y: 0, z: -1 } }));
        replayShot = vi.fn();
        clearProjectiles = vi.fn();
        update = vi.fn();
        dispose = vi.fn();
        constructor() { harness.guns.push(this); }
    }

    class FakeRemotes {
        rats = new Map();
        prepareFrame = vi.fn();
        updateDeaths = vi.fn();
        presentFrame = vi.fn();
        snapshot = vi.fn();
        add = vi.fn();
        move = vi.fn();
        get = vi.fn();
        idFor = vi.fn();
        update = vi.fn();
        remove = vi.fn();
        respawn = vi.fn();
        clear = vi.fn();
        dispose = vi.fn();
        constructor() { harness.remotes.push(this); }
    }

    class FakeCity {
        generate = vi.fn();
        dispose = vi.fn();
        spec: { seed: number; version: number } | undefined;
        constructor(_scene: unknown, _world: unknown, _opts: unknown, spec?: { seed: number; version: number }) {
            this.spec = spec;
            harness.cities.push(this);
        }
    }

    class FakeRat {
        entity: {
            isPlayer: boolean;
            dead: boolean;
            hp: number;
            mesh: { position: { x: number; y: number; z: number; clone(): { x: number; y: number; z: number }; sub(): { y: number; normalize(): { multiplyScalar(): { x: number; y: number; z: number } } } } };
            body: { position: { x: number; y: number; z: number }; quaternion: { x: number; y: number; z: number; w: number } };
            applySnapshot: ReturnType<typeof vi.fn>;
            respawn: ReturnType<typeof vi.fn>;
            takeDamage: ReturnType<typeof vi.fn>;
            heal: ReturnType<typeof vi.fn>;
            setPowerups: ReturnType<typeof vi.fn>;
            useSharedCorpse: ReturnType<typeof vi.fn>;
        };
        onMouseMove = vi.fn();
        setSpeedScale = vi.fn();
        applyPressureLaunches = vi.fn();
        update = vi.fn();
        prepareMovement = vi.fn();
        syncAfterPhysics = vi.fn();
        updateView = vi.fn();
        resetGrounding = vi.fn();
        dispose = vi.fn();
        constructor(_scene: unknown, _world: unknown, _camera: unknown, _name: string, options: { hp?: number }, spawn: { x: number; y: number; z: number }) {
            const vec = () => ({
                x: spawn.x, y: spawn.y, z: spawn.z,
                clone() { return vec(); },
                sub() { return vec(); },
                normalize() { return vec(); },
                multiplyScalar() { return vec(); },
            });
            this.entity = {
                isPlayer: false,
                dead: (options?.hp ?? 3) <= 0,
                hp: options?.hp ?? 3,
                mesh: {
                    position: vec(),
                },
                body: { position: { x: spawn.x, y: spawn.y, z: spawn.z }, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
                applySnapshot: vi.fn(),
                respawn: vi.fn(),
                takeDamage: vi.fn(),
                heal: vi.fn(),
                setPowerups: vi.fn(),
                useSharedCorpse: vi.fn(),
            };
            harness.rats.push(this);
        }
    }

    const harness = {
        appearance,
        FakeTransport,
        FakeHud,
        FakeScoreboard,
        FakeGun,
        FakeRemotes,
        FakeCity,
        FakeRat,
        transports: [] as FakeTransport[],
        huds: [] as FakeHud[],
        scoreboards: [] as FakeScoreboard[],
        guns: [] as FakeGun[],
        remotes: [] as FakeRemotes[],
        cities: [] as FakeCity[],
        rats: [] as FakeRat[],
        inputs: [] as { clear: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; keys: Record<string, boolean> }[],
        music: [] as { start: ReturnType<typeof vi.fn>; unlock: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
        unlockEffects: vi.fn(),
        stages: [] as { dispose: ReturnType<typeof vi.fn>; world: { step: ReturnType<typeof vi.fn> } }[],
        stats: [] as unknown[],
        initSounds: vi.fn(),
        disposeSounds: vi.fn(),
        names: ['Inspector Whisker', 'Gumshoe Fuzz'],
        nameIndex: 0,
        reset() {
            this.transports.length = 0;
            this.huds.length = 0;
            this.scoreboards.length = 0;
            this.guns.length = 0;
            this.remotes.length = 0;
            this.cities.length = 0;
            this.rats.length = 0;
            this.inputs.length = 0;
            this.music.length = 0;
            this.stages.length = 0;
            this.stats.length = 0;
            this.nameIndex = 0;
            this.initSounds.mockClear();
            this.disposeSounds.mockClear();
            this.unlockEffects.mockClear();
        },
    };
    return harness;
});

vi.mock('../../src/network/NetworkManager', () => ({ NetworkManager: harness.FakeTransport }));
vi.mock('../../src/ui/GameHud', () => ({ GameHud: harness.FakeHud }));
vi.mock('../../src/ui/MatchScoreboard', () => ({ MatchScoreboard: harness.FakeScoreboard }));
vi.mock('../../src/weapons/CheeseGun', () => ({ CheeseGun: harness.FakeGun }));
vi.mock('../../src/session/RemotePlayers', () => ({ RemotePlayers: harness.FakeRemotes }));
vi.mock('../../src/world/CityGenerator', () => ({ CityGenerator: harness.FakeCity }));
vi.mock('../../src/prototype/Neighborhood', () => ({ Neighborhood: class extends harness.FakeCity {
    constructor(scene: unknown, world: unknown, spec: {seed:number;version:number}) { super(scene,world,undefined,spec); }
} }));
vi.mock('../../src/prototype/ChaosView', () => ({ ChaosView: class {
    setScores() {} setIncidentRoster() {} toast() {} dispose() {} apply() {} launch() {} fire() {} resetProjectiles() {} update() {} renderOutline() {}
} }));
vi.mock('../../src/player/RatController', () => ({ RatController: harness.FakeRat }));
vi.mock('../../src/session/InputState', () => ({
    InputState: class {
        keys: Record<string, boolean> = {};
        clear = vi.fn();
        dispose = vi.fn();
        constructor() { harness.inputs.push(this); }
    },
}));
vi.mock('../../src/session/SessionMusic', () => ({
    SessionMusic: class {
        start = vi.fn();
        unlock = vi.fn(async () => undefined);
        dispose = vi.fn();
        constructor() { harness.music.push(this); }
    },
}));
vi.mock('../../src/audio/effectsAudio', () => ({
    unlockEffectsAudio: () => harness.unlockEffects(),
}));
vi.mock('../../src/session/createStage', () => ({
    createStage: (renderer: { setSize?: unknown }) => {
        const stage = {
            renderer,
            scene: { children: [] },
            camera: {
                aspect: 1,
                position: { clone: () => ({ addScaledVector: () => ({ x: 0, y: 4, z: 10 }) }) },
                getWorldDirection: (target: Record<string, unknown>) => Object.assign(target, { x: 0, y: 0, z: -1 }),
                updateProjectionMatrix: vi.fn(),
            },
            listener: {context:{state:'running',resume:vi.fn(async()=>{})}},
            world: { step: vi.fn() },
            flashlight: {
                position: { set: vi.fn() },
                target: { position: { copy: () => ({ addScaledVector: vi.fn() }) } },
            },
            dispose: vi.fn(),
        };
        harness.stages.push(stage);
        return stage;
    },
}));
vi.mock('../../src/session/PerformanceStats', () => ({
    PerformanceStats: class {
        record = vi.fn();
        dispose = vi.fn();
        constructor() { harness.stats.push(this); }
    },
}));
vi.mock('../../src/entities/RatEntity', () => ({
    initEntitySounds: (...args: unknown[]) => harness.initSounds(...args),
    disposeEntitySounds: (...args: unknown[]) => harness.disposeSounds(...args),
}));
vi.mock('../../src/shared/ratAppearance', () => ({
    generateRandomAppearance: () => harness.appearance,
}));
vi.mock('../../src/shared/ratNames', () => ({
    generateRandomName: () => {
        const name = harness.names[harness.nameIndex % harness.names.length];
        harness.nameIndex += 1;
        return name;
    },
}));

import { GameSession } from '../../src/session/GameSession';

const appearance = harness.appearance;

function player(id: string, hp = 3, extra: Partial<PlayerData> = {}): PlayerData {
    return {
        id, name: id, ...appearance, x: 15, y: 2, z: 15,
        qx: 0, qy: 0, qz: 0, qw: 1, meshQx: 0, meshQy: 0, meshQz: 0, meshQw: 1,
        hp, kills: 0, deaths: 0, ...extra,
    };
}

function welcome(overrides: Partial<Extract<ServerMessage, { type: 'welcome' }>> = {}): Extract<ServerMessage, { type: 'welcome' }> {
    const local = player('me');
    const other = player('other', 1);
    return {
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        id: 'me',
        player: local,
        players: { me: local, other },
        world: { seed: 1, version: 1 },
        round: { phase: 'playing' },
        serverTime: Date.now(),
        ...overrides,
    };
}

function createDocument() {
    const listeners = new Map<string, Array<(event: Event) => void>>();
    const enterClicks: Array<(event: Event) => void> = [];
    const rerollClicks: Array<(event: Event) => void> = [];
    const enter = {
        disabled: true,
        focus: vi.fn(),
        addEventListener: (_type: string, fn: (event: Event) => void) => { enterClicks.push(fn); },
        click() {
            for (const fn of enterClicks) fn(Object.assign(new Event('click'), { stopPropagation() {} }));
        },
    };
    const reroll = {
        classList: { add: vi.fn(), remove: vi.fn() },
        offsetWidth: 40,
        addEventListener: (_type: string, fn: (event: Event) => void) => { rerollClicks.push(fn); },
        click() {
            for (const fn of rerollClicks) fn(Object.assign(new Event('click'), { stopPropagation() {} }));
        },
    };
    const namePlate = {
        textContent: '',
        offsetWidth: 280,
        classList: { add: vi.fn(), remove: vi.fn() },
    };
    const doc = {
        getElementById: (id: string) => {
            if (id === 'enter-city-btn') return enter;
            if (id === 'player-name') return namePlate;
            if (id === 'reroll-name-btn') return reroll;
            return null;
        },
        addEventListener: (type: string, fn: (event: Event) => void) => {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type)!.push(fn);
        },
        pointerLockElement: null as unknown,
        hidden: false,
        hasFocus: () => true,
        body: { appendChild() {} },
        dispatch(type: string, event: Event) {
            for (const fn of listeners.get(type) ?? []) fn(event);
        },
        pressEnter() {
            const event = { key: 'Enter', code: 'Enter', preventDefault() {} } as unknown as Event;
            this.dispatch('keydown', event);
        },
    };
    return { doc: doc as unknown as Document & { dispatch(type: string, event: Event): void; pointerLockElement: unknown; pressEnter(): void }, enter, reroll, namePlate };
}

describe('GameSession', () => {
    let frames: FrameRequestCallback[];
    let cancel: ReturnType<typeof vi.fn>;
    let fakeWindow: EventTarget & {
        location: { search: string; href: string; reload: ReturnType<typeof vi.fn> };
        innerWidth: number;
        innerHeight: number;
        addEventListener: EventTarget['addEventListener'];
        removeEventListener: EventTarget['removeEventListener'];
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
        frames = [];
        cancel = vi.fn();
        harness.reset();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
        vi.stubGlobal('cancelAnimationFrame', cancel);
        fakeWindow = Object.assign(new EventTarget(), {
            location: { search: '', href: 'http://localhost/', reload: vi.fn() },
            innerWidth: 1280,
            innerHeight: 720,
        });
        vi.stubGlobal('window', fakeWindow);
        vi.stubGlobal('location', fakeWindow.location);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    function start(initialWorld?: {seed:number;version:number}) {
        const page = createDocument();
        vi.stubGlobal('document', page.doc);
        const renderer = {
            domElement: { requestPointerLock: vi.fn(() => Promise.resolve()), tabIndex: 0 },
            setSize: vi.fn(),
            render: vi.fn(),
        };
        const session = new GameSession(renderer as never,initialWorld);
        return {
            ...page, renderer, session,
            transport: harness.transports.at(-1)!,
            hud: harness.huds.at(-1)!,
            gun: harness.guns.at(-1)!,
            remotes: harness.remotes.at(-1)!,
        };
    }

    it('uses only active incidents for shot presentation and resets it on a fresh welcome',()=>{
        const {transport,gun,session}=start();
        const state={time:1000,shots:[],dispatch:{phase:'active',incident:'bad-ammunition',started:1000,until:26000,serial:1}} as unknown as ChaosState;
        transport.onMessage?.({type:'chaos',state});expect(gun.setIncident).toHaveBeenLastCalledWith('bad-ammunition');
        state.dispatch.phase='cooldown';
        transport.onMessage?.({type:'chaos',state});expect(gun.setIncident).toHaveBeenLastCalledWith(undefined);
        state.dispatch.phase='active';state.dispatch.incident='popcorn-panic';
        transport.onMessage?.({type:'chaos',state});expect(gun.setIncident).toHaveBeenLastCalledWith('popcorn-panic');
        transport.onMessage?.(welcome());expect(gun.setIncident).toHaveBeenLastCalledWith();session.dispose();
    });

    it('shows hit confirmation only for damage credited to this player',()=>{
        const {transport,hud,session}=start(),snapshot=welcome();transport.onMessage?.(snapshot);
        transport.onMessage?.({type:'playerDamaged',id:'other',hp:2,attackerId:snapshot.id});
        expect(hud.showHitMarker).toHaveBeenCalledTimes(1);
        transport.onMessage?.({type:'playerDamaged',id:snapshot.id,hp:2,attackerId:'other'});
        transport.onMessage?.({type:'playerDamaged',id:'other',hp:1,attackerId:'third'});
        expect(hud.showHitMarker).toHaveBeenCalledTimes(1);session.dispose();
    });

    it('starts title music before joining and retries permission on mouse, touch and keyboard gestures', () => {
        const {doc,session,transport}=start(),music=harness.music.at(-1)!;
        expect(music.start).toHaveBeenCalledTimes(1);
        for (const type of ['pointerdown','pointerup','click','keydown']) {
            music.unlock.mockClear();
            doc.dispatch(type, Object.assign(new Event(type), {button:0,key:'Tab',code:'Tab'}));
            expect(music.unlock).toHaveBeenCalled();
            expect(harness.unlockEffects).toHaveBeenCalled();
            harness.unlockEffects.mockClear();
        }
        expect(transport.connect).not.toHaveBeenCalled();
        session.dispose();
    });

    it('joins from the title screen and applies a complete welcome snapshot before gameplay', () => {
        const { enter, namePlate, transport, hud, remotes, gun } = start();
        expect(harness.stats).toHaveLength(0);
        expect(namePlate.textContent).toBe('Inspector Whisker');
        enter.click();
        expect(enter.disabled).toBe(false);
        expect(transport.connect).toHaveBeenCalledWith('Inspector Whisker', appearance);
        expect(harness.music.at(-1)!.unlock).toHaveBeenCalled();
        transport.onState?.('connecting');
        expect(hud.setConnection).toHaveBeenCalledWith('connecting', undefined);
        expect(hud.enterPlaying).not.toHaveBeenCalled();
        const snapshot = welcome();
        transport.onMessage?.(snapshot);
        transport.onState?.('playing');
        expect(harness.scoreboards[0].receive).toHaveBeenCalledWith(snapshot);
        expect(harness.scoreboards[0].setAvailable).toHaveBeenLastCalledWith(true);
        expect(harness.rats).toHaveLength(1);
        expect(harness.rats[0].entity.isPlayer).toBe(true);
        expect(harness.rats[0].entity.applySnapshot).toHaveBeenCalledWith(snapshot.player);
        expect(gun.setPlayer).toHaveBeenCalled();
        expect(gun.clearProjectiles).toHaveBeenCalled();
        expect(remotes.clear).toHaveBeenCalled();
        expect(remotes.snapshot).toHaveBeenCalledWith(snapshot.players, 'me');
        expect(hud.hideRespawn).toHaveBeenCalled();
        expect(hud.hideVictory).toHaveBeenCalled();
        expect(hud.enterPlaying).toHaveBeenCalled();
        expect(harness.music.at(-1)!.start).toHaveBeenCalledTimes(1);
        expect(harness.inputs.at(-1)!.clear).toHaveBeenCalled();
    });

    it('reuses the prepared city on entry and still rebuilds for a different assigned room', () => {
        const spec={seed:341283204,version:2};
        const {session,enter,transport}=start(spec);
        const prepared=harness.cities[0];
        expect(prepared.spec).toEqual(spec);
        expect(prepared.generate).toHaveBeenCalledOnce();
        expect(harness.rats).toHaveLength(0);
        expect(transport.connect).not.toHaveBeenCalled();
        enter.click();
        transport.onMessage?.({...welcome(),world:spec});
        expect(harness.cities).toHaveLength(1);
        expect(prepared.dispose).not.toHaveBeenCalled();
        transport.onMessage?.({...welcome(),world:{seed:42,version:2}});
        expect(prepared.dispose).toHaveBeenCalledOnce();
        expect(harness.cities).toHaveLength(2);
        expect(harness.cities[1].spec).toEqual({seed:42,version:2});
        session.dispose();
    });

    it('joins from the title screen when Enter is pressed', () => {
        const { doc, transport } = start();
        doc.pressEnter();
        expect(transport.connect).toHaveBeenCalledWith('Inspector Whisker', appearance);
        doc.pressEnter();
        expect(transport.connect).toHaveBeenCalledTimes(1);
    });

    it('rolls another assigned name from the bank', () => {
        const { reroll, namePlate, enter, transport } = start();
        expect(namePlate.textContent).toBe('Inspector Whisker');
        reroll.click();
        expect(transport.connect).toHaveBeenCalledTimes(0);
        vi.advanceTimersByTime(600);
        expect(namePlate.textContent).toBe('Gumshoe Fuzz');
        enter.click();
        expect(transport.connect).toHaveBeenCalledWith('Gumshoe Fuzz', appearance);
    });

    it('focuses Enter City on the title screen', () => {
        const { enter, renderer, transport } = start();
        expect(enter.focus).toHaveBeenCalled();
        expect(renderer.domElement.tabIndex).toBe(-1);

        enter.focus.mockClear();
        fakeWindow.dispatchEvent(new Event('focus'));
        expect(enter.focus).toHaveBeenCalled();

        transport.state = 'playing';
        enter.focus.mockClear();
        fakeWindow.dispatchEvent(new Event('focus'));
        expect(enter.focus).not.toHaveBeenCalled();
    });

    it('rebuilds identity and world on reconnect and uses server deadlines for late-join overlays', () => {
        const { transport, hud, remotes, gun } = start();
        transport.onMessage?.(welcome());
        const firstRat = harness.rats[0];
        const firstCity = harness.cities[0];
        const dead = player('me', 0, { respawnAt: Date.now() + 4_000, name: '<Rat & Co>' });
        const injured = player('other', 1);
        transport.onMessage?.(welcome({
            player: dead,
            players: { me: dead, other: injured },
            world: { seed: 99, version: 1 },
            round: { phase: 'won', winnerName: '<Rat & Co>', kills: 20 },
            serverTime: Date.now() + 1_000,
        }));
        expect(gun.clearProjectiles).toHaveBeenCalledTimes(2);
        expect(remotes.clear).toHaveBeenCalledTimes(2);
        expect(firstRat.dispose).toHaveBeenCalledTimes(1);
        expect(firstCity.dispose).toHaveBeenCalledTimes(1);
        expect(harness.cities).toHaveLength(2);
        expect(harness.cities[1].spec).toEqual({ seed: 99, version: 1 });
        expect(harness.cities[1].generate).toHaveBeenCalled();
        expect(harness.rats).toHaveLength(2);
        expect(hud.showRespawn).toHaveBeenCalledWith(Date.now() + 3_000);
        expect(hud.showVictory).toHaveBeenCalledWith('<Rat & Co>', 20, undefined);
        transport.onMessage?.({ type: 'currentPlayers', players: { me: dead } });
        expect(harness.rats).toHaveLength(2);
    });

    it('presents the objective result on both a finish and a late join while hiding respawn',()=>{
        const {transport,hud}=start();transport.onMessage?.(welcome());
        const assignment=createAssignment('excessive-force',0);assignment.phase='closed';
        assignment.result={winnerId:'me',winnerName:'Inspector Brie',at:Date.now(),method:'kills',posthumous:false};
        const result={winnerId:'me',winnerName:'Inspector Brie',kills:0,resetAt:Date.now()+6000,assignment};
        transport.onMessage?.({type:'gameWon',...result});
        expect(hud.showVictory).toHaveBeenLastCalledWith(result.winnerName,0,assignment);
        expect(hud.hideRespawn).toHaveBeenCalled();
        transport.onMessage?.(welcome({round:{phase:'won',...result}}));
        expect(hud.showVictory).toHaveBeenLastCalledWith(result.winnerName,0,assignment);
    });
    it('routes death, respawn, victory, reset, and notice errors through the HUD', () => {
        const { transport, hud, remotes } = start();
        const local = player('me');
        transport.onMessage?.(welcome({ player: local, players: { me: local } }));
        const rat = harness.rats[0];
        remotes.get.mockImplementation((id: string) => id === 'other'
            ? { mesh: rat.entity.mesh, dead: false, hp: 3, takeDamage: vi.fn() }
            : undefined);
        transport.onMessage?.({
            type: 'playerDied', victimId: 'me', killerId: 'other', killerName: 'other',
            victimName: '<Rat & Co>', respawnAt: Date.now() + 5_000,
        });
        expect(rat.entity.takeDamage).toHaveBeenCalled();
        expect(hud.showRespawn).toHaveBeenCalledWith(Date.now() + 5_000);
        expect(hud.addKillFeed).toHaveBeenCalledWith('other eliminated <Rat & Co>');
        transport.onMessage?.({ type: 'playerRespawn', id: 'me', x: 20, y: 2, z: -10, hp: 3 });
        expect(rat.entity.respawn).toHaveBeenCalledWith({ type: 'playerRespawn', id: 'me', x: 20, y: 2, z: -10, hp: 3 });
        expect(hud.hideRespawn).toHaveBeenCalled();
        expect(harness.inputs.at(-1)!.clear).toHaveBeenCalled();
        transport.onMessage?.({ type: 'gameWon', winnerId: 'me', winnerName: '<Rat & Co>', kills: 20, resetAt: Date.now() + 6_000 });
        expect(hud.showVictory).toHaveBeenCalledWith('<Rat & Co>', 20, undefined);
        transport.onMessage?.({ type: 'gameReset', round: { phase: 'playing' } });
        expect(hud.hideVictory).toHaveBeenCalled();
        expect(hud.hideRespawn).toHaveBeenCalled();
        expect(harness.guns.at(-1)!.clearProjectiles).toHaveBeenCalled();
        transport.onMessage?.({ type: 'error', message: 'Room is full.' });
        expect(hud.setConnection).toHaveBeenCalledWith('notice', 'Room is full.');
    });

    it('uses a named case joke for an environmental death without looking up a killer',()=>{
        const {transport,hud,remotes}=start();transport.onMessage?.(welcome());
        remotes.get.mockClear();
        transport.onMessage?.({type:'playerDied',victimId:'me',killerId:null,killerName:null,
            cause:'evidence-tampering',victimName:'Captain Crawley',respawnAt:Date.now()+3000,
            incoming:{x:145,y:0,z:0},incident:true});
        expect(hud.addKillFeed).toHaveBeenCalledWith(expect.stringContaining('Captain Crawley'));
        expect(hud.addKillFeed.mock.calls.at(-1)![0]).not.toContain('eliminated');
        expect(remotes.get).not.toHaveBeenCalledWith(null);
        expect(hud.showRespawn).toHaveBeenCalledWith(Date.now()+3000);
    });

    it('shows both buffs but reflects predicted shots only for Ironclad, clearing stale effects',()=>{
        const {transport,gun,session}=start();transport.onMessage?.(welcome());
        const rat=harness.rats.at(-1)!.entity;
        const state={time:1000,shots:[],dispatch:{phase:'ready',started:0,until:0,serial:0},buffs:{me:{hustleUntil:11000}}} as unknown as ChaosState;
        transport.onMessage?.({type:'chaos',state});
        expect(rat.setPowerups).toHaveBeenLastCalledWith(0,10);
        expect(gun.setProtectedRats.mock.calls.at(-1)?.[0]).toEqual(new Set());
        state.buffs!.me.ironcladUntil=13000;transport.onMessage?.({type:'chaos',state});
        expect(gun.setProtectedRats.mock.calls.at(-1)?.[0]).toEqual(new Set([rat]));
        state.buffs={};transport.onMessage?.({type:'chaos',state});
        expect(rat.setPowerups).toHaveBeenLastCalledWith(0,0);
        expect(gun.setProtectedRats.mock.calls.at(-1)?.[0]).toEqual(new Set());session.dispose();
    });

    it('uses births only for the firing player and never replays their gun animation or sound',()=>{
        const launched=vi.spyOn(ChaosView.prototype,'launch');
        const {transport,gun,session}=start({seed:1,version:2});
        const joined=welcome({world:{seed:1,version:2}});transport.onMessage?.(joined);
        const shot:Extract<ServerMessage,{type:'playerShot'}>={type:'playerShot',shooterId:joined.id,shotId:'own',
            origin:{x:0,y:2,z:0},direction:{x:1,y:0,z:0},launch:{at:1000,balls:[{id:'own',velocity:{x:175,y:0,z:0}}]}};
        transport.onMessage?.(shot);expect(launched).toHaveBeenCalledExactlyOnceWith(shot);
        expect(gun.replayShot).not.toHaveBeenCalled();
        transport.onMessage?.({...shot,shooterId:'other'});
        expect(launched).toHaveBeenCalledTimes(1);
        session.dispose();launched.mockRestore();
    });

    it('starts a single local ball only when the authoritative shot was sent',()=>{
        const {transport,doc,renderer,session}=start();const joined=welcome();joined.world.version=2;
        transport.onMessage?.(joined);transport.state='playing';doc.pointerLockElement=renderer.domElement as unknown as Element;
        const fire=vi.spyOn(ChaosView.prototype,'fire');
        doc.dispatch('mousedown',Object.assign(new Event('mousedown'),{button:0}));expect(fire).toHaveBeenCalledOnce();
        transport.send.mockReturnValueOnce(false);
        doc.dispatch('mousedown',Object.assign(new Event('mousedown'),{button:0}));expect(fire).toHaveBeenCalledOnce();
        session.dispose();
    });
    it('sends the resolved shot and remote hit, then can start a fresh session after dispose', () => {
        const first = start();
        const { doc, renderer, session, transport, gun, remotes } = first;
        transport.onMessage?.(welcome({movementSeq:40}));
        transport.state = 'playing';
        doc.pointerLockElement = renderer.domElement as unknown as Element;
        doc.dispatch('mousedown', Object.assign(new Event('mousedown'), { button: 0 }));
        expect(gun.shoot).toHaveBeenCalled();
        expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({
            type: 'shoot', shotId: 'shot-1', origin: { x: 1, y: 1.45, z: 0 }, direction: { x: 0, y: 0, z: -1 },
            movement: expect.objectContaining({seq:41,position:{x:15,y:2,z:15}}),
        }));
        gun.authoritative=true;
        doc.dispatch('mousedown', Object.assign(new Event('mousedown'), { button: 0 }));
        expect(transport.send.mock.calls.filter(([message])=>(message as {type:string}).type==='shoot')).toHaveLength(2);
        transport.send.mockReturnValueOnce(false);
        doc.dispatch('mousedown', Object.assign(new Event('mousedown'), { button: 0 }));
        expect(transport.send.mock.calls.filter(([message])=>(message as {type:string}).type==='shoot')).toHaveLength(3);
        remotes.idFor.mockReturnValue('other');
        gun.onHitEntity?.({} as never, 3);
        expect(transport.send).toHaveBeenCalledWith({ type: 'hit', victimId: 'other', damage: 3 });
        const remote = { mesh: { position: { clone() { return this; }, sub() { return this; } } } };
        remotes.get.mockReturnValue(remote);
        transport.onMessage?.({
            type: 'playerShot', shooterId: 'other', shotId: 'shot-2',
            origin: { x: 0, y: 1.45, z: 0 }, direction: { x: 1, y: 0, z: 0 },
        });
        expect(gun.replayShot).toHaveBeenCalledWith(remote, expect.objectContaining({ type: 'playerShot', shotId: 'shot-2' }));
        const city = harness.cities[0];
        const rat = harness.rats[0];
        session.dispose();
        session.dispose();
        expect(cancel).toHaveBeenCalled();
        expect(transport.destroy).toHaveBeenCalledTimes(1);
        expect(harness.huds[0].dispose).toHaveBeenCalledTimes(1);
        expect(harness.scoreboards[0].dispose).toHaveBeenCalledTimes(1);
        expect(gun.dispose).toHaveBeenCalledTimes(1);
        expect(rat.dispose).toHaveBeenCalledTimes(1);
        expect(remotes.dispose).toHaveBeenCalledTimes(1);
        expect(city.dispose).toHaveBeenCalledTimes(1);
        expect(harness.music[0].dispose).toHaveBeenCalledTimes(1);
        expect(harness.inputs[0].dispose).toHaveBeenCalledTimes(1);
        expect(harness.disposeSounds).toHaveBeenCalledTimes(1);
        expect(harness.stages[0].dispose).toHaveBeenCalledTimes(1);
        const pending = frames.length;
        frames.at(-1)?.(16);
        expect(frames.length).toBe(pending);

        const second = start();
        expect(harness.transports).toHaveLength(2);
        expect(harness.huds).toHaveLength(2);
        expect(harness.cities).toHaveLength(2);
        expect(harness.stats).toHaveLength(0);
        second.enter.click();
        expect(second.transport.connect).toHaveBeenCalledWith(second.namePlate.textContent, appearance);
        second.session.dispose();
    });
});
