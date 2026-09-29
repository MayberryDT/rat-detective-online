import { KitBuilder, type BuildOptions } from './kit';
import { DROWN_Y } from './northPlan';
import { harbour } from './parts/harbour';
import { docks } from './parts/docks';
import { sewer } from './parts/sewer';
import { precinct } from './parts/precinct';
import { needleworksChutes } from './parts/chute';
import { bankWalls } from './parts/bankWalls';
import { gateLane } from './parts/gateLane';

/** A part writes its colliders, look, lights and rooms into the builder. */
export type KitPart = (k:KitBuilder)=>void;

/** Every kit part of the city, in build order. */
const PARTS:KitPart[] = [harbour,docks,sewer,precinct,needleworksChutes,bankWalls,gateLane];

const cache=new Map<boolean,KitBuilder>();

/** The kit-built city. Deterministic and seed-independent; `visuals:false` skips the look (server, bots). */
export function kitCity(options:BuildOptions={visuals:true}):KitBuilder {
    const hit=cache.get(options.visuals);if(hit)return hit;
    const k=new KitBuilder(options);
    for(const part of PARTS)part(k);
    cache.set(options.visuals,k);
    return k;
}

/** True when feet at (x,y,z) have sunk into harbour water: the rat drowns (plan D1). Decks over the water stand well above DROWN_Y. */
export function drowned(x:number,y:number,z:number):boolean {
    return y<DROWN_Y&&kitCity({visuals:false}).water.some(w=>x>=w.xmin&&x<=w.xmax&&z>=w.zmin&&z<=w.zmax);
}
