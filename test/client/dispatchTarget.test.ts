import {it,expect,vi,afterEach} from 'vitest';
import * as THREE from 'three';
import {DispatchPillars} from '../../src/presentation/DispatchPillars';
import {DispatchAudio} from '../../src/audio/DispatchAudio';
import {DISPATCH_STATIONS,type ChaosState} from '../../src/shared/chaosState';

afterEach(()=>vi.restoreAllMocks());
const dispatch=(phase:ChaosState['dispatch']['phase'],until=0):ChaosState['dispatch']=>({phase,started:0,until,serial:1,incident:'crossfire'});

it('shows every bell and housing filling its authoritative target, and the post inside its collision box',()=>{
 const scene=new THREE.Scene(),pillars=new DispatchPillars(scene);scene.updateMatrixWorld(true);
 for(const station of DISPATCH_STATIONS){
  const base=scene.getObjectByName('dispatch-'+station.id)!,housing=base.getObjectByName('dispatch-bell-housing')!,t=station.target,b=station.box;
  const bounds=new THREE.Box3().setFromObject(housing,true),size=bounds.getSize(new THREE.Vector3()),centre=bounds.getCenter(new THREE.Vector3());
  for(const [shown,real] of [[size.x,t.w],[size.y,t.h],[size.z,t.d]] as const){expect(shown).toBeGreaterThan(real*.85);expect(shown).toBeLessThan(real*1.1);}
  expect(centre.distanceTo(new THREE.Vector3(t.x,t.y,t.z))).toBeLessThan(.35);
  const post=new THREE.Box3();
  for(const child of base.getObjectByName('dispatch-post')!.children)if(child!==housing&&child.visible)post.expandByObject(child,true);
  expect(post.min.y).toBeGreaterThanOrEqual(station.y-.01);expect(post.max.y).toBeLessThanOrEqual(t.y+t.h/2);
  // The call box's corners may poke a hand's width past the square box when the pillar is turned.
  for(const axis of ['x','z'] as const){expect(post.min[axis]).toBeGreaterThanOrEqual(b[axis]-b.w/2-.15);expect(post.max[axis]).toBeLessThanOrEqual(b[axis]+b.w/2+.15);}
 }
 pillars.dispose();
});

it('rings and sweeps red only while the line is open or rolling; a busy line is still and dark',()=>{
 const scene=new THREE.Scene(),pillars=new DispatchPillars(scene);
 const visible=(name:string)=>DISPATCH_STATIONS.filter(s=>scene.getObjectByName('dispatch-'+s.id)!.getObjectByName(name)!.visible).length;
 let everRang=0;
 for(let now=0;now<4000;now+=50){pillars.update(dispatch('ready'),now);everRang=Math.max(everRang,visible('dispatch-hammer-blur'));}
 expect(everRang).toBeGreaterThan(0);expect(visible('dispatch-beacon-beams')).toBe(DISPATCH_STATIONS.length);
 pillars.update(dispatch('rolling',10_000),5000);expect(visible('dispatch-hammer-blur')).toBe(DISPATCH_STATIONS.length);
 for(let now=20_000;now<26_000;now+=50){pillars.update(dispatch('cooldown',60_000),now);expect(visible('dispatch-hammer-blur')).toBe(0);}
 expect(visible('dispatch-beacon-beams')).toBe(0);
 pillars.dispose();
});

it('whoops only from the nearest two ready pillars in range, and not at all once the line is busy',()=>{
 const siren=vi.spyOn(DispatchAudio.prototype,'siren');
 const scene=new THREE.Scene(),pillars=new DispatchPillars(scene),camera=new THREE.PerspectiveCamera();
 const first=DISPATCH_STATIONS[0]!;camera.position.set(first.x+6,first.y+2,first.z+6);camera.updateMatrixWorld(true);
 const audible=()=>siren.mock.calls.filter(([,volume])=>volume>0).map(([,volume])=>volume);
 pillars.update(dispatch('ready'),1000,camera);
 const inRange=DISPATCH_STATIONS.filter(s=>camera.position.distanceTo(new THREE.Vector3(s.target.x,s.target.y,s.target.z))<85).length;
 expect(audible()).toHaveLength(Math.min(2,inRange));expect(audible()[0]).toBeGreaterThan(.2);
 siren.mockClear();pillars.update(dispatch('rolling',9000),2000,camera);expect(audible()).toHaveLength(0);
 pillars.dispose();
});
