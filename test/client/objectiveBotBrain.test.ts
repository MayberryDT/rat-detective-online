import { describe, expect, it, vi } from 'vitest';
import { ObjectiveBotBrain, type ObjectiveNavigation } from '../../src/shared/ObjectiveBotBrain';
import { createPlayer } from '../../src/worker/gameState';
import { DEFAULT_APPEARANCE } from '../../src/shared/ratAppearance';
import type { Vec3Data } from '../../src/shared/networkProtocol';
import { DISPATCH_STATIONS, type ChaosState } from '../../src/shared/chaosState';
import { createAssignment, destinationPoint, CHAIN_ROUTE } from '../../src/shared/assignments';

const player=(id:string,x:number,z=0)=>createPlayer(id,id,DEFAULT_APPEARANCE,{x,y:0,z});
function state(owner:string|null=null):ChaosState {
    return {time:1000,case:{owner,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:40,y:0,z:0},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''}};
}
function fixture(seed=0){
    const navigation:ObjectiveNavigation={route:vi.fn((_from,to)=>[{...to}]),explorationTargets:()=>Array.from({length:24},(_,i)=>({x:i*4+20,y:i%2?-7:0,z:60}))};
    return {brain:new ObjectiveBotBrain(navigation,seed,()=>.5),navigation,self:player('me',0),near:player('near',0,8),holder:player('holder',35)};
}
function aimedNear(shot:Vec3Data|undefined,self:Vec3Data,target:Vec3Data){
    expect(shot).toBeDefined();
    const a={x:shot!.x-self.x,y:shot!.y-self.y-.9,z:shot!.z-self.z};
    const b={x:target.x-self.x,y:target.y-self.y,z:target.z-self.z};
    const cosine=(a.x*b.x+a.y*b.y+a.z*b.z)/(Math.hypot(a.x,a.y,a.z)*Math.hypot(b.x,b.y,b.z));
    expect(cosine).toBeGreaterThan(Math.cos(9*Math.PI/180));
    expect(cosine).toBeLessThan(.9999);
}
describe('case-first normal match bots',()=>{
    it('carries through the active verification approach while retaining combat',()=>{
        const {brain,self,near,navigation}=fixture(),s=state('me');
        s.assignment=createAssignment('chain-of-custody',0);s.assignment.destinations=[...CHAIN_ROUTE];s.assignment.phase='active';
        brain.step(3000,self,[self,near],s,()=>true,false,true);
        expect(brain.objective).toBe('delivery');
        expect(navigation.route).toHaveBeenLastCalledWith(expect.any(Object),destinationPoint('icebox'));
        Object.assign(self,destinationPoint('icebox'));
        brain.step(3500,self,[self,near],s,()=>true,false,true);
        expect(navigation.route).toHaveBeenLastCalledWith(expect.any(Object),destinationPoint('icebox',false));
        s.assignment.deliverySerial=1;brain.step(3510,self,[self,near],s,()=>true,false,true);
        expect(navigation.route).toHaveBeenLastCalledWith(expect.any(Object),destinationPoint('maintenance'));
        s.assignment.phase='suspended';s.case.owner=null;s.dispatch={phase:'active',incident:'evidence-tampering',serial:1,started:3500,until:28500};
        brain.step(3520,self,[self,near],s,()=>true,false,true);
        expect(brain.objective).not.toBe('delivery');expect(brain.objective).not.toBe('case');
    });
    it('fights with the case in Excessive Force and keeps Closing Time mobile',()=>{
        const {brain,self,near}=fixture(),s=state('me');
        s.assignment=createAssignment('excessive-force',0);s.assignment.phase='active';
        brain.step(3000,self,[self,near],s,()=>true,false,true);
        expect(brain.objective).toBe('combat');
        s.assignment=createAssignment('closing-time',0);s.assignment.phase='active';
        brain.step(3010,self,[self,near],s,()=>true,false,true);expect(brain.objective).toBe('combat');
    });
    it('walks to the loose case while opportunistically shooting a visible enemy',()=>{
        const {brain,self,near}=fixture();
        const intent=brain.step(1000,self,[self,near],state(),()=>true,false,true);
        expect(brain.objective).toBe('case');expect(intent.x).toBeCloseTo(6.5);expect(intent.z).toBeCloseTo(0);
        expect(intent.shoot).toBeUndefined();
        aimedNear(brain.step(1500,self,[self,near],state(),()=>true,false,true).shoot,self,near);
    });
    it('immediately switches to the carrier and prefers shooting them over a nearer enemy',()=>{
        const {brain,self,near,holder,navigation}=fixture();
        brain.step(1000,self,[self,near,holder],state(),()=>true,false,true);
        const intent=brain.step(1010,self,[self,near,holder],state('holder'),()=>true,false,true);
        expect(brain.objective).toBe('carrier');expect(navigation.route).toHaveBeenLastCalledWith({x:self.x,y:self.y,z:self.z},holder);
        const later=brain.step(4000,self,[self,near,holder],state('holder'),()=>true,false,true);
        aimedNear(later.shoot,self,holder);expect(Math.abs(intent.facing-Math.PI/2)).toBeLessThan(.15);
    });
    it('pursues an unseen carrier via navigation but never shoots through walls',()=>{
        const {brain,self,holder}=fixture();
        const intent=brain.step(1000,self,[self,holder],state('holder'),()=>false,false,true);
        expect(brain.objective).toBe('carrier');expect(intent.x).toBeGreaterThan(0);expect(intent.shoot).toBeUndefined();
    });
    it('engages a visible enemy when carrying the case itself',()=>{
        const {brain,self,near}=fixture();
        const intent=brain.step(1000,self,[self,near],state('me'),()=>true,false,true);
        expect(brain.objective).toBe('combat');expect(intent.shoot).toBeUndefined();
    });
    it('uses distinct exploration destinations without visible enemies or an available case',()=>{
        const a=fixture(0),b=fixture(1),returning=state();returning.case.returningUntil=2000;
        a.brain.step(1000,a.self,[a.self],returning,()=>false,false,true);
        b.brain.step(1000,b.self,[b.self],returning,()=>false,false,true);
        expect(a.brain.objective).toBe('explore');expect(b.brain.objective).toBe('explore');
        expect(vi.mocked(a.navigation.route).mock.calls[0][1]).not.toEqual(vi.mocked(b.navigation.route).mock.calls[0][1]);
    });
    it('respects the former-carrier pickup delay and immediately drops old plans after reset',()=>{
        const {brain,self,near,navigation}=fixture(),loose=state();loose.case.previousOwner='me';loose.case.pickupAfter=1500;
        brain.step(1000,self,[self,near],loose,()=>true,false,true);expect(brain.objective).toBe('combat');
        loose.time=2000;brain.step(2000,self,[self,near],loose,()=>true,false,true);expect(brain.objective).toBe('case');
        brain.reset();loose.case.p={x:-40,y:0,z:0};brain.step(2010,self,[self,near],loose,()=>true,false,true);
        expect(navigation.route).toHaveBeenLastCalledWith({x:self.x,y:self.y,z:self.z},loose.case.p);
    });
    it('waits for navigation instead of walking straight through blocked geometry',()=>{
        const {brain,self,navigation}=fixture();vi.mocked(navigation.route).mockReturnValue([]);
        const intent=brain.step(1000,self,[self],state(),()=>false,false,true);
        expect(intent.x).toBe(0);expect(intent.z).toBe(0);
    });
    it('does not replan every physics tick and refuses to act while dead',()=>{
        const {brain,self,navigation}=fixture();
        for(let t=1000;t<1400;t+=16)brain.step(t,self,[self],state(),()=>false,false,true);
        expect(navigation.route).toHaveBeenCalledTimes(1);
        self.hp=0;expect(brain.step(5000,self,[self],state(),()=>true,false,true)).toMatchObject({x:0,z:0,jump:false});
    });
    it('polls stable pending endpoints despite physical drift and never runs stuck recovery while waiting',()=>{
        const {brain,self,navigation}=fixture(),loose=state();vi.mocked(navigation.route).mockReturnValue([]);
        brain.step(1000,self,[self],loose,()=>false,false,true);
        const originalFrom={x:self.x,y:self.y,z:self.z},originalTo={...loose.case.p};
        for(let t=1250;t<=4250;t+=250){
            self.x+=.03;loose.case.p.x+=.03;
            expect(brain.step(t,self,[self],loose,()=>false,true,true)).toMatchObject({x:0,z:0,jump:false});
        }
        expect(navigation.route).toHaveBeenCalledTimes(14);
        for(const [from,to] of vi.mocked(navigation.route).mock.calls){expect(from).toEqual(originalFrom);expect(to).toEqual(originalTo);}
        vi.mocked(navigation.route).mockReturnValue([{x:20,y:0,z:0}]);
        expect(brain.step(4500,self,[self],loose,()=>false,false,true).x).toBeGreaterThan(0);
    });
    it('replaces a pending goal only for meaningful movement and bounds replacement frequency',()=>{
        const {brain,self,navigation}=fixture(),loose=state();vi.mocked(navigation.route).mockReturnValue([]);
        brain.step(1000,self,[self],loose,()=>false,false,true);
        loose.case.p.x=80;brain.step(1250,self,[self],loose,()=>false,false,true);
        expect(vi.mocked(navigation.route).mock.calls.at(-1)?.[1].x).toBe(40);
        brain.step(2000,self,[self],loose,()=>false,false,true);
        expect(vi.mocked(navigation.route).mock.calls.at(-1)?.[1].x).toBe(80);
    });
    it('shoots a visible ready Dispatch button in a quiet stretch, then prioritizes an enemy',()=>{
        const {brain,self,near}=fixture(),loose=state(),target=DISPATCH_STATIONS[0].target;
        self.x=target.x;self.z=target.z+12;
        const clearControl=vi.fn(()=>true);
        const intent=brain.step(1000,self,[self],loose,()=>true,false,true,clearControl);
        expect(brain.objective).toBe('case');expect(intent.shoot).toEqual({x:target.x,y:target.y,z:target.z});
        expect(clearControl).toHaveBeenCalledWith(target);expect(Math.hypot(intent.x,intent.z)).toBeCloseTo(6.5);
        loose.dispatch.phase='active';
        expect(brain.step(1600,self,[self,near],loose,()=>true,false,true,clearControl).shoot).toBeUndefined();
        const next=brain.step(2100,self,[self,near],loose,()=>true,false,true,clearControl);
        aimedNear(next.shoot,self,near);
    });
    it('does not shoot a blocked Dispatch target and fires visible enemies more frequently',()=>{
        const {brain,self,near}=fixture(),loose=state(),target=DISPATCH_STATIONS[0].target;
        self.x=target.x;self.z=target.z+12;
        const first=brain.step(1000,self,[self,near],loose,()=>true,false,true,()=>false);
        expect(first.shoot).toBeUndefined();
        expect(brain.step(1550,self,[self,near],loose,()=>true,false,true,()=>false).shoot).toBeDefined();
    });
    it('leaves an impossible loose case after six seconds, keeps shooting, and retries after the suppression expires',()=>{
        const {brain,self,near,navigation}=fixture(),loose=state();
        vi.mocked(navigation.route).mockImplementation((_from,to)=>to.x===40?[]:[{...to}]);
        brain.step(1000,self,[self,near],loose,()=>true,false,true);expect(brain.navigationStalled).toBe(true);
        const fallback=brain.step(7000,self,[self,near],loose,()=>true,false,true);
        expect(brain.objective).toBe('combat');expect(fallback.z).toBeGreaterThan(0);expect(fallback.shoot).toBeDefined();
        expect(brain.navigationStalled).toBe(false);expect(brain.failedCasePosition).toEqual(loose.case.p);
        brain.step(18500,self,[self,near],loose,()=>true,false,true);expect(brain.objective).toBe('combat');
        brain.step(19000,self,[self,near],loose,()=>true,false,true);expect(brain.objective).toBe('case');
        expect(brain.navigationStalled).toBe(true);
    });
    it('falls back from an unreachable carrier without selecting that same rat again as a combat destination',()=>{
        const {brain,self,near,holder,navigation}=fixture();
        vi.mocked(navigation.route).mockImplementation((_from,to)=>to.x===holder.x?[]:[{...to}]);
        brain.step(1000,self,[self,near,holder],state('holder'),()=>true,false,true);
        const fallback=brain.step(7000,self,[self,near,holder],state('holder'),()=>true,false,true);
        expect(brain.objective).toBe('combat');expect(navigation.route).toHaveBeenLastCalledWith({x:0,y:0,z:0},near);
        aimedNear(fallback.shoot,self,holder); // Still shoot the visible carrier even when their route failed.
        expect(brain.navigationStalled).toBe(false);expect(brain.failedCasePosition).toBeUndefined();
    });
    it('retries a moved case early and clears its failure vote once a valid case route exists',()=>{
        const {brain,self,near,navigation}=fixture(),loose=state();vi.mocked(navigation.route).mockReturnValue([]);
        brain.step(1000,self,[self,near],loose,()=>true,false,true);brain.step(7000,self,[self,near],loose,()=>true,false,true);
        expect(brain.failedCasePosition).toEqual({x:40,y:0,z:0});
        loose.case.p={x:52,y:0,z:0};vi.mocked(navigation.route).mockImplementation((_from,to)=>[{...to}]);
        brain.step(7010,self,[self,near],loose,()=>true,false,true);
        expect(brain.objective).toBe('case');expect(brain.failedCasePosition).toBeUndefined();expect(brain.navigationStalled).toBe(false);
    });
    it('retries a moved carrier before the old failed position cooldown expires',()=>{
        const {brain,self,near,holder,navigation}=fixture(),carried=state('holder');vi.mocked(navigation.route).mockReturnValue([]);
        brain.step(1000,self,[self,near,holder],carried,()=>true,false,true);brain.step(7000,self,[self,near,holder],carried,()=>true,false,true);
        holder.x+=12;vi.mocked(navigation.route).mockImplementation((_from,to)=>[{...to}]);
        brain.step(7500,self,[self,near,holder],carried,()=>true,false,true);expect(brain.objective).toBe('carrier');expect(brain.navigationStalled).toBe(false);
    });
    it('cycles failed combat destinations and explores when every visible enemy route has failed',()=>{
        const {brain,self,near,holder,navigation}=fixture();vi.mocked(navigation.route).mockImplementation((_from,to)=>to.z===60?[{...to}]:[]);
        brain.step(1000,self,[self,near,holder],state('me'),()=>true,false,true);
        brain.step(7000,self,[self,near,holder],state('me'),()=>true,false,true);
        expect(brain.objective).toBe('combat');expect(navigation.route).toHaveBeenLastCalledWith({x:0,y:0,z:0},holder);
        const exploring=brain.step(13000,self,[self,near,holder],state('me'),()=>true,false,true);
        expect(brain.objective).toBe('explore');expect(brain.navigationStalled).toBe(false);expect(exploring.shoot).toBeUndefined();
        aimedNear(brain.step(13700,self,[self,near,holder],state('me'),()=>true,false,true).shoot,self,near);
    });
    it('bounds repeated failures when every goal is unreachable and reports continuous navigation stalls',()=>{
        const {brain,self,near,navigation}=fixture();vi.mocked(navigation.route).mockReturnValue([]);
        let shots=0;
        for(let now=1000;now<=41000;now+=250){
            const intent=brain.step(now,self,[self,near],state(),()=>true,false,true);
            expect(brain.navigationStalled).toBe(true);expect(intent.x).toBe(0);expect(intent.z).toBe(0);
            if(intent.shoot)shots++;
        }
        const destinations=new Set(vi.mocked(navigation.route).mock.calls.map(([,to])=>`${to.x},${to.z}`));
        expect(destinations.size).toBeGreaterThan(2);
        expect(vi.mocked(navigation.route).mock.calls.length).toBeLessThan(165);expect(shots).toBeGreaterThan(30);
    });
    it('handles an empty exploration inventory and clears failure state on ownership change/reset',()=>{
        const navigation:ObjectiveNavigation={route:vi.fn(()=>[]),explorationTargets:()=>[]};
        const brain=new ObjectiveBotBrain(navigation,0,()=>.5),self=player('me',0),loose=state();
        brain.step(1000,self,[self],loose,()=>false,false,true);brain.step(7000,self,[self],loose,()=>false,false,true);
        expect(brain.objective).toBe('explore');expect(brain.navigationStalled).toBe(true);expect(brain.failedCasePosition).toEqual(loose.case.p);
        brain.step(7010,self,[self],state('me'),()=>false,false,true);expect(brain.failedCasePosition).toBeUndefined();
        brain.reset();expect(brain.navigationStalled).toBe(false);expect(brain.failedCasePosition).toBeUndefined();
    });
    it('chooses the nearest available case across the primary and three extras',()=>{
        const {brain,self,navigation}=fixture(),primary=state();
        const multiple={...primary,extraCases:[
            {...primary.case,id:'extra-a',p:{x:25,y:0,z:0}},
            {...primary.case,id:'extra-b',p:{x:-8,y:0,z:0}},
            {...primary.case,id:'extra-c',p:{x:60,y:0,z:0}},
        ]};
        const intent=brain.step(1000,self,[self],multiple,()=>false,false,true);
        expect(brain.objective).toBe('case');expect(intent.x).toBeLessThan(0);
        expect(navigation.route).toHaveBeenLastCalledWith({x:0,y:0,z:0},multiple.extraCases[1].p);
    });
    it('falls through an unreachable primary to an extra and preserves the primary failure vote',()=>{
        const {brain,self,navigation}=fixture(),primary=state();
        const multiple={...primary,extraCases:[{...primary.case,id:'extra-a',p:{x:60,y:0,z:0}}]};
        vi.mocked(navigation.route).mockImplementation((_from,to)=>to.x===40?[]:[{...to}]);
        brain.step(1000,self,[self],multiple,()=>false,false,true);
        brain.step(7000,self,[self],multiple,()=>false,false,true);
        expect(brain.objective).toBe('case');expect(brain.navigationStalled).toBe(false);
        expect(navigation.route).toHaveBeenLastCalledWith({x:0,y:0,z:0},multiple.extraCases[0].p);
        expect(brain.failedCasePosition).toEqual(primary.case.p);
        multiple.extraCases[0].owner='someone';brain.step(7010,self,[self],multiple,()=>false,false,true);
        expect(brain.failedCasePosition).toEqual(primary.case.p); // Another case's pickup cannot erase this vote.
    });
    it('keeps extra-case suppression keyed by stable ID and never reports it as a failed primary',()=>{
        const {brain,self,navigation}=fixture(),primary=state();
        const a={...primary.case,id:'extra-a',p:{x:8,y:0,z:0}},b={...primary.case,id:'extra-b',p:{x:-12,y:0,z:0}};
        const multiple={...primary,extraCases:[a,b]};vi.mocked(navigation.route).mockImplementation((_from,to)=>to.x===8?[]:[{...to}]);
        brain.step(1000,self,[self],multiple,()=>false,false,true);
        multiple.extraCases=[b,a];brain.step(7000,self,[self],multiple,()=>false,false,true);
        expect(navigation.route).toHaveBeenLastCalledWith({x:0,y:0,z:0},b.p);expect(brain.failedCasePosition).toBeUndefined();
    });
    it('does not collect a second case when carrying any extra',()=>{
        const {brain,self,near,navigation}=fixture(),primary=state();
        const multiple={...primary,extraCases:[{...primary.case,id:'extra-a',owner:self.id,p:{x:1,y:0,z:0}}]};
        const intent=brain.step(1000,self,[self,near],multiple,()=>true,false,true);
        expect(brain.objective).toBe('combat');expect(intent.shoot).toBeUndefined();
        expect(navigation.route).toHaveBeenLastCalledWith({x:0,y:0,z:0},near);
    });
    it('hunts the nearest extra-case carrier and prioritizes their visible shot over an ordinary rat',()=>{
        const {brain,self,near,holder,navigation}=fixture(),primary=state('distant');
        const distant=player('distant',60),multiple={...primary,extraCases:[{...primary.case,id:'extra-a',owner:holder.id}]};
        const intent=brain.step(1000,self,[self,near,holder,distant],multiple,()=>true,false,true);
        expect(brain.objective).toBe('carrier');expect(navigation.route).toHaveBeenLastCalledWith({x:0,y:0,z:0},holder);
        expect(intent.shoot).toBeUndefined();
        aimedNear(brain.step(1500,self,[self,near,holder,distant],multiple,()=>true,false,true).shoot,self,holder);
    });
    it('reacts immediately to an extra being released and respects that case former-carrier delay',()=>{
        const {brain,self,holder,navigation}=fixture(),primary=state(holder.id);
        const extra:ChaosState['case']&{id:string}={...primary.case,id:'extra-a',owner:holder.id,p:{x:-10,y:0,z:0}};
        const multiple={...primary,extraCases:[extra]};
        brain.step(1000,self,[self,holder],multiple,()=>true,false,true);expect(brain.objective).toBe('carrier');
        extra.owner=null;extra.previousOwner=self.id;extra.pickupAfter=1500;
        brain.step(1010,self,[self,holder],multiple,()=>true,false,true);expect(brain.objective).toBe('carrier');
        multiple.time=1600;brain.step(1600,self,[self,holder],multiple,()=>true,false,true);
        expect(brain.objective).toBe('case');expect(navigation.route).toHaveBeenLastCalledWith({x:0,y:0,z:0},extra.p);
    });
    it('moves along a checked local step during a pending route and caches geometry checks for 150 ms',()=>{
        const {brain,self,navigation}=fixture();vi.mocked(navigation.route).mockReturnValue([]);
        navigation.localStep=vi.fn(()=>({x:2,y:0,z:0}));
        for(let now=1000;now<1150;now+=10){
            expect(brain.step(now,self,[self],state(),()=>false,false,true).x).toBe(6.5);
            expect(brain.navigationStalled).toBe(false);
        }
        expect(navigation.localStep).toHaveBeenCalledTimes(1);
        brain.step(1150,self,[self],state(),()=>false,false,true);expect(navigation.localStep).toHaveBeenCalledTimes(2);
    });
    it('keeps a usable old waypoint while a moved-case replacement route is pending',()=>{
        const {brain,self,navigation}=fixture(),loose=state();
        vi.mocked(navigation.route).mockReturnValueOnce([{x:20,y:0,z:0},{x:40,y:0,z:0}]).mockReturnValue([]);
        brain.step(1000,self,[self],loose,()=>false,false,true);
        self.x=6;loose.case.p.x=70;
        const intent=brain.step(2500,self,[self],loose,()=>false,false,true);
        expect(navigation.route).toHaveBeenCalledTimes(2);expect(intent.x).toBe(6.5);expect(brain.navigationStalled).toBe(false);
    });
    it('trims a completed route to nearby progress instead of walking back to its old start',()=>{
        const {brain,self,navigation}=fixture();vi.mocked(navigation.route).mockReturnValue([]);
        navigation.localStep=vi.fn(from=>({x:from.x+2,y:0,z:0}));
        brain.step(1000,self,[self],state(),()=>false,false,true);
        self.x=8;
        vi.mocked(navigation.route).mockReturnValue(Array.from({length:21},(_,i)=>({x:i*2,y:0,z:0})));
        const intent=brain.step(1250,self,[self],state(),()=>false,false,true);
        expect(intent.x).toBe(6.5);expect(brain.navigationStalled).toBe(false);
    });
    it('continues pursuing a case beyond six seconds while local movement makes new net progress',()=>{
        const {brain,self,navigation}=fixture();vi.mocked(navigation.route).mockReturnValue([]);
        navigation.localStep=vi.fn(from=>({x:from.x+2,y:0,z:0}));
        for(let now=1000;now<=10000;now+=250){
            self.x=(now-1000)*.002;
            brain.step(now,self,[self],state(),()=>false,false,true);
            expect(brain.objective).toBe('case');expect(brain.failedCasePosition).toBeUndefined();
        }
    });
    it('does not count oscillating local movement as endless progress toward an unreachable case',()=>{
        const {brain,self,navigation}=fixture();vi.mocked(navigation.route).mockReturnValue([]);
        navigation.localStep=vi.fn(from=>({x:from.x+2,y:0,z:0}));
        for(let now=1000;now<=8500;now+=250){
            self.x=now%500===0?1:0;brain.step(now,self,[self],state(),()=>false,false,true);
        }
        expect(brain.failedCasePosition).toEqual(state().case.p);expect(brain.objective).toBe('explore');
    });
    it('does not label shared planner-budget denial a failed case search',()=>{
        const {brain,self,navigation}=fixture();vi.mocked(navigation.route).mockReturnValue(undefined);
        for(let now=1000;now<=14000;now+=250)brain.step(now,self,[self],state(),()=>false,false,true);
        expect(brain.objective).toBe('case');expect(brain.failedCasePosition).toBeUndefined();expect(brain.navigationStalled).toBe(true);
    });
    it('keeps roof/no-support local failures stopped and prefers a nearby exploration location',()=>{
        const navigation:ObjectiveNavigation={route:vi.fn(()=>[]),localStep:vi.fn(()=>undefined),explorationTargets:()=>[
            {x:200,y:0,z:200},{x:8,y:0,z:0},{x:-200,y:0,z:-200},
        ]};
        const brain=new ObjectiveBotBrain(navigation,0,()=>.5),self=player('me',0);
        const intent=brain.step(1000,self,[self],state('me'),()=>false,false,true);
        expect(navigation.route).toHaveBeenCalledWith({x:0,y:0,z:0},{x:8,y:0,z:0});
        expect(intent.x).toBe(0);expect(intent.z).toBe(0);expect(brain.navigationStalled).toBe(true);
    });
});

it('sprints along short flat navigation cells, slows at pickup, and does not blast the nearby case away',()=>{
 const {brain,self,navigation}=fixture(),s=state();s.assignment=createAssignment('excessive-force',0);s.assignment.phase='active';
 vi.mocked(navigation.route).mockReturnValue([{x:2,y:0,z:0},{x:4,y:0,z:0},{x:40,y:0,z:0}]);
 expect(brain.step(1000,self,[self],s,()=>false,false,true).x).toBe(12);
 brain.reset();s.case.p.x=4;
 for(let now=2000;now<8000;now+=100){const intent=brain.step(now,self,[self],s,()=>false,false,true);expect(Math.hypot(intent.x,intent.z)).toBeLessThanOrEqual(6.5);expect(intent.shoot).toBeUndefined();}
});
it('takes the Closing case away from visible danger while still returning fire',()=>{
 const self=player('me',0),enemy=player('enemy',10),s=state('me');s.assignment=createAssignment('closing-time',0);s.assignment.phase='active';
 const nav:ObjectiveNavigation={route:vi.fn((_from,to)=>[to]),explorationTargets:()=>[{x:-25,y:0,z:0},{x:25,y:0,z:0}]};
 const brain=new ObjectiveBotBrain(nav,1,()=>.5);
 expect(brain.step(1000,self,[self,enemy],s,()=>true,false,true).x).toBe(-12);expect(brain.objective).toBe('evade');
 expect(brain.step(1500,self,[self,enemy],s,()=>true,false,true).shoot).toBeDefined();
});
it('intercepts a distant Chain carrier at the next landmark when already closer to it',()=>{
 const {brain,self,holder,navigation}=fixture(0),s=state('holder');s.assignment=createAssignment('chain-of-custody',0);s.assignment.phase='active';s.assignment.destinations=[...CHAIN_ROUTE];
 Object.assign(self,destinationPoint('icebox'));self.x-=8;holder.x=-100;holder.z=-100;
 brain.step(1000,self,[self,holder],s,()=>false,false,true);
 expect(brain.objective).toBe('intercept');expect(navigation.route).toHaveBeenLastCalledWith(expect.any(Object),destinationPoint('icebox'));
 s.assignment.deliverySerial=1;brain.step(1010,self,[self,holder],s,()=>false,false,true);
 expect(vi.mocked(navigation.route).mock.calls.at(-1)?.[1]).not.toEqual(destinationPoint('icebox'));
});
