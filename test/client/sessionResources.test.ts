import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { AudioContext as ThreeAudioContext } from 'three';
import { GameSession } from '../../src/session/GameSession';
import { CityGenerator } from '../../src/world/CityGenerator';
import { CheeseGun } from '../../src/weapons/CheeseGun';
import { RatController } from '../../src/player/RatController';
import { RemotePlayers } from '../../src/session/RemotePlayers';
import { PROTOCOL_VERSION, type PlayerData, type ServerMessage } from '../../src/shared/networkProtocol';
import { WORLD_LAYOUT_VERSION } from '../../src/shared/worldSpec';

type SessionPrivate = {
    stage: { scene: THREE.Scene; world: CANNON.World; renderer: { dispose: () => void; render: () => void; domElement: FakeNode } };
    city: CityGenerator;
    rat: RatController | null;
    remotes: RemotePlayers;
    gun: CheeseGun;
    events: AbortController;
    frame: number;
    disposed: boolean;
};

type CityPrivate = {
    geometries: Set<THREE.BufferGeometry>;
    materials: Set<THREE.Material>;
    textures: Set<THREE.Texture>;
    objects: THREE.Object3D[];
    bodies: CANNON.Body[];
};

type GunPrivate = {
    balls: { mesh: THREE.Mesh }[];
    ballGeometry: THREE.BufferGeometry;
    ballMaterial: THREE.Material;
    disposed: boolean;
};

const appearance = { hatType: 'fedora' as const, hatColor: 1, furColor: 2, coatColor: 3 };

class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 48_000;
    destination = { connect() { return this; }, disconnect() {} };
    resume = async () => { this.state = 'running'; };
    close = async () => { this.state = 'closed'; };
    createGain() {
        const node = {
            gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} },
            connect() { return node; },
            disconnect() {},
        };
        return node;
    }
}

class FakeSocket extends EventTarget {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    bufferedAmount = 0;
    sent: string[] = [];
    constructor(_url: string) {
        super();
        sockets.push(this);
    }
    send(message: string) { this.sent.push(message); }
    close() {
        this.readyState = FakeSocket.CLOSED;
        this.dispatchEvent(new Event('close'));
    }
    open() {
        this.readyState = FakeSocket.OPEN;
        this.dispatchEvent(new Event('open'));
    }
    receive(value: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }));
    }
}

const sockets: FakeSocket[] = [];

class FakeNode extends EventTarget {
    tagName: string;
    className = '';
    textContent = '';
    type = '';
    disabled = false;
    value = '';
    width = 0;
    height = 0;
    parent: FakeNode | null = null;
    children: FakeNode[] = [];
    style: Record<string, string> = {};
    private classes = new Set<string>();
    readonly classList = {
        add: (name: string) => {
            this.classes.add(name);
            this.className = [...this.classes].join(' ');
        },
        remove: (name: string) => {
            this.classes.delete(name);
            this.className = [...this.classes].join(' ');
        },
        contains: (name: string) => this.classes.has(name),
    };

    constructor(tag: string, private readonly registry: Map<string, FakeNode>) {
        super();
        this.tagName = tag.toUpperCase();
        if (tag.toLowerCase() === 'button') this.type = 'button';
    }

    private _id = '';
    get id() { return this._id; }
    set id(value: string) {
        if (this._id) this.registry.delete(this._id);
        this._id = value;
        if (value) this.registry.set(value, this);
    }

    get firstChild() { return this.children[0] ?? null; }

    appendChild(child: FakeNode) {
        child.parent = this;
        this.children.push(child);
        if (child.id) this.registry.set(child.id, child);
        return child;
    }

    remove() {
        const parent = this.parent;
        if (!parent) return;
        parent.children = parent.children.filter(child => child !== this);
        this.parent = null;
        if (this._id) this.registry.delete(this._id);
    }

    setAttribute(name: string, value: string) {
        if (name === 'id') this.id = value;
    }

    getContext() {
        return {
            clearRect() {},
            strokeText() {},
            fillText() {},
            fillRect() {},
            font: '',
            fillStyle: '',
            textAlign: '',
            shadowColor: '',
            shadowBlur: 0,
            lineWidth: 0,
        };
    }

    requestPointerLock() { return Promise.resolve(); }
    focus(_options?: { preventScroll?: boolean }) {}
    select() {}
    tabIndex = 0;
}

class FakeWindow extends EventTarget {
    innerWidth = 1280;
    innerHeight = 720;
    devicePixelRatio = 1;
    location = { search: '', href: 'http://localhost/', reload() {} };
}

function trackListeners(target: EventTarget) {
    const active = new Set<EventListenerOrEventListenerObject>();
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) => {
        if (listener) {
            active.add(listener);
            const signal = typeof options === 'object' ? options.signal : undefined;
            signal?.addEventListener('abort', () => active.delete(listener));
        }
        add(type, listener, options);
    };
    target.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) => {
        if (listener) active.delete(listener);
        remove(type, listener, options);
    };
    return active;
}

function createPage() {
    const registry = new Map<string, FakeNode>();
    const body = new FakeNode('body', registry);
    const head = new FakeNode('head', registry);
    const add = (id: string, tag = 'div', parent = body) => {
        const node = new FakeNode(tag, registry);
        node.id = id;
        parent.appendChild(node);
        return node;
    };
    add('title-screen');
    add('scoreboard').style.display = 'none';
    add('scoreboard-list', 'ul');
    add('kill-feed');
    add('victory-overlay').style.display = 'none';
    add('victory-text');
    add('respawn-overlay').style.display = 'none';
    add('respawn-timer').textContent = '5';
    const enter = add('enter-city-btn', 'button');
    enter.disabled = true;
    add('player-name');
    add('reroll-name-btn', 'button');

    const doc = new EventTarget() as EventTarget & {
        hidden: boolean;
        hasFocus(): boolean;
        pointerLockElement: FakeNode | null;
        body: FakeNode;
        head: FakeNode;
        createElement(tag: string): FakeNode;
        getElementById(id: string): FakeNode | null;
    };
    doc.hidden = false;
    doc.hasFocus = () => true;
    doc.pointerLockElement = null;
    doc.body = body;
    doc.head = head;
    doc.createElement = (tag: string) => new FakeNode(tag, registry);
    doc.getElementById = (id: string) => registry.get(id) ?? null;
    return { doc, enter, registry };
}

function player(id: string, hp = 3, extra: Partial<PlayerData> = {}): PlayerData {
    return {
        id, name: id, ...appearance, x: 15, y: 2, z: 15,
        qx: 0, qy: 0, qz: 0, qw: 1, meshQx: 0, meshQy: 0, meshQz: 0, meshQw: 1,
        hp, kills: 0, deaths: 0, ...extra,
    };
}

function welcome(overrides: Partial<Extract<ServerMessage, { type: 'welcome' }>> = {}): Extract<ServerMessage, { type: 'welcome' }> {
    const local = overrides.player ?? player('me');
    const other = player('other');
    return {
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        id: 'me',
        player: local,
        players: { me: local, other },
        world: { seed: 1, version: WORLD_LAYOUT_VERSION },
        round: { phase: 'playing' },
        serverTime: Date.now(),
        ...overrides,
    };
}

function sessionOf(session: GameSession): SessionPrivate {
    return session as unknown as SessionPrivate;
}

function cityOf(city: CityGenerator): CityPrivate {
    return city as unknown as CityPrivate;
}

function gunOf(gun: CheeseGun): GunPrivate {
    return gun as unknown as GunPrivate;
}

describe('GameSession real resource lifetime', () => {
    let frames: FrameRequestCallback[];
    let cancel: ReturnType<typeof vi.fn>;
    let windowListeners: Set<EventListenerOrEventListenerObject>;
    let documentListeners: Set<EventListenerOrEventListenerObject>;
    let page: ReturnType<typeof createPage>;
    const audioContext = new FakeAudioContext();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
        frames = [];
        cancel = vi.fn();
        sockets.length = 0;
        page = createPage();
        const fakeWindow = new FakeWindow();
        windowListeners = trackListeners(fakeWindow);
        documentListeners = trackListeners(page.doc);
        vi.stubGlobal('window', fakeWindow);
        vi.stubGlobal('location', fakeWindow.location);
        vi.stubGlobal('document', page.doc);
        vi.stubGlobal('AudioContext', FakeAudioContext);
        vi.stubGlobal('webkitAudioContext', FakeAudioContext);
        vi.stubGlobal('WebSocket', FakeSocket);
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            frames.push(cb);
            return frames.length;
        });
        vi.stubGlobal('cancelAnimationFrame', cancel);
        ThreeAudioContext.setContext(audioContext as unknown as AudioContext);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function start() {
        const canvas = page.doc.createElement('canvas');
        const renderer = {
            domElement: canvas,
            shadowMap: { enabled: false, type: 0 },
            toneMapping: 0,
            toneMappingExposure: 1,
            outputColorSpace: '',
            setSize() {},
            setPixelRatio() {},
            render() {},
            dispose: vi.fn(),
        };
        const session = new GameSession(renderer as never);
        return { session, page, renderer };
    }

    function join(message = welcome()) {
        page.enter.dispatchEvent(new Event('click'));
        const socket = sockets.at(-1)!;
        socket.open();
        socket.receive(message);
        return socket;
    }

    function liveEntities(session: GameSession) {
        const inner = sessionOf(session);
        return (inner.rat ? 1 : 0) + inner.remotes.rats.size;
    }

    it('clears real city, rats, gun, and cannon resources across welcome replacement and two session cycles', () => {
        const first = start();
        const inner = sessionOf(first.session);
        expect(inner.city.getCounts().buildings).toBe(144);
        expect(inner.stage.world.bodies).toHaveLength(145);
        expect(inner.rat).toBeNull();
        expect(frames).toHaveLength(1);

        join(welcome({ world: { seed: 1, version: WORLD_LAYOUT_VERSION } }));
        expect(liveEntities(first.session)).toBe(2);
        expect(inner.stage.world.bodies.filter(body => body.mass > 0)).toHaveLength(1);
        expect(inner.stage.world.bodies).toHaveLength(147);
        expect(inner.rat?.entity.body.world).toBe(inner.stage.world);

        inner.gun.shoot(inner.rat!.entity, new THREE.Vector3(100, 1.45, 0));
        expect(gunOf(inner.gun).balls).toHaveLength(1);
        const pending = frames.length;
        frames.at(-1)?.(16);
        expect(frames.length).toBe(pending + 1);

        const owned = inner.rat!.entity;
        const ownedBody = owned.body;
        const socket = sockets.at(-1)!;
        socket.receive({ type: 'playerDamaged', id: 'me', hp: 1, attackerId: 'other' });
        expect(inner.rat!.entity).toBe(owned);
        expect(owned.hp).toBe(1);
        expect(owned.dead).toBe(false);
        expect(inner.stage.world.bodies.includes(ownedBody)).toBe(true);
        socket.receive({ type: 'playerDamaged', id: 'me', hp: 0, attackerId: 'other' });
        expect(owned.hp).toBe(0);
        expect(owned.dead).toBe(false);
        socket.receive({
            type: 'playerDied', victimId: 'me', killerId: 'other',
            killerName: 'other', victimName: 'me', respawnAt: Date.now() + 5_000,
        });
        expect(inner.rat!.entity).toBe(owned);
        expect(owned.hp).toBe(0);
        expect(owned.dead).toBe(true);
        expect(liveEntities(first.session)).toBe(2);
        expect(inner.stage.world.bodies.includes(ownedBody)).toBe(true);
        expect(inner.stage.world.bodies).toHaveLength(147);
        expect(owned.mesh.parent).toBe(inner.stage.scene);
        expect(first.page.registry.get('respawn-overlay')!.style.display).toBe('flex');
        socket.receive({ type: 'playerRespawn', id: 'me', x: 20, y: 2, z: -10, hp: 3 });
        expect(inner.rat!.entity).toBe(owned);
        expect(owned.body).toBe(ownedBody);
        expect(owned.dead).toBe(false);
        expect(owned.hp).toBe(3);
        expect(owned.body.position.x).toBe(20);
        expect(owned.mesh.parent).toBe(inner.stage.scene);
        expect(liveEntities(first.session)).toBe(2);
        expect(inner.stage.world.bodies).toHaveLength(147);
        expect(first.page.registry.get('respawn-overlay')!.style.display).toBe('none');

        const firstCity = inner.city;
        const firstCityResources = [...cityOf(firstCity).geometries, ...cityOf(firstCity).materials, ...cityOf(firstCity).textures]
            .map(resource => vi.spyOn(resource, 'dispose'));
        const firstBuildings = firstCity.getBuildingBodies();
        const firstRat = inner.rat!;
        const firstRemote = inner.remotes.get('other')!;
        const firstRatBody = firstRat.entity.body;
        const firstRemoteBody = firstRemote.body;
        const gunGeometry = gunOf(inner.gun).ballGeometry;
        const gunGeometryDispose = vi.spyOn(gunGeometry, 'dispose');

        sockets.at(-1)!.receive(welcome({
            player: player('me', 0, { respawnAt: Date.now() + 4_000 }),
            world: { seed: 99, version: WORLD_LAYOUT_VERSION },
            round: { phase: 'won', winnerName: 'me', kills: 20, resetAt: Date.now() + 6_000 },
        }));

        for (const dispose of firstCityResources) expect(dispose).toHaveBeenCalledTimes(1);
        expect(firstCity.getCounts().buildings).toBe(0);
        expect(inner.city).not.toBe(firstCity);
        expect(inner.city.getCounts().buildings).toBe(144);
        expect(inner.rat).not.toBe(firstRat);
        expect(liveEntities(first.session)).toBe(2);
        expect(inner.stage.world.bodies.includes(firstRatBody)).toBe(false);
        expect(inner.stage.world.bodies.includes(firstRemoteBody)).toBe(false);
        for (const body of firstBuildings) expect(inner.stage.world.bodies.includes(body)).toBe(false);
        expect(gunOf(inner.gun).balls).toHaveLength(0);
        expect(gunGeometryDispose).not.toHaveBeenCalled();
        expect(inner.stage.world.bodies).toHaveLength(147);
        expect(inner.rat!.entity.mesh.parent).toBe(inner.stage.scene);

        inner.gun.shoot(inner.rat!.entity, new THREE.Vector3(40, 1.45, 0));
        expect(gunOf(inner.gun).balls).toHaveLength(1);
        const replacementCity = [...cityOf(inner.city).geometries, ...cityOf(inner.city).materials, ...cityOf(inner.city).textures]
            .map(resource => vi.spyOn(resource, 'dispose'));

        first.session.dispose();
        first.session.dispose();
        expect(inner.disposed).toBe(true);
        expect(cancel).toHaveBeenCalledWith(inner.frame);
        expect(gunGeometryDispose).toHaveBeenCalledTimes(1);
        for (const dispose of replacementCity) expect(dispose).toHaveBeenCalledTimes(1);
        expect(inner.city.getCounts().buildings).toBe(0);
        expect(inner.rat).toBeNull();
        expect(inner.remotes.rats.size).toBe(0);
        expect(inner.stage.world.bodies).toHaveLength(0);
        expect(inner.stage.scene.children).toHaveLength(0);
        expect(gunOf(inner.gun).balls).toHaveLength(0);
        expect(gunOf(inner.gun).disposed).toBe(true);
        expect(first.renderer.dispose).toHaveBeenCalledTimes(1);
        expect(windowListeners.size).toBe(0);
        expect(documentListeners.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);

        const afterDispose = frames.length;
        frames.at(-1)?.(32);
        expect(frames.length).toBe(afterDispose);
        vi.advanceTimersByTime(100_000);
        expect(sockets).toHaveLength(1);
        expect(vi.getTimerCount()).toBe(0);

        const second = start();
        const secondInner = sessionOf(second.session);
        expect(secondInner.city.getCounts().buildings).toBe(144);
        expect(secondInner.stage.world.bodies).toHaveLength(145);
        join(welcome({ world: { seed: 7, version: WORLD_LAYOUT_VERSION } }));
        expect(liveEntities(second.session)).toBe(2);
        expect(secondInner.stage.world.bodies).toHaveLength(147);
        secondInner.gun.shoot(secondInner.rat!.entity, new THREE.Vector3(-80, 1.45, 0));
        expect(gunOf(secondInner.gun).balls).toHaveLength(1);
        sockets.at(-1)!.receive(welcome({ world: { seed: 8, version: WORLD_LAYOUT_VERSION } }));
        expect(secondInner.city.getCounts().buildings).toBe(144);
        expect(secondInner.stage.world.bodies).toHaveLength(147);
        expect(gunOf(secondInner.gun).balls).toHaveLength(0);

        second.session.dispose();
        expect(secondInner.stage.world.bodies).toHaveLength(0);
        expect(secondInner.stage.scene.children).toHaveLength(0);
        expect(secondInner.city.getCounts().buildings).toBe(0);
        expect(liveEntities(second.session)).toBe(0);
        expect(windowListeners.size).toBe(0);
        expect(documentListeners.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        expect(sockets).toHaveLength(2);
    });
});
