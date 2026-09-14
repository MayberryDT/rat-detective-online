import * as THREE from 'three';
import {afterEach,expect,it,vi} from 'vitest';
import {AssignmentDestinations} from '../../src/prototype/AssignmentDestinations';
import {ASSIGNMENT_DESTINATIONS,createAssignment} from '../../src/shared/assignments';

afterEach(()=>vi.unstubAllGlobals());
it('retains destination labels and distance through deliveries, hides on reset and cleans up',()=>{
    const elements:any[]=[];
    vi.stubGlobal('window',{innerWidth:1440,innerHeight:900});
    vi.stubGlobal('document',{querySelectorAll:()=>[],body:{appendChild(){}},createElement:()=>{
        const el={getBoundingClientRect:()=>({width:220,height:100}),appendChild(){},remove:vi.fn(),style:{},dataset:{},hidden:false,textContent:''};elements.push(el);return el;
    }});
    const cues=new AssignmentDestinations(),camera=new THREE.PerspectiveCamera(60,1.6,.1,1000);
    camera.position.set(0,3,0);camera.updateMatrixWorld();
    const state=createAssignment('chain-of-custody',0);state.phase='active';
    cues.updateCue(state,camera);expect(elements[0].hidden).toBe(false);
    expect(elements[1].textContent).toBe(ASSIGNMENT_DESTINATIONS[state.destinations[0]].label);
    expect(elements[2].textContent).toMatch(/ · \d+m$/);
    state.deliverySerial=1;cues.updateCue(state,camera);
    expect(elements[1].textContent).toBe(ASSIGNMENT_DESTINATIONS[state.destinations[1]].label);
    state.deliverySerial=state.destinations.indexOf('icebox');
    cues.updateCue(state,camera,{x:112,y:-4,z:0});expect(elements[2].textContent).toContain('EXIT SEWER');
    cues.updateCue(state,camera,{x:142,y:-.003,z:0});expect(elements[2].textContent).toContain('DELIVER PAPERWORK INSIDE');
    expect(elements[2].textContent).not.toContain('EXIT SEWER');
    cues.clear();expect(elements[0].hidden).toBe(true);
    cues.updateCue(state,camera);expect(elements[0].hidden).toBe(false);
    state.phase='closed';cues.updateCue(state,camera);expect(elements[0].hidden).toBe(true);
    cues.dispose();expect(elements[0].remove).toHaveBeenCalledOnce();
});
