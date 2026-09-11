import {describe,it,expect} from 'vitest';
import {ChaosPresentation,type PresentationPose} from '../../src/shared/ChaosPresentation';
import {CHAOS_TUNING,type ChaosState} from '../../src/shared/chaosState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import type {ServerMessage} from '../../src/shared/networkProtocol';

const launch=(id='fired',at=1010):Extract<ServerMessage,{type:'playerShot'}>=>({type:'playerShot',shooterId:'rat',shotId:id,
    origin:{x:0,y:2,z:0},direction:{x:1,y:0,z:0},launch:{at,balls:[{id,velocity:{x:175,y:0,z:0}}]}});

const output=():PresentationPose=>({p:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1}});
function snapshot(time=1000,x=0):ChaosState {
    return {time,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x,y:1,z:0},v:{x:100,y:0,z:0},q:{x:0,y:0,z:0,w:1},spin:{x:0,y:0,z:0}},dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},corpses:[],shots:[{id:'ball',owner:'rat',p:{x,y:0,z:0},v:{x:100,y:0,z:0},age:time-1000}],impacts:[],notice:{serial:0,text:''}};
}
describe('bounded chaos presentation buffer',()=>{
    it('renders the real birth before the first travelled snapshot, then keeps one advancing ID',()=>{
        const view=new ChaosPresentation(),out=output(),state=snapshot();state.shots=[];view.apply(state,0);
        const born=launch();view.launch(born,40);
        const ids=()=>view.renderShots(state.shots,40).map(shot=>shot.id);
        expect(ids()).toEqual(['fired']);view.launch(born,45);expect(ids()).toEqual(['fired']);
        // The snapshot can land before the browser draws anything. It already
        // contains several units of flight; the first rendered sample must not.
        state.time=1060;state.shots=[{id:'fired',owner:'rat',p:{x:8.75,y:1.958,z:0},v:{x:175,y:-1.25,z:0},age:.05}];
        view.apply(state,70);expect(view.renderShots(state.shots,80)).toHaveLength(1);
        expect(view.shot('fired',80,out)).toBe(true);expect(out.p).toEqual(born.origin);
        let previous=out.p.x;
        for(let now=96;now<=160;now+=16){view.shot('fired',now,out);expect(out.p.x).toBeGreaterThan(previous);previous=out.p.x;}
        state.time=1200;state.shots=[];view.apply(state,200);view.launch(born,205);
        expect(view.renderShots([],205)).toHaveLength(0);expect(view.shot('fired',205,out)).toBe(false);
    });
    it('keeps actual crooked volley velocities, without inventing the requested straight shot',()=>{
        const view=new ChaosPresentation(),state=snapshot();state.shots=[];view.apply(state,0);
        const born=launch();born.launch!.balls=[{id:'fired',velocity:{x:170,y:28,z:30}},{id:'extra',velocity:{x:170,y:-28,z:-30}}];
        view.launch(born,10);const balls=view.renderShots([],10);
        expect(balls.map(ball=>ball.v)).toEqual(born.launch!.balls.map(ball=>ball.velocity));
        expect(balls.map(ball=>ball.p)).toEqual([born.origin,born.origin]);
    });
    it('honors a hit/removal or ricochet received before the first rendered frame',()=>{
        const view=new ChaosPresentation(),state=snapshot(),out=output();state.shots=[];view.apply(state,0);
        view.launch(launch(),10);state.time=1030;view.apply(state,30);
        expect(view.renderShots([],30)).toHaveLength(0);expect(view.shot('fired',30,out)).toBe(false);
        view.launch(launch('bounce',1040),40);state.time=1060;
        state.shots=[{id:'bounce',owner:'rat',p:{x:1,y:2,z:0},v:{x:-157.5,y:0,z:0},age:.02,wallBounced:true}];
        view.apply(state,60);view.shot('bounce',60,out);expect(out.p.x).toBe(1);
        view.shot('bounce',80,out);expect(out.p.x).toBe(1);
    });
    it('bounds unresolved birth events and clears them on stalled delivery or reconnect',()=>{
        const view=new ChaosPresentation(),state=snapshot(),out=output();state.shots=[];view.apply(state,0);
        for(let i=0;i<600;i++)view.launch(launch(`born-${i}`,1010+i),10);
        expect(view.renderShots([],10)).toHaveLength(CHAOS_TUNING.maxShots);
        expect(view.diagnostics().shots).toBe(CHAOS_TUNING.maxShots);
        expect(view.renderShots([],511)).toHaveLength(0);expect(view.shot('born-599',511,out)).toBe(false);
        view.launch(launch('before-reconnect',2000),600);view.clear();expect(view.renderShots([],601)).toHaveLength(0);
    });
    it('keeps the case interpolation clock continuous through frequent observed ricochets',()=>{
        const view=new ChaosPresentation(),out=output();let packet=0,previous=0,maxStep=0;
        for(let now=0;now<=3000;now+=1000/60){
            while(packet*25<=now){
                const time=packet*25,phase=time%300,positive=phase<150;
                const state=snapshot(1000+time,(positive?phase:300-phase)*.04);
                state.case.v.x=positive?40:-40;state.shots=[];view.apply(state,time);packet++;
            }
            view.looseCase(now,out);
            expect(out.p.x).toBeGreaterThanOrEqual(-.001);expect(out.p.x).toBeLessThanOrEqual(6.001);
            if(now>400){
                maxStep=Math.max(maxStep,Math.abs(out.p.x-previous));
                const phase=(now-75)%300,expected=(phase<150?phase:300-phase)*.04;
                expect(out.p.x).toBeCloseTo(expected,3);
            }
            previous=out.p.x;
        }
        expect(maxStep).toBeLessThan(.71);
    });
    it('shows new balls immediately and gradually acquires a 75 ms interpolation buffer',()=>{
        const view=new ChaosPresentation(),out=output();view.apply(snapshot(),0);
        expect(view.shot('ball',0,out)).toBe(true);expect(out.p.x).toBe(0);
        for(let i=1;i<=8;i++)view.apply(snapshot(1000+i*50,i*5),i*50);
        view.shot('ball',400,out);expect(out.p.x).toBeCloseTo(32.5);
        const next=snapshot(1450,45);next.shots.push({...next.shots[0],id:'new',p:{x:2,y:3,z:4}});
        view.apply(next,465);view.shot('new',465,out);expect(out.p).toEqual({x:2,y:3,z:4});
    });
    it('smooths deterministic arrival jitter without running positions backward',()=>{
        const view=new ChaosPresentation(),out=output(),arrivals=[0,60,90,165,198,265,300,360,405];
        let packet=0,previous=0,maxStep=0,oldPrevious=0,oldCorrection=0,correction=0;
        for(let time=0;time<=450;time+=5){
            while(packet<arrivals.length&&arrivals[packet]<=time){view.apply(snapshot(1000+packet*50,packet*5),arrivals[packet]);packet++;}
            view.shot('ball',time,out);expect(out.p.x).toBeGreaterThanOrEqual(previous-1e-8);
            const oldPosition=(packet-1)*5+Math.min(80,time-arrivals[packet-1])*.1;
            if(time){oldCorrection=Math.max(oldCorrection,Math.abs(oldPosition-oldPrevious-.5));correction=Math.max(correction,Math.abs(out.p.x-previous-.5));}
            oldPrevious=oldPosition;
            maxStep=Math.max(maxStep,out.p.x-previous);previous=out.p.x;
        }
        expect(maxStep).toBeLessThan(1.6);
        expect(correction).toBeLessThan(oldCorrection*.5);
    });
    it('caps starvation extrapolation at 80 ms and resets after a long gap',()=>{
        const view=new ChaosPresentation(),out=output();view.apply(snapshot(),0);view.apply(snapshot(1050,5),50);
        view.shot('ball',3000,out);expect(out.p.x).toBe(13);
        view.apply(snapshot(4000,300),3000);view.shot('ball',3000,out);expect(out.p.x).toBe(300);
    });
    it('removes expired objects immediately, never resurrecting a buffered ball',()=>{
        const view=new ChaosPresentation(),out=output();view.apply(snapshot(),0);view.apply(snapshot(1050,5),50);
        const removed=snapshot(1100,10);removed.shots=[];view.apply(removed,100);
        expect(view.shot('ball',100,out)).toBe(false);expect(view.shot('ball',500,out)).toBe(false);
        view.apply(snapshot(1150,200),150);view.shot('ball',150,out);expect(out.p.x).toBe(200);
    });
    it('snaps to a received bounce and never extrapolates the old incoming velocity through the wall',()=>{
        const view=new ChaosPresentation(),out=output();view.apply(snapshot(),0);view.apply(snapshot(1050,5),50);
        const bounced=snapshot(1100,4);bounced.shots[0].v.x=-100;bounced.shots[0].wallBounced=true;
        view.apply(bounced,100);view.shot('ball',100,out);expect(out.p.x).toBe(4);
        view.shot('ball',140,out);expect(out.p.x).toBe(4);
        const next=snapshot(1150,-1);next.shots[0].v.x=-100;next.shots[0].wallBounced=true;
        view.apply(next,150);view.shot('ball',150,out);expect(out.p.x).toBeLessThan(4);expect(out.p.x).toBeGreaterThan(-1);
    });
    it('resets case ownership and teleport discontinuities immediately',()=>{
        const view=new ChaosPresentation(),out=output();view.apply(snapshot(),0);
        const held=snapshot(1050,5);held.case.owner='carrier';view.apply(held,50);expect(view.looseCase(50,out)).toBe(false);
        view.apply(snapshot(1100,100),100);view.looseCase(100,out);expect(out.p.x).toBe(100);
        view.apply(snapshot(1150,-100),150);view.looseCase(150,out);expect(out.p.x).toBe(-100);
    });
    it('clears the old clock/history when the server clock goes backward',()=>{
        const view=new ChaosPresentation(),out=output();view.apply(snapshot(2000,100),0);view.shot('ball',300,out);
        view.apply(snapshot(500,-20),350);view.shot('ball',350,out);expect(out.p.x).toBe(-20);
        view.clear();expect(view.shot('ball',400,out)).toBe(false);
    });
    it('keeps bounded object counts even when an oversized snapshot is supplied',()=>{
        const view=new ChaosPresentation(),state=snapshot();
        state.shots=Array.from({length:CHAOS_TUNING.maxShots+100},(_,i)=>({...state.shots[0],id:String(i)}));
        view.apply(state,0);expect(view.diagnostics().shots).toBe(CHAOS_TUNING.maxShots);
    });
    it('interpolates normalized corpse orientation and removes the corpse immediately on expiry',()=>{
        const view=new ChaosPresentation(),out=output(),first=snapshot();
        first.corpses=[{...first.case,owner:undefined,id:'body',victimId:'victim',appearance:DEFAULT_APPEARANCE,born:1000,expires:2000}];
        view.apply(first,0);
        const second=snapshot(1100,10);second.corpses=[{...second.case,owner:undefined,id:'body',victimId:'victim',appearance:DEFAULT_APPEARANCE,born:1000,expires:2000,q:{x:0,y:0,z:1,w:0}}];
        view.apply(second,100);expect(view.corpse('body',100,out)).toBe(true);
        expect(out.p.x).toBeGreaterThan(0);expect(out.p.x).toBeLessThan(10);
        expect(Math.hypot(out.q.x,out.q.y,out.q.z,out.q.w)).toBeCloseTo(1);expect(out.q.z).toBeGreaterThan(0);expect(out.q.w).toBeGreaterThan(0);
        view.apply(snapshot(1150,15),150);expect(view.corpse('body',150,out)).toBe(false);
    });
});
