import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {ChaosView} from '../../src/prototype/ChaosView';
import {CASE_HOME,type ChaosState} from '../../src/shared/chaosState';

vi.mock('../../src/prototype/DispatchHud',()=>({DispatchHud:class{update(){} setScores(){} dispose(){}}}));
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
class Element {
    width=0;height=0;className='';innerHTML='';textContent='';removed=false;
    style={display:'',setProperty:vi.fn()};children:Element[]=[];selectors=new Map<string,Element>();
    classList={toggle:vi.fn()};
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
function fixture(){
    const feedback=vi.fn(),view=new ChaosView(new THREE.Scene(),()=>undefined,undefined,false,feedback);
    view.setScores([],'me');
    const state:ChaosState={time:1000,case:{p:{...CASE_HOME},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0},owner:null,previousOwner:null,pickupAfter:0,returningUntil:0},
        dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},corpses:[],impacts:[],notice:{serial:0,text:''},shots:[],buffs:{me:{ironcladUntil:13000,hustleUntil:11000}}};
    const camera=new THREE.PerspectiveCamera();
    const draw=()=>{view.apply(state);view.update(1/60,camera);};
    const cards=()=>nodes.filter(n=>n.className.startsWith('powerup-card')&&!n.removed);
    return{view,state,feedback,draw,cards};
}
it('keeps one illustrated card per effect and confirms heals without a duration or a duplicate title card',()=>{
    const {view,state,draw,cards,feedback}=fixture();draw();draw();
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
