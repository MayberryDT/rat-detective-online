import { describe, expect, it } from 'vitest';
import { BotNavigation } from '../../src/shared/BotNavigation';
import { CITY_PREVIEW_SEED, GRAYBOX_VERSION, grayboxBoxes, isRampOpening } from '../../src/shared/grayboxLayout';
import { boxHalfExtents } from '../../src/shared/boxFrame';
import { DOCKS_SEWER_EXIT, PRECINCT_SEWER_EXIT, inside } from '../../src/shared/city/kit/northPlan';
import { SEWER_HALLS, SEWER_PIPE_ENTRANCES, sewerBoxes, sewerEntranceFootprint, sewerPipePoint, sewerRampAt } from '../../src/shared/sewerLayout';
import type { Vec3Data } from '../../src/shared/networkProtocol';

const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};
const sewer=new Set(sewerBoxes().map(b=>JSON.stringify(b)));
const others=grayboxBoxes(spec).filter(b=>!sewer.has(JSON.stringify(b))).map(b=>({b,...boxHalfExtents(b)}));
const branches=[{name:'Precinct',exit:PRECINCT_SEWER_EXIT},{name:'Docks',exit:DOCKS_SEWER_EXIT}] as const;
const entry=(name:string)=>SEWER_PIPE_ENTRANCES.find(e=>e.name===name)!;
// The pavement is two-unit tiles, dropped wherever the opening test passes at the tile centre.
const tiles=(test:(x:number,z:number)=>boolean)=>{
    const out:Array<[number,number]>=[];
    for(let x=-195;x<166;x+=2)for(let z=-195;z<166;z+=2)if(test(x,z))out.push([x,z]);
    return out;
};
const cells=(test:(x:number,z:number)=>boolean)=>{
    const out:Array<[number,number]>=[];
    for(let x=-196;x<=166;x+=.5)for(let z=-196;z<=166;z+=.5)if(test(x,z))out.push([x,z]);
    return out;
};
const blockers=(x:number,z:number,y0:number,y1:number)=>others.filter(({b,hx,hy,hz})=>
    Math.abs(x-b.x)<hx&&Math.abs(z-b.z)<hz&&b.y+hy>y0&&b.y-hy<y1);

function solve(nav:BotNavigation,from:Vec3Data,to:Vec3Data) {
    let route=nav.route(from,to);
    for(let i=0;i<600&&!route.length;i++){nav.update(20);route=nav.route(from,to);}
    return route;
}

describe('north sewer branches',()=>{
    it.each(branches)('surfaces the $name ramp inside its reserved street exit',({name,exit})=>{
        const e=entry(name);
        const hole=tiles((x,z)=>isRampOpening(x,z)&&Math.hypot(x-e.x,z-e.z)<40);
        expect(hole.length).toBeGreaterThanOrEqual(4*14);
        for(const [x,z] of hole)for(const [dx,dz] of [[-1,-1],[1,1]])expect(inside(exit,x+dx,z+dz),`hole tile at ${x},${z}`).toBe(true);
        // The mouth opens north, onto the pavement past the exit, and the foot meets a hall.
        expect(sewerPipePoint(e,0).z).toBeLessThan(exit.zmin+4);
        const foot=sewerPipePoint(e,30.5);
        expect(SEWER_HALLS.some(r=>foot.x>r.xmin&&foot.x<r.xmax&&foot.z>r.zmin&&foot.z<r.zmax)).toBe(true);
    });
    it('keeps every street hole and pipe approach free of buildings, fixtures and props',()=>{
        const corners=[[0,0],[-.9,-.9],[-.9,.9],[.9,-.9],[.9,.9]];
        for(const [x,z] of tiles((x,z)=>isRampOpening(x,z)))for(const [dx,dz] of corners)
            expect(blockers(x+dx,z+dz,-.99,6).map(o=>o.b),`over the hole at ${x+dx},${z+dz}`).toEqual([]);
        // The north mouths open onto the precinct side and the quay; nothing stands in the way.
        for(const {name} of branches){
            const e=entry(name);
            for(const [x,z] of cells((x,z)=>Math.hypot(x-e.x,z-e.z)<45&&sewerEntranceFootprint(x,z)))
                expect(blockers(x,z,.1,5).map(o=>o.b),`in the ${name} pipe approach at ${x},${z}`).toEqual([]);
        }
    });
    it('leaves the hall volumes to the sewer alone',()=>{
        for(const r of SEWER_HALLS)for(let x=r.xmin+.25;x<r.xmax;x+=.5)for(let z=r.zmin+.25;z<r.zmax;z+=.5)
            expect(blockers(x,z,-6.99,-1.01).map(o=>o.b),`inside the hall at ${x},${z}`).toEqual([]);
    });
    // One navigator for all four routes: the fields are shared as in the game.
    const nav=new BotNavigation(spec);
    const junction={x:0,y:-7,z:0};
    it.each(branches.flatMap(({name})=>[{name,down:true},{name,down:false}]))('routes $name street and sewer junction through the branch, down=$down',({name,down})=>{
        const e=entry(name),mouth=sewerPipePoint(e,-6),street={x:mouth.x,y:0,z:mouth.z};
        const path=down?solve(nav,street,junction):solve(nav,junction,street);
        const evidence=JSON.stringify(path.filter((_,i)=>i%8===0));
        expect(path.length,evidence).toBeGreaterThan(40);
        const end=down?junction:street;
        expect(Math.hypot(path.at(-1)!.x-end.x,path.at(-1)!.z-end.z),evidence).toBeLessThanOrEqual(2);
        expect(path.at(-1)!.y,evidence).toBeCloseTo(end.y);
        expect(path.some(p=>sewerRampAt(p)?.name===name&&p.y < -2&&p.y > -5),evidence).toBe(true);
        for(let i=1;i<path.length;i++){
            expect(Math.abs(path[i].y-path[i-1].y),evidence).toBeLessThan(1.2);
            expect(Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z),evidence).toBeLessThanOrEqual(Math.SQRT2*2+.001);
        }
    });
});
