import { describe, expect, it } from 'vitest';
import { BotNavigation } from '../../src/shared/BotNavigation';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import { CASE_SPAWNS } from '../../src/shared/chaosState';
import { worldSpawnPoints } from '../../src/shared/playerSpawns';
import { createPlayer } from '../../src/worker/gameState';
import { drowned, kitCity } from '../../src/shared/city/kit/city';
import { DROWN_Y, QUAY_EDGE_Z, inside } from '../../src/shared/city/kit/northPlan';
import { CRANES, PIERS, PIER_END, PIER_HALF } from '../../src/shared/city/kit/parts/docks';
import { CRANE_DECK_Y } from '../../src/shared/city/kit/parts/docksCrane';
import { GANGWAY_X, SHIP, SHIP_Z } from '../../src/shared/city/kit/parts/docksShip';
import { MEZZANINE_Y } from '../../src/shared/city/kit/parts/docksWarehouse';
import type { Vec3Data } from '../../src/shared/networkProtocol';

const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};
const water=kitCity({visuals:false}).water;
const appearance={hatType:'fedora' as const,hatColor:1,furColor:2,coatColor:3};

function solve(nav:BotNavigation,from:Vec3Data,to:Vec3Data) {
    let route=nav.route(from,to);
    for(let i=0;i<600&&!route.length;i++){nav.update(20);route=nav.route(from,to);}
    return route;
}

describe('the harbour',()=>{
    it('drowns feet that sink into the water, and only there',()=>{
        expect(drowned(-100,DROWN_Y-.05,-185)).toBe(true);
        expect(drowned(PIERS[0],-8,PIER_END+.5)).toBe(true);
        // Above the line, on the quay side of the edge, and down in the sewers stay alive.
        expect(drowned(-100,DROWN_Y+.05,-185)).toBe(false);
        expect(drowned(-100,-6,QUAY_EDGE_Z+.5)).toBe(false);
        expect(drowned(52,-7,-130)).toBe(false);
    });

    it('never offers a spawn over the water or on its edge',()=>{
        const points=worldSpawnPoints(spec);
        expect(points.length).toBeGreaterThan(400);
        for(const p of points)expect(water.some(w=>inside(w,p.x,p.z,1.9)),`spawn at ${p.x},${p.z}`).toBe(false);
    });

    // One navigator for every deck, as in the game.
    const nav=new BotNavigation(spec);
    const decks=[
        ...PIERS.map(x=>({name:`pier ${x}`,at:{x,y:0,z:PIER_END+3},from:{x,y:0,z:-158}})),
        {name:'the Marlowe\'s main deck',at:{x:110,y:SHIP.deck,z:-188},from:{x:GANGWAY_X,y:0,z:-160}},
        {name:'the Marlowe\'s bridge deck, aft of the wheelhouse',at:{x:92,y:SHIP.bridge,z:-188},from:{x:GANGWAY_X,y:0,z:-160}},
        {name:'the Marlowe\'s wheelhouse roof',at:{x:100,y:SHIP.roof,z:SHIP_Z},from:{x:GANGWAY_X,y:0,z:-160}},
        ...CRANES.map(c=>({name:`crane ${c.label} boom walkway`,at:{x:c.x,y:CRANE_DECK_Y,z:-182},from:{x:c.x+c.side*32,y:0,z:-160}})),
        {name:'Pier 9 mezzanine',at:{x:110,y:MEZZANINE_Y,z:-118},from:{x:109,y:0,z:-152}},
    ];
    it.each(decks)('holds a rat up over the water on $name and routes there from the street',({name,at,from})=>{
        expect(nav.supported(at),name).toBe(true);
        expect(drowned(at.x,at.y,at.z)).toBe(false);
        const path=solve(nav,from,at),evidence=JSON.stringify(path.filter((_,i)=>i%6===0));
        expect(path.length,evidence).toBeGreaterThan(3);
        expect(Math.hypot(path.at(-1)!.x-at.x,path.at(-1)!.z-at.z),evidence).toBeLessThanOrEqual(2.9);
        expect(path.at(-1)!.y,evidence).toBeCloseTo(at.y,1);
        // Walked, not teleported: every step is a small rise along a stair or ramp.
        for(let i=1;i<path.length;i++)expect(Math.abs(path[i]!.y-path[i-1]!.y),evidence).toBeLessThan(1.2);
        // Nothing on the way dips into the water.
        expect(path.some(p=>drowned(p.x,p.y,p.z)),evidence).toBe(false);
    });

    it('returns a case that sinks to the harbour floor to a dry spawn',()=>{
        const sim=new ChaosSimulation(new Map(),()=>{},undefined,spec);
        let now=1_000_000;sim.step(0,now);
        sim.caseBody.position.set(-100,-1,-185);sim.caseBody.velocity.setZero();
        let deepest=0,returned=false;
        for(let i=0;i<60*20&&!returned;i++){
            now+=1000/60;sim.step(1/60,now);
            const p=sim.caseBody.position;deepest=Math.min(deepest,p.y);
            returned=deepest< -9&&!water.some(w=>inside(w,p.x,p.z));
        }
        expect(deepest).toBeLessThan(-9);
        expect(returned).toBe(true);
        const p=sim.caseBody.position;
        expect(CASE_SPAWNS.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<1.5),`case at ${p.x},${p.y},${p.z}`).toBe(true);
    });

    it('clears a corpse knocked into the harbour before it would expire',()=>{
        const victim=createPlayer('victim','Victim',appearance,{x:PIERS[1]+PIER_HALF-.8,y:0,z:-185});
        const sim=new ChaosSimulation(new Map([[victim.id,victim]]),()=>{},undefined,spec);
        let now=1_000_000;sim.step(0,now);
        sim.death(victim,{x:1,y:0,z:0},null);
        expect(sim.snapshot(false).corpses).toHaveLength(1);
        for(let i=0;i<60*6;i++){now+=1000/60;sim.step(1/60,now);}
        expect(sim.snapshot(false).corpses).toHaveLength(0);
    });
});
