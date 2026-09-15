import {expect,it} from 'vitest';
import * as THREE from 'three';
import {RatController} from '../../src/player/RatController';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {CITY_BOUNDS} from '../../src/shared/grayboxLayout';
import {LAUNCH_MACHINES,type ChaosState} from '../../src/shared/chaosState';
import {CAMEO_LAYOUT} from '../../src/cameos/cameoLayout';

it.each([341283204,20260907,1])('lands beside Spider-rat from the geyser with normal player steering (seed %s)',seed=>{
    // Actual city/control colliders and player physics; inject only the ordinary
    // authority launch event. Trigger shooting itself is covered by launcher tests.
    const city=new ServerBotController({seed,version:2},[],{move:()=>{},shoot:()=>{}});
    const machine=LAUNCH_MACHINES.find(m=>m.id==='geyser')!;
    const spider=CAMEO_LAYOUT[0],landing={x:-138,z:23};
    const rat=new RatController(new THREE.Scene(),city.world,new THREE.PerspectiveCamera(),'',{},
        new THREE.Vector3(machine.pad.x,0,machine.pad.z),CITY_BOUNDS);
    try{
        rat.applyPressureLaunches({time:1000,pressure:{launches:[{
            id:'cameo-route',at:1000,playerId:'local',machineId:machine.id,velocity:machine.velocity,
        }]}} as ChaosState,'local');
        let cleared=false,landed=false,peak=0;
        for(let frame=0;frame<480;frame++){
            const p=rat.entity.body.position;
            cleared ||= p.y>spider.y+5;
            // Rise clear of the tower, steer onto its broad roof, then brake.
            const dx=cleared?landing.x-p.x:0,dz=cleared?landing.z-p.z:0;
            const divisor=Math.max(4,Math.hypot(dx,dz));
            rat.prepareMovement(1/60,{}, {x:-dx/divisor,y:dz/divisor,jump:false});
            city.world.step(1/60);rat.syncAfterPhysics(1/60);
            peak=Math.max(peak,p.y);
            if(cleared&&rat.grounded){landed=true;break;}
        }
        const p=rat.entity.body.position;
        expect({landed,y:p.y},JSON.stringify({peak,position:p})).toEqual({landed:true,y:expect.closeTo(spider.y,0)});
        expect(Math.hypot(p.x-spider.x,p.z-spider.z)).toBeLessThan(5);
        expect(peak).toBeGreaterThan(120);
    }finally{rat.dispose();city.dispose();}
},15_000);
