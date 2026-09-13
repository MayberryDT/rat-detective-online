import type { PlayerData, RatAppearance, Vec3Data } from '../shared/networkProtocol';
import { applyHit, createPlayer, respawnPlayer } from '../worker/gameState';
import { CITY_BOUNDS, grayboxBoxes, isRampOpening } from '../shared/grayboxLayout';
import { COAT_COLORS, FUR_COLORS, HAT_COLORS, HAT_TYPES } from '../shared/ratAppearance';

const NAMES = ['Constable Trap', 'Inspector Nibbles', 'Sergeant Stilton', 'Detective Crumbs', 'Officer Whiskers', 'Captain Cheddar', 'Deputy Squeaks', 'Inspector Gouda', 'Constable Alley', 'Detective Rind', 'Sergeant Scurry'];
export const PRACTICE_RESPAWN_MS = 3500;
export function practiceBotCount(search: string): number {
    const value = new URLSearchParams(search).get('bots');
    return value === null ? 0 : Math.max(0, Math.min(11, Math.floor(Number(value) || 0)));
}

/** The preview uses actual city geometry to choose a compact, walkable practice area. */
export function practiceSpawnPoints(center: Vec3Data): Vec3Data[] {
    const boxes = grayboxBoxes();
    const points: Vec3Data[] = [];
    for (let z = -48; z <= 48; z += 8) for (let x = -48; x <= 48; x += 8) {
        const p = { x: center.x + x, y: Math.max(2, center.y + 1), z: center.z + z };
        if (Math.hypot(x, z) < 7 || Math.hypot(x, z) > 52 ||
            p.x < CITY_BOUNDS.min + 4 || p.x > CITY_BOUNDS.max - 4 ||
            p.z < CITY_BOUNDS.min + 4 || p.z > CITY_BOUNDS.max - 4) continue;
        if (boxes.some(b => {
            // Conservative vertical clearance handles floors, roofs and decorative colliders.
            if (b.y + b.h / 2 < p.y - 1.5 || b.y - b.h / 2 > p.y + 2.4) return false;
            return Math.abs(p.x - b.x) < b.w / 2 + 1.2 && Math.abs(p.z - b.z) < b.d / 2 + 1.2;
        })) continue;
        points.push(p);
    }
    return points.sort((a, b) => Math.hypot(a.x-center.x,a.z-center.z)-Math.hypot(b.x-center.x,b.z-center.z));
}

/** Farthest-first street positions spread practice combat through the actual city. */
export function cityPracticeSpawnPoints(human: Vec3Data): Vec3Data[] {
    const boxes = grayboxBoxes().map(b => {
        // Conservative world bounds also cover tilted pipe walls and ramps.
        const sx = Math.sin(b.rx), cx = Math.cos(b.rx), sz = Math.sin(b.rz), cz = Math.cos(b.rz);
        return {x:b.x,y:b.y,z:b.z,
            hx:(Math.abs(cz)*b.w+Math.abs(sz*cx)*b.h+Math.abs(sz*sx)*b.d)/2,
            hy:(Math.abs(sz)*b.w+Math.abs(cz*cx)*b.h+Math.abs(cz*sx)*b.d)/2,
            hz:(Math.abs(sx)*b.h+Math.abs(cx)*b.d)/2};
    });
    const candidates: Vec3Data[] = [];
    for(let z=CITY_BOUNDS.min+24;z<=CITY_BOUNDS.max-24;z+=8) {
        for(let x=CITY_BOUNDS.min+24;x<=CITY_BOUNDS.max-24;x+=8) {
            if(Math.hypot(x-human.x,z-human.z)<32)continue;
            if([-1.2,0,1.2].some(dx=>[-1.2,0,1.2].some(dz=>isRampOpening(x+dx,z+dz))))continue;
            if(boxes.some(b=>b.y+b.hy>=.5 && b.y-b.hy<=4.4 && Math.abs(x-b.x)<b.hx+1.2 && Math.abs(z-b.z)<b.hz+1.2))continue;
            candidates.push({x,y:2,z});
        }
    }
    const selected: Vec3Data[] = [];
    const distance = (a:Vec3Data,b:Vec3Data)=>(a.x-b.x)**2+(a.z-b.z)**2;
    const nearest = candidates.map(p=>distance(p,human));
    while(selected.length<32 && candidates.length) {
        let best=0;
        for(let i=1;i<candidates.length;i++)if(nearest[i]>nearest[best])best=i;
        const point=candidates.splice(best,1)[0];nearest.splice(best,1);selected.push(point);
        for(let i=0;i<candidates.length;i++)nearest[i]=Math.min(nearest[i],distance(candidates[i],point));
    }
    return selected;
}

/** Respawns favor the most room among the city positions, including the human's position. */
export function practiceRespawnPoint(points:Vec3Data[],players:Iterable<PlayerData>,id:string):Vec3Data {
    const alive=[...players].filter(p=>p.id!==id && p.hp>0);
    let best=points[0]??{x:-18,y:2,z:-33},bestDistance=-1;
    for(const point of points){
        const distance=alive.reduce((nearest,p)=>Math.min(nearest,(p.x-point.x)**2+(p.z-point.z)**2),Infinity);
        if(distance>bestDistance){best=point;bestDistance=distance;}
    }
    return best;
}

export function addPracticePlayers(players: Map<string, PlayerData>, count: number, points: Vec3Data[]): string[] {
    return Array.from({length: Math.min(11, Math.max(0, count))}, (_, i) => {
        const id = `bot-${i + 1}`;
        const appearance: RatAppearance = {hatType:HAT_TYPES[i % HAT_TYPES.length], coatColor:COAT_COLORS[i % COAT_COLORS.length], hatColor:HAT_COLORS[(i + 1) % HAT_COLORS.length], furColor:FUR_COLORS[i % FUR_COLORS.length]};
        const spawn = points[i % points.length] ?? {x:-18,y:2,z:-33};
        players.set(id, createPlayer(id, NAMES[i], appearance, spawn));
        return id;
    });
}

/** Shared scoring rules, with independent respawn deadlines for humans and bots. */
export class PracticeLifeCycle {
    readonly respawns = new Map<string, number>();
    constructor(readonly players: Map<string, PlayerData>) {}
    hit(owner: string | null, victim: string, damage: number, now: number, caseHolderId: string | null = null, explosive = false) {
        const result = applyHit(this.players, owner, victim, damage, true, caseHolderId, false, explosive);
        if (result.killed) this.respawns.set(victim, now + PRACTICE_RESPAWN_MS);
        return result;
    }
    respawn(id: string, point: Vec3Data): void {
        const player = this.players.get(id);
        if (player) respawnPlayer(player, point);
        this.respawns.delete(id);
    }
    due(now: number): string[] { return [...this.respawns].filter(([, at]) => now >= at).map(([id]) => id); }
}

export interface BotIntent { x: number; z: number; jump: boolean; shoot?: Vec3Data; facing: number }
/** Small deterministic steering brain. Physical collisions and ground contacts stay in Cannon. */
export class PracticeBotBrain {
    private decisionAt = 0;
    private shotAt = 0;
    private jumpAt = 0;
    private heading = 0;
    private turn = 1;
    private target?: PlayerData;
    constructor(private random: () => number = Math.random) {}
    step(now: number, self: PlayerData, others: Iterable<PlayerData>, clear: (target: Vec3Data) => boolean, blocked: boolean, grounded: boolean): BotIntent {
        if (self.hp <= 0) return {x:0,z:0,jump:false,facing:this.heading};
        if (now >= this.decisionAt) {
            this.decisionAt = now + 350 + this.random() * 400;
            this.target = [...others].filter(p => p.id !== self.id && p.hp > 0 && Math.hypot(p.x-self.x,p.z-self.z) < 75 && clear(p))
                .sort((a,b) => Math.hypot(a.x-self.x,a.z-self.z)-Math.hypot(b.x-self.x,b.z-self.z))[0];
            if (!this.target || blocked) this.heading += (this.random()-.5) * 2.4;
            if (this.random() < .2) this.turn *= -1;
        }
        let move = this.heading, facing = this.heading;
        if (this.target?.hp) {
            facing = Math.atan2(this.target.x-self.x,this.target.z-self.z);
            const distance = Math.hypot(this.target.x-self.x,this.target.z-self.z);
            move = facing + (distance < 9 ? Math.PI * .75 * this.turn : distance < 24 ? Math.PI * .42 * this.turn : 0);
        }
        if (blocked) { move += this.turn * Math.PI / 2; this.heading = move; }
        const jump = grounded && now >= this.jumpAt;
        if (jump) this.jumpAt = now + 2300 + this.random() * 4200;
        let shoot: Vec3Data | undefined;
        if (this.target?.hp && now >= this.shotAt && clear(this.target)) {
            this.shotAt = now + 900 + this.random() * 1100;
            // Deliberately imperfect aim leaves the human room to inspect the game.
            shoot = {x:this.target.x+(this.random()-.5)*2.5, y:this.target.y+.9+(this.random()-.5)*.6, z:this.target.z+(this.random()-.5)*2.5};
        }
        return {x:Math.sin(move)*6.5,z:Math.cos(move)*6.5,jump,shoot,facing};
    }
}
