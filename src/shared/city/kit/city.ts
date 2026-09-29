import { KitBuilder, type BuildOptions } from './kit';
import { harbour } from './parts/harbour';

/** A part writes its colliders, look, lights and rooms into the builder. */
export type KitPart = (k:KitBuilder)=>void;

/** Every kit part of the city, in build order. */
const PARTS:KitPart[] = [harbour];

const cache=new Map<boolean,KitBuilder>();

/** The kit-built city. Deterministic and seed-independent; `visuals:false` skips the look (server, bots). */
export function kitCity(options:BuildOptions={visuals:true}):KitBuilder {
    const hit=cache.get(options.visuals);if(hit)return hit;
    const k=new KitBuilder(options);
    for(const part of PARTS)part(k);
    cache.set(options.visuals,k);
    return k;
}
