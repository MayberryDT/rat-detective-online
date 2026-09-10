import { expect, it } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatController } from '../../src/player/RatController';
import { SimulationClock } from '../../src/session/SimulationClock';
import { CASE_HOME, type ChaosState } from '../../src/shared/chaosState';

function simulate(fps: number, jump = false) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) });
    world.defaultContactMaterial.friction = 0;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    const rat = new RatController(new THREE.Scene(), world, new THREE.PerspectiveCamera());
    const clock = new SimulationClock();
    let ticks = 0;
    let maxHeight = 0;
    for (let frame = 0; frame < fps * 3; frame++) {
        clock.advance(1 / fps, dt => {
            const keys: Record<string, boolean> = ticks < 90 ? { KeyW: true } : {};
            if (jump && ticks === 60) keys.Space = true;
            rat.prepareMovement(dt, keys);
            world.step(dt);
            rat.syncAfterPhysics(dt);
            maxHeight = Math.max(maxHeight, rat.entity.body.position.y);
            ticks++;
        });
    }
    const result = { ticks, maxHeight, position: rat.entity.body.position.toArray(), velocity: rat.entity.body.velocity.toArray(),
        rotation: rat.entity.mesh.quaternion.toArray() };
    rat.dispose();
    return result;
}

it('runs the same movement/braking/turn simulation at30,60,144 rendered FPS', () => {
    const baseline = simulate(60);
    expect(baseline.ticks).toBe(180);
    expect(simulate(30)).toEqual(baseline);
    expect(simulate(144)).toEqual(baseline);
});

it('preserves the60Hz acceleration and braking constants', () => {
    const rat = new RatController(new THREE.Scene(), new CANNON.World(), new THREE.PerspectiveCamera());
    rat.prepareMovement(1 / 60, { KeyW: true });
    expect(rat.entity.body.velocity.z).toBeCloseTo(18 * .28);
    rat.prepareMovement(1 / 60, {});
    expect(rat.entity.body.velocity.z).toBeCloseTo(18 * .28 * .88);
    rat.dispose();
});

it('expires edge-jump grace and resets grounded state on respawn', () => {
    const world = new CANNON.World();
    const rat = new RatController(new THREE.Scene(), world, new THREE.PerspectiveCamera());
    const floor = new CANNON.Body({ mass: 0 });
    const contact = new CANNON.ContactEquation(floor, rat.entity.body);
    contact.ni.set(0, 1, 0);
    world.contacts.push(contact);
    rat.entity.body.velocity.y = 0;
    rat.syncAfterPhysics(1 / 60);
    rat.prepareMovement(1 / 60, { Space: true });
    expect(rat.entity.body.velocity.y).toBeCloseTo(16*Math.sqrt(1.28));
    rat.entity.body.velocity.y = 0;
    world.contacts.length = 0;
    for (let i = 0; i < 10; i++) rat.prepareMovement(1 / 60, {});
    rat.prepareMovement(1 / 60, { Space: true });
    expect(rat.entity.body.velocity.y).toBe(0);
    world.contacts.push(contact);
    rat.syncAfterPhysics(1 / 60);
    rat.resetGrounding();
    rat.prepareMovement(1 / 60, { Space: true });
    expect(rat.entity.body.velocity.y).toBe(0);
    rat.dispose();
});

it('preserves a grounded jump trajectory across render rates', () => {
    const baseline = simulate(60, true);
    expect(baseline.maxHeight).toBeGreaterThan(3);
    expect(simulate(30, true)).toEqual(baseline);
    expect(simulate(144, true)).toEqual(baseline);
});

it('makes normal jumps about twelve percent quicker while preserving their apex and horizontal controls',()=>{
    const arc=(legacy:boolean)=>{
        const dt=1/120,world=new CANNON.World({gravity:new CANNON.Vec3(0,-25,0)});
        world.defaultContactMaterial.friction=0;
        const floor=new CANNON.Body({mass:0,shape:new CANNON.Plane()});
        floor.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(floor);
        const rat=new RatController(new THREE.Scene(),world,new THREE.PerspectiveCamera(),'',{},new THREE.Vector3(0,0,0));
        for(let i=0;i<120;i++){rat.prepareMovement(dt,{KeyW:true});world.step(dt);rat.syncAfterPhysics(dt);}
        const y=rat.entity.body.position.y,z=rat.entity.body.position.z;
        let peak=y,airtime=0;
        for(let i=0;i<240;i++){
            rat.prepareMovement(dt,{KeyW:true,...(!legacy&&i===0?{Space:true}:{})});
            if(legacy&&i===0)rat.entity.body.velocity.y=16;
            world.step(dt);rat.syncAfterPhysics(dt);airtime+=dt;
            peak=Math.max(peak,rat.entity.body.position.y);
            if(i>10&&rat.entity.body.position.y<=y+.01&&rat.entity.body.velocity.y<=0)break;
        }
        const result={height:peak-y,airtime,range:rat.entity.body.position.z-z};
        expect(world.gravity.y).toBe(-25);rat.dispose();return result;
    };
    const legacy=arc(true),current=arc(false);
    expect(current.airtime/legacy.airtime).toBeGreaterThan(.85);
    expect(current.airtime/legacy.airtime).toBeLessThan(.9);
    expect(current.height/legacy.height).toBeGreaterThan(.97);
    expect(current.height/legacy.height).toBeLessThan(1.03);
    // Same sideways controls: shorter airtime modestly reduces maximum gap reach.
    expect(current.range/legacy.range).toBeGreaterThan(.85);
    expect(current.range/current.airtime).toBeCloseTo(legacy.range/legacy.airtime,1);
});

it('clears normal jump gravity for machine launches, landing, death and respawn',()=>{
    const world=new CANNON.World({gravity:new CANNON.Vec3(0,-25,0)});
    const rat=new RatController(new THREE.Scene(),world,new THREE.PerspectiveCamera());
    const floor=new CANNON.Body({mass:0});
    const contact=new CANNON.ContactEquation(floor,rat.entity.body);contact.ni.set(0,1,0);
    const jump=()=>{
        rat.entity.dead=false;rat.entity.body.velocity.y=0;world.contacts.push(contact);
        rat.syncAfterPhysics(1/60);world.contacts.length=0;
        rat.prepareMovement(1/60,{Space:true});expect(rat.entity.body.force.y).toBeLessThan(0);
        world.step(1/60);
    };
    jump();
    const state:ChaosState={time:1000,pressure:{serial:1,until:2000,launches:[
        {id:'machine',playerId:'local',at:1000,velocity:{x:40,y:55,z:20}}]},
        case:{p:{...CASE_HOME},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0},
        owner:null,previousOwner:null,pickupAfter:0,returningUntil:0},dispatch:{phase:'ready',started:0,until:0,serial:0},
        possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''}};
    rat.applyPressureLaunches(state,'local');rat.prepareMovement(1/60,{});
    expect(rat.entity.body.force.y).toBe(0);
    expect(rat.entity.body.velocity.toArray()).toEqual([40,55,20]);
    world.step(1/60);
    expect(rat.entity.body.velocity.y).toBeCloseTo(55*Math.pow(1-rat.entity.body.linearDamping,1/60)-25/60,5);
    for(const clear of ['landing','death','respawn']){
        jump();
        if(clear==='landing'){
            rat.entity.body.velocity.y=0;world.contacts.push(contact);rat.syncAfterPhysics(1/60);world.contacts.length=0;
        }else if(clear==='death')rat.entity.dead=true;
        else{rat.entity.respawn({x:0,y:0,z:0,hp:3});rat.resetGrounding();}
        rat.prepareMovement(1/60,{});expect(rat.entity.body.force.y,clear).toBe(0);
    }
    rat.dispose();
});

it('uses proportional touch movement and clamps combined keyboard/stick input to ordinary speed', () => {
    const rat = new RatController(new THREE.Scene(), new CANNON.World(), new THREE.PerspectiveCamera());
    rat.prepareMovement(1 / 60, {}, {x:0,y:.5,jump:false});
    expect(rat.entity.body.velocity.z).toBeCloseTo(9*.28);
    rat.entity.body.velocity.setZero();
    rat.prepareMovement(1 / 60, {KeyW:true,KeyD:true}, {x:1,y:1,jump:false});
    expect(Math.hypot(rat.entity.body.velocity.x,rat.entity.body.velocity.z)).toBeCloseTo(18*.28);
    rat.dispose();
});
it('touch jump has the same grounded impulse and cannot jump again in midair', () => {
    const world=new CANNON.World(),rat=new RatController(new THREE.Scene(),world,new THREE.PerspectiveCamera());
    const floor=new CANNON.Body({mass:0}),contact=new CANNON.ContactEquation(floor,rat.entity.body);contact.ni.set(0,1,0);world.contacts.push(contact);
    rat.syncAfterPhysics(1/60);rat.prepareMovement(1/60,{}, {x:0,y:0,jump:true});
    expect(rat.entity.body.velocity.y).toBeCloseTo(16*Math.sqrt(1.28));
    world.contacts.length=0;rat.entity.body.velocity.y=0;rat.prepareMovement(1/60,{}, {x:0,y:0,jump:true});
    expect(rat.entity.body.velocity.y).toBe(0);rat.dispose();
});
