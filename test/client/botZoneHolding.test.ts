import {expect,it,vi} from 'vitest';
import {BotZoneHolding,zoneStepSafe} from '../../src/shared/BotZoneHolding';
import {JURISDICTION_ZONES,zoneContains} from '../../src/shared/jurisdictionZones';
import {ObjectiveBotBrain,type ObjectiveNavigation} from '../../src/shared/ObjectiveBotBrain';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createAssignment} from '../../src/shared/assignments';
import {activeZone,rotateZone} from '../../src/shared/jurisdiction';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
it('rejects shortcuts over the sewer missing corner and excluded pump machinery',()=>{
 expect(zoneStepSafe('sewer-junction',{x:10,y:-7,z:0},{x:0,y:-7,z:10})).toBe(false);
 expect(zoneStepSafe('pump-floor',{x:125,y:0,z:113},{x:136,y:0,z:113})).toBe(false);
 expect(zoneStepSafe('sewer-junction',{x:0,y:-7,z:0},{x:2,y:-7,z:0})).toBe(true);
 expect(zoneStepSafe('records-forecourt',{x:-4.05,y:0,z:-27},{x:-6.5,y:0,z:-27})).toBe(true);
 expect(zoneStepSafe('records-forecourt',{x:-4.05,y:0,z:-27},{x:-3,y:0,z:-27})).toBe(false);
});
it('varies quiet activity across seeds, limits local work and rejects unsupported steps and jumps under a ceiling',()=>{
 const self={x:0,y:-7,z:0},nav={localStep:vi.fn((_from,to)=>to),route:vi.fn(),explorationTargets:()=>[]} as ObjectiveNavigation;
 const traces=[];
 for(let seed=0;seed<8;seed++){
  const hold=new BotZoneHolding(seed),samples=[];
  for(let t=1000;t<15000;t+=50){const intent=hold.step(t,'sewer-junction','round',self,undefined,true,nav,()=>false);expect(intent.jump).toBe(false);samples.push([intent.x,intent.z,intent.facing]);}
  traces.push(JSON.stringify(samples));
 }
 expect(new Set(traces).size).toBe(8);expect(nav.route).not.toHaveBeenCalled();expect(vi.mocked(nav.localStep!).mock.calls.length).toBeLessThan(8*14*6);
 const blocked={...nav,localStep:()=>undefined},hold=new BotZoneHolding(0);
 expect(hold.step(1000,'sewer-junction','round',self,undefined,true,blocked,()=>false)).toMatchObject({x:0,z:0,jump:false});
});
it('keeps final counterfeit avoidance inside the zone and transitions on case loss, death and relocation',()=>{
 const a=createAssignment('jurisdiction',1000,'transition',()=>.3);a.liveAt=1000;a.phase='active';const j=a.jurisdiction!,id=activeZone(j),p=JURISDICTION_ZONES[id].posts[0];
 const self=createPlayer('self','Self',DEFAULT_APPEARANCE,p),other=createPlayer('other','Other',DEFAULT_APPEARANCE,{...p,x:p.x+8});
 const sim=new ChaosSimulation(new Map([[self.id,self],[other.id,other]]),()=>{},undefined,{seed:341283204,version:2});sim.setAssignment(a);
 const s=sim.snapshot(false);s.case.owner=self.id;s.pickups=[];
 const nav:ObjectiveNavigation={route:(_from,to)=>[to],localStep:(_from,to)=>to,explorationTargets:()=>[p]};const brain=new ObjectiveBotBrain(nav,2,()=>.3);
 for(let t=1000;t<3000;t+=50){
  s.extraCases=[{...s.case,id:'fake',fake:true,owner:null,p:{x:self.x+1,y:self.y,z:self.z+1}}];
  const intent=brain.step(t,self,[other],s,()=>true,false,true);
  expect(brain.objective).toBe('zone-hold');expect(zoneContains(id,{x:self.x+intent.x*.35,y:self.y,z:self.z+intent.z*.35})).toBe(true);
 }
 self.hp=0;expect(brain.step(3010,self,[other],s,()=>true,false,true)).toMatchObject({x:0,z:0,jump:false});
 self.hp=3;s.case.owner=other.id;brain.step(3020,self,[other],s,()=>true,false,true);expect(brain.objective).toBe('carrier');
 s.case.owner=self.id;rotateZone(s.assignment!.jurisdiction!,()=>.3);brain.step(3030,self,[other],s,()=>true,false,true);
 expect(brain.goalKey).toContain(activeZone(s.assignment!.jurisdiction!));expect(brain.goalKey).not.toContain(`:${id}:`);
});
