import type {WeaponKind} from './pickups';

/** The penthouse safe (Tyler, 9 October: "you have to shoot it a lot to break it, but when you bust it open, it gives
 * you an ironclad alibi, it gives you a hot pursuit, and … whatever the next gun upgrade is"): one on each landmark's
 * top floor. It takes `hits` hits (a Persuader slug counts 2, a laser 3, any other ball 1); the rat whose hit cracks it
 * takes the lot: Ironclad, Hot Pursuit and the next gun in `SAFE_GUNS`. It stands open, then is stocked and locked
 * again `restockMs` later. Rats walk through it (only balls and beams meet it, like a Mousetrap). */
export const SAFE={hits:30,restockMs:120_000,half:{x:.7,y:.8,z:.55},slugHits:2,laserHits:3,
    /** How far from its anchor the safe may move to stand clear (`ChaosSimulation.seedSafes`). */
    search:3} as const;
/** The gun a cracked safe hands over, in turn per safe. */
export const SAFE_GUNS=['persuader','tommy-gun','laser','mousetrap'] as const satisfies readonly WeaponKind[];
export const safeGun=(cracks:number):WeaponKind=>SAFE_GUNS[cracks%SAFE_GUNS.length]!;

/** A safe as the room keeps and sends it. `hp` left (0: cracked, standing open until `at`); `n` cracks so far (its next
 * gun); `hitAt` the latest hit (the client's shake); `by` who cracked it last. */
export interface SafeState {id:string;x:number;y:number;z:number;yaw:number;hp:number;n:number;at?:number;hitAt?:number;by?:string}

/** Each landmark's top floor (`LANDMARK_INTERIORS` levels), against a wall where few rats walk; `yaw` faces the room. */
export const SAFE_ANCHORS:readonly {id:string;name:string;x:number;y:number;z:number;yaw:number}[]=[
    {id:'records',name:'RECORDS',x:-38,y:16,z:-62,yaw:Math.PI/2},
    {id:'needleworks',name:'NEEDLEWORKS',x:-112,y:16,z:78,yaw:0},
    {id:'icebox',name:'ICEBOX',x:146,y:8,z:-86,yaw:-Math.PI/2},
    {id:'pump',name:'PUMPING STATION',x:125,y:8,z:103.5,yaw:Math.PI/2},
];

export function validSafes(value:unknown):value is SafeState[]{
    const ids=new Set<string>();
    return Array.isArray(value)&&value.length<=SAFE_ANCHORS.length&&value.every(s=>!!s&&typeof s==='object'&&typeof s.id==='string'&&s.id.length>0&&s.id.length<=32&&
        !ids.has(s.id)&&(ids.add(s.id),true)&&[s.x,s.y,s.z,s.yaw].every(Number.isFinite)&&Number.isInteger(s.hp)&&s.hp>=0&&s.hp<=SAFE.hits&&
        Number.isInteger(s.n)&&s.n>=0&&(s.at===undefined||Number.isFinite(s.at))&&(s.hitAt===undefined||Number.isFinite(s.hitAt))&&
        (s.by===undefined||typeof s.by==='string'&&s.by.length>0&&s.by.length<=64));
}
