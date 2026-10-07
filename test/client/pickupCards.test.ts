import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {ChaosView} from '../../src/prototype/ChaosView';
import {CASE_HOME,type ChaosState} from '../../src/shared/chaosState';
import type {RatEntity} from '../../src/entities/RatEntity';

vi.mock('../../src/prototype/DispatchHud',()=>({DispatchHud:class{update(){} setScores(){} dispose(){}}}));
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
class Element {
    width=0;height=0;className='';innerHTML='';textContent='';removed=false;
    style={display:'',setProperty:vi.fn()};children:Element[]=[];selectors=new Map<string,Element>();
    classList={toggle:vi.fn(),add:vi.fn(),remove:vi.fn()};
    appendChild(child:Element){this.children.push(child);}replaceChildren(){this.children=[];}
    remove(){this.removed=true;}setAttribute(){}
    querySelector(s:string){if(!this.selectors.has(s))this.selectors.set(s,new Element());return this.selectors.get(s)!;}
    getContext(){return{fillRect(){},fillText(){},clearRect(){},strokeText(){}};}
}
let nodes:Element[],clock:number;
beforeEach(()=>{
    nodes=[];clock=100;vi.spyOn(performance,'now').mockImplementation(()=>clock);
    vi.stubGlobal('window',{innerWidth:1280,innerHeight:720});
    vi.stubGlobal('document',{createElement:()=>{const node=new Element();nodes.push(node);return node;},body:{appendChild(){}}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(rat?:Partial<RatEntity>){
    const feedback=vi.fn(),view=new ChaosView(new THREE.Scene(),id=>id==='me'?rat as RatEntity|undefined:undefined,undefined,false,feedback);
    view.setScores([],'me');
    const state:ChaosState={time:1000,case:{p:{...CASE_HOME},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0},owner:null,previousOwner:null,pickupAfter:0,returningUntil:0},
        dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},corpses:[],impacts:[],notice:{serial:0,text:''},shots:[],buffs:{me:{ironcladUntil:13000,hustleUntil:11000}}};
    const camera=new THREE.PerspectiveCamera();
    const draw=()=>{view.apply(state);view.update(1/60,camera);};
    const cards=()=>nodes.filter(n=>n.className.startsWith('powerup-card')&&!n.removed);
    return{view,state,feedback,draw,cards};
}
it('keeps one illustrated card per effect and confirms heals without a duration or a duplicate title card',()=>{
    const {view,state,draw,cards,feedback}=fixture();
    // A view's first state is its baseline (a reconnect never replays a claim): the buffs arrive after it.
    const buffs=state.buffs;state.buffs={};draw();state.buffs=buffs;draw();draw();
    expect(cards()).toHaveLength(2);expect(nodes.some(n=>n.className==='pickup-broadcast')).toBe(false);
    expect(feedback.mock.calls.filter(([cue])=>cue==='pickup-hustle')).toHaveLength(1);
    view.resolveInteraction({type:'pickupResult',interactionId:'heal',target:'pickup',targetId:'medkit',accepted:true,pickup:'quick-fix',at:1000,tick:1,epoch:'round',playerId:'me'});
    expect(cards()).toHaveLength(2); // Acceptance alone is not a healed-health claim.
    view.showHealing();draw();draw();expect(cards()).toHaveLength(3);
    const healing=cards().find(n=>n.className.includes('quick-fix'))!;
    expect(healing.innerHTML).toContain('<svg');expect(healing.innerHTML).toContain('FULL HP');
    expect(healing.innerHTML).not.toContain('SEC');expect(healing.innerHTML).not.toContain('powerup-gauge');
    expect(feedback.mock.calls.filter(([cue])=>cue==='pickup-quick-fix')).toHaveLength(1);
    clock+=3201;draw();expect(cards()).toHaveLength(2);
    state.time=14000;draw();expect(cards()).toHaveLength(0);
    view.dispose();expect(nodes.find(n=>n.className==='pickup-buffs')?.removed).toBe(true);
});
it('refreshes one healing card and clears all cards on a round reset',()=>{
    const {view,draw,cards}=fixture();view.showHealing();draw();clock+=2500;view.showHealing();draw();
    expect(cards()).toHaveLength(3);clock+=1000;draw();expect(cards()).toHaveLength(3);
    view.resetProjectiles();expect(cards()).toHaveLength(0);view.dispose();
});
it('shows the held weapon as one card, announces each new weapon once and arms the rat holding it',()=>{
    vi.stubGlobal('innerWidth',1280);vi.stubGlobal('innerHeight',720);
    const rat={dead:false,mesh:new THREE.Group(),setWeapon:vi.fn()};
    const {view,state,draw,cards,feedback}=fixture(rat);
    const claims=(kind:string)=>feedback.mock.calls.filter(([cue])=>cue===`pickup-${kind}`).length;
    state.buffs={me:{weapon:'laser',weaponUntil:9000}};draw();
    expect(claims('laser')).toBe(0); // A view's first state is only the baseline.
    state.buffs={me:{weapon:'tommy-gun',weaponUntil:9000}};draw();draw();
    expect(cards().map(c=>c.className)).toEqual(['powerup-card powerup-tommy-gun']);
    expect(cards()[0]!.innerHTML).toContain('SEC');expect(claims('tommy-gun')).toBe(1);
    expect(rat.setWeapon).toHaveBeenLastCalledWith('tommy-gun');
    // Protocol33 swaps the trap in immediately, ignoring old arming timestamps.
    state.buffs={me:{weapon:'mousetrap',weaponReadyAt:state.time+1000}};draw();draw();
    expect(cards().map(c=>c.className)).toEqual(['powerup-card powerup-mousetrap']);
    const trap=cards()[0]!.innerHTML;
    expect(trap).toContain('CLICK TO SET IT DOWN');expect(trap).toContain('FIRE TO SET IT DOWN');expect(trap).not.toContain('SEC');
    expect(claims('mousetrap')).toBe(1);expect(rat.setWeapon).toHaveBeenLastCalledWith('mousetrap');
    expect(feedback.mock.calls.filter(([cue])=>cue==='trap-ready')).toHaveLength(0);
    state.time+=1000;state.buffs={me:{weapon:'mousetrap'}};draw();draw();
    expect(feedback.mock.calls.filter(([cue])=>cue==='trap-ready')).toHaveLength(0);
    // Set down (or expired): the card goes and the pistol comes back.
    state.buffs={};draw();
    expect(cards()).toHaveLength(0);expect(rat.setWeapon).toHaveBeenLastCalledWith(undefined);
    view.dispose();
});
