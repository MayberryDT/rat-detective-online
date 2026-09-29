import * as C from 'cannon-es';
import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CITY_STREETS, cityStreetBuildings} from '../../src/shared/cityPlan';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CITY_PREVIEW_SEED, STREET_LAMPS, grayboxBoxes} from '../../src/shared/grayboxLayout';
import {CORNER_CUT, CENTRAL_BUILDINGS, beyondCut, buildingColliders, chamferFace, isCentralBuilding, type ChamferFace} from '../../src/shared/skyline';
import {addCityBody, cityBoxBody, StaticCityBroadphase} from '../../src/shared/StaticCityBroadphase';
import {generatedStreetLamps} from '../../src/shared/streetLampLayout';
import {DISPATCH_STATIONS, LAUNCH_MACHINES} from '../../src/shared/chaosState';
import {createWorldSpec, DEFAULT_CITY_OPTIONS, generateBuildingLayout, type BuildingFootprint, type FootprintChamfer} from '../../src/shared/worldSpec';
import {createPlayer} from '../../src/worker/gameState';
import {CityGenerator} from '../../src/world/CityGenerator';

// Ways the cut corners could go wrong, written before the code:
// 1. The server and the client collide against different boxes, so a bank shot hits on one and misses on the other.
// 2. The yawed box does not lie on the cut, so a ball meets air or a notch, or a rat walks into the building.
// 3. A ball fired down a street at the face does not turn into the cross street.
// 4. A cut opens onto a lamp, pillar or launcher, or into a street; or lands on a tower or landmark.
// 5. Trim, props and fire escapes built for square corners hang in the air in front of the face.
const buildings=cityStreetBuildings(generateBuildingLayout({seed:CITY_PREVIEW_SEED,version:1}));
const cuts=buildings.flatMap(b=>(b.chamfers??[]).map(k=>({b,k,f:chamferFace(b,k)})));
const segmentDistance=(f:ChamferFace,x:number,z:number)=>{
    const fx=f.b.x-f.a.x,fz=f.b.z-f.a.z,t=Math.max(0,Math.min(1,((x-f.a.x)*fx+(z-f.a.z)*fz)/(fx*fx+fz*fz)));
    return Math.hypot(x-f.a.x-fx*t,z-f.a.z-fz*t);
};
const inside=(r:{x:number;z:number;w:number;d:number},x:number,z:number,pad=0)=>Math.abs(x-r.x)<r.w/2+pad&&Math.abs(z-r.z)<r.d/2+pad;

describe('cut corners at junctions',()=>{
    it('cuts tenement corners only where two streets meet, never a tower or landmark',()=>{
        expect(cuts.length).toBeGreaterThan(0);
        for(const {b,k} of cuts){
            expect(isCentralBuilding(b)).toBe(false);
            const x=b.cx+k.sx*b.bw/2,z=b.cz+k.sz*b.bd/2;
            // Both walls at the corner front a street within a pavement's width, beside the cut.
            expect(CITY_STREETS.some(r=>r.d>r.w&&(r.x-k.sx*r.w/2-x)*k.sx>=0&&(r.x-k.sx*r.w/2-x)*k.sx<=2.5&&Math.abs(z-k.sz*CORNER_CUT-r.z)<r.d/2),`${b.cx},${b.cz}`).toBe(true);
            expect(CITY_STREETS.some(r=>r.w>r.d&&(r.z-k.sz*r.d/2-z)*k.sz>=0&&(r.z-k.sz*r.d/2-z)*k.sz<=2.5&&Math.abs(x-k.sx*CORNER_CUT-r.x)<r.w/2),`${b.cx},${b.cz}`).toBe(true);
        }
    });

    it('keeps every cut clear of streets, lamps, pillars and launchers',()=>{
        const lamps=[...STREET_LAMPS,...generatedStreetLamps(buildings,STREET_LAMPS)];
        for(const {b,k,f} of cuts){
            // The colliders stay inside the old footprint, so no street loses width.
            for(const c of buildingColliders(b))for(const [lx,lz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
                const yaw=c.ry??0,x=c.x+Math.cos(yaw)*lx*c.w/2+Math.sin(yaw)*lz*c.d/2,z=c.z-Math.sin(yaw)*lx*c.w/2+Math.cos(yaw)*lz*c.d/2;
                expect(inside({x:b.cx,z:b.cz,w:b.bw,d:b.bd},x,z,1e-6)).toBe(true);
                expect(beyondCut(b,k,x,z)).toBeLessThan(1e-6);
            }
            // A pole may stand on the pavement beside the face (it is 0.16 wide), never in the cut or against the face.
            for(const [x,z] of lamps)expect(beyondCut(b,k,x,z)>0&&inside({x:b.cx,z:b.cz,w:b.bw,d:b.bd},x,z)||segmentDistance(f,x,z)<.6,`lamp ${x},${z}`).toBe(false);
            for(const s of DISPATCH_STATIONS.filter(s=>s.y===0))expect(segmentDistance(f,s.x,s.z)).toBeGreaterThan(3);
            for(const m of LAUNCH_MACHINES){
                expect(segmentDistance(f,m.box.x,m.box.z)).toBeGreaterThan(3);
                expect(segmentDistance(f,m.pad.x,m.pad.z)).toBeGreaterThan(m.pad.radius+1);
            }
        }
    });

    it('gives the server and the client the identical collider set',()=>{
        const world=new C.World(),city=new CityGenerator(new THREE.Scene(),world,DEFAULT_CITY_OPTIONS,createWorldSpec(CITY_PREVIEW_SEED));
        city.generate([...buildings,...CENTRAL_BUILDINGS],true);
        const key=(body:C.Body)=>{
            const h=(body.shapes[0] as C.Box).halfExtents,q=body.quaternion;
            return [body.position.x,body.position.y,body.position.z,h.x,h.y,h.z,q.x,q.y,q.z,q.w].map(v=>v.toFixed(9)).join(' ');
        };
        const client=city.getBuildingBodies().map(key).sort();
        const server=grayboxBoxes().filter(b=>b.original).map(b=>key(cityBoxBody(b))).sort();
        expect(client).toEqual(server);
        // The cut corners are really in the set: one yawed box per cut.
        expect(city.getBuildingBodies().filter(b=>Math.abs(b.quaternion.y)>.1)).toHaveLength(cuts.length);
        city.dispose();
    });

    it('stops a rat at the 45° face, inside what used to be the corner',()=>{
        for(const {b,k,f} of cuts){
            const world=new C.World();world.broadphase=new StaticCityBroadphase(world);world.gravity.set(0,0,0);
            for(const c of buildingColliders(b))addCityBody(world,cityBoxBody({...c,rx:0,rz:0}));
            const rat=new C.Body({mass:5,fixedRotation:true,shape:new C.Sphere(.58),position:new C.Vec3(f.x+f.nx*6,.6,f.z+f.nz*6)});
            rat.velocity.set(-f.nx*6,0,-f.nz*6);world.addBody(rat);
            let closest=Infinity;
            for(let i=0;i<150;i++){world.step(1/60);closest=Math.min(closest,beyondCut(b,k,rat.position.x,rat.position.z)/Math.SQRT2);}
            // It meets the face flat, one radius in front of the cut line, inside the old square corner, and gets no further.
            // Contact resolution lets a sphere sink up to one step (0.1 at this speed) before it is pushed out.
            expect(closest).toBeGreaterThan(.58-.1);
            expect(closest).toBeLessThan(.58+.05);
        }
    });

    describe('in the server simulation',()=>{
        const NOW=1_000_000;
        beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(NOW);vi.spyOn(Math,'random').mockReturnValue(.12);});
        afterEach(()=>vi.restoreAllMocks());
        /** A crossroads corner: the street along x runs on past the junction, the street along z too. */
        const crossroads=cuts.find(({b,k})=>{
            const x=b.cx+k.sx*b.bw/2,z=b.cz+k.sz*b.bd/2;
            return CITY_STREETS.some(r=>r.w>r.d&&inside(r,x+k.sx*45,z+k.sz*(r.d/2+1),0))
                &&CITY_STREETS.some(r=>r.d>r.w&&inside(r,x+k.sx*(r.w/2+1),z+k.sz*40,0));
        });

        it('turns a ball fired down one street at the face into the cross street',()=>{
            expect(crossroads).toBeDefined();
            const {b,k,f}=crossroads as {b:BuildingFootprint;k:FootprintChamfer;f:ChamferFace};
            const x=b.cx+k.sx*b.bw/2,z=b.cz+k.sz*b.bd/2;
            const along=CITY_STREETS.find(r=>r.w>r.d&&inside(r,x+k.sx*45,z+k.sz*(r.d/2+1),0))!;
            const cross=CITY_STREETS.find(r=>r.d>r.w&&inside(r,x+k.sx*(r.w/2+1),z+k.sz*40,0))!;
            const shooter=createPlayer('shooter','Shooter',{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},{x:0,y:100,z:0});
            const sim=new ChaosSimulation(new Map([[shooter.id,shooter]]),()=>{},undefined,{seed:CITY_PREVIEW_SEED,version:3});sim.step(0,NOW);
            // From the middle of the street, well beyond the junction, straight at the middle of the face.
            const origin={x:x+k.sx*45,y:1.3,z:along.z},aim={x:f.x-origin.x,z:f.z-origin.z};
            const [ball]=sim.shoot(shooter.id,{shotId:'bank',origin,direction:{x:aim.x,y:0,z:aim.z}});
            const heading=Math.atan2(aim.z,aim.x);
            let turned:number|undefined,later:{x:number;z:number}|undefined;
            for(let i=1;i<=60&&!later;i++){
                sim.step(1/60,NOW+i*1000/60);
                const s=sim.snapshot(false).shots.find(s=>s.id===ball.id);
                if(!s)break;
                const v=Math.atan2(s.v.z,s.v.x);
                if(turned===undefined&&Math.hypot(s.v.x,s.v.z)>1&&Math.abs(Math.atan2(Math.sin(v-heading),Math.cos(v-heading)))>.3)turned=v;
                // Once it has left the junction, it is in the cross street, heading down it.
                if(turned!==undefined&&Math.abs(s.p.z-z)>25)later={x:s.p.x,z:s.p.z};
            }
            expect(turned).toBeDefined();
            // The face is a 45° mirror: the ball leaves on the reflection of its heading, a quarter turn plus
            // twice the few degrees its aim leans off the street axis.
            const n={x:f.nx,z:f.nz},dot=Math.cos(heading)*n.x+Math.sin(heading)*n.z;
            const mirrored=Math.atan2(Math.sin(heading)-2*dot*n.z,Math.cos(heading)-2*dot*n.x);
            const lean=Math.abs(Math.atan2(aim.z,Math.abs(aim.x)));
            expect(Math.abs(Math.atan2(Math.sin(turned!-mirrored),Math.cos(turned!-mirrored)))).toBeLessThan(.1);
            const turn=Math.abs(Math.atan2(Math.sin(turned!-heading),Math.cos(turned!-heading)));
            expect(Math.abs(turn-Math.PI/2)).toBeLessThan(2*lean+.1);
            expect(later).toBeDefined();
            expect(inside(cross,later!.x,later!.z),`ball at ${later!.x},${later!.z}`).toBe(true);
            expect(Math.sign(later!.z-z)).toBe(k.sz);
        });
    });

    it('leaves no square-corner trim, prop or fire escape hanging in front of a face',()=>{
        const scene=new THREE.Scene(),city=new CityGenerator(scene,new C.World(),DEFAULT_CITY_OPTIONS,createWorldSpec(CITY_PREVIEW_SEED));
        city.generate(buildings,true);
        const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
        let checked=0;
        const lamps=[...STREET_LAMPS,...generatedStreetLamps(buildings,STREET_LAMPS)];
        for(const mesh of scene.children)if(mesh instanceof THREE.InstancedMesh&&mesh.geometry instanceof THREE.BoxGeometry)for(let i=0;i<mesh.count;i++){
            mesh.getMatrixAt(i,matrix);matrix.decompose(p,q,s);
            // Pavement, lamp brackets and the pieces set on the face itself (yawed) are meant to be there.
            if(p.y+s.y/2<.15||Math.abs(q.y)>1e-6||lamps.some(([x,z])=>Math.hypot(p.x-x,p.z-z)<.8))continue;
            for(const {b,k} of cuts){
                if(!inside({x:b.cx,z:b.cz,w:b.bw,d:b.bd},p.x,p.z,3))continue;
                checked++;
                // Quoins at the ends of the face and mitred cornices stand a few centimetres proud of it.
                expect(beyondCut(b,k,p.x+k.sx*s.x/2,p.z+k.sz*s.z/2),`detail at ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).toBeLessThan(.4);
            }
        }
        expect(checked).toBeGreaterThan(0);
        city.dispose();
    });
});
