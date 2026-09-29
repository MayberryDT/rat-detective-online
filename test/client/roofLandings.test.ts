import { describe, expect, it } from 'vitest';
import * as C from 'cannon-es';
import { StaticCityBroadphase, addCityBody, cityBoxBody } from '../../src/shared/StaticCityBroadphase';
import { CITY_PREVIEW_SEED, GRAYBOX_VERSION, grayboxBoxes } from '../../src/shared/grayboxLayout';
import { BOT_LAUNCH_LINKS } from '../../src/shared/BotLaunchRoutes';
import { PICKUP_ANCHORS } from '../../src/shared/pickups';
import { guardFastFall } from '../../src/shared/ratSurfaces';

// The rat worlds (client, local bots, server bots): static city bodies, frictionless
// contacts, the three-sphere rat. A launcher throw falls at up to about 100 u/s; the
// client steps at 60 Hz and the server bots at 30 Hz, 1.7 to 3.3 units per step.
const world=new C.World({gravity:new C.Vec3(0,-25,0)});
world.broadphase=new StaticCityBroadphase(world);world.broadphase.useBoundingBoxes=true;
world.defaultContactMaterial.friction=0;world.defaultContactMaterial.restitution=.05;
for(const b of grayboxBoxes({seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION}))addCityBody(world,cityBoxBody(b));

/** Drops a rat onto feet height `top` and returns how deep its feet ever sank and where they rest. */
function land(x:number,top:number,z:number,speed:number,dt:number,phase:number){
    const body=new C.Body({mass:5,fixedRotation:true,linearDamping:.1,angularDamping:1,collisionFilterGroup:2,collisionFilterMask:1|32});
    body.addShape(new C.Sphere(.6),new C.Vec3(0,.6,0));body.addShape(new C.Sphere(.45),new C.Vec3(0,1.3,0));body.addShape(new C.Sphere(.28),new C.Vec3(0,1.9,0));
    body.position.set(x,top+3+speed*dt*phase,z);body.velocity.set(0,-speed,0);world.addBody(body);
    let deepest=0;
    for(let i=0;i<Math.round(2/dt);i++){guardFastFall(world,body,dt);world.step(dt);deepest=Math.max(deepest,top-body.position.y);}
    world.removeBody(body);
    return {deepest,rest:body.position.y-top};
}

const spots=[
    ...BOT_LAUNCH_LINKS.map(l=>({id:`${l.machine.id} landing`,x:l.landing.x,y:l.landing.y,z:l.landing.z})),
    // Roof supplies: anything authored above the landmarks' ceilings (y 24).
    ...PICKUP_ANCHORS.filter(a=>(a.y??0)>24).map(a=>({id:a.id,x:a.x,y:a.y!-.7,z:a.z})),
];

describe('launcher landings on roofs',()=>{
    it.each(spots)('leaves a rat falling at launcher speed standing on top at $id',s=>{
        for(const dt of [1/60,1/30])for(const speed of [40,75,100])for(const phase of [0,.3,.7])for(const [dx,dz] of [[0,0],[.6,-.6]] as const){
            const {deepest,rest}=land(s.x+dx,s.y,s.z+dz,speed,dt,phase),at=`${Math.round(1/dt)} Hz, ${speed} u/s, phase ${phase}`;
            // The city recorder counts a landing clip once the feet are .75 inside a solid.
            expect(deepest,at).toBeLessThan(.4);
            expect(Math.abs(rest),at).toBeLessThan(.1);
        }
    });
});
