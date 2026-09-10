import {describe,it,expect} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {assignmentGuidance} from '../../src/prototype/assignmentGuidance';
import {locateCase} from '../../src/prototype/caseLocator';
import {createAssignment,ASSIGNMENT_DESTINATIONS,CHAIN_ROUTE} from '../../src/shared/assignments';

function state(){const a=createAssignment('chain-of-custody',0);a.phase='active';a.destinations=[...CHAIN_ROUTE];return a;}
describe('whole-landmark destination guidance',()=>{
    it('immediately names each shared landmark, with a distinct final-stop instruction',()=>{
        const a=state();
        a.destinations.forEach((id,i)=>{
            a.stamps=i;const cue=assignmentGuidance(a,{x:0,y:id==='maintenance'?-4:3,z:0})!;
            expect(cue.id).toBe(id);expect(cue.label).toBe(ASSIGNMENT_DESTINATIONS[id].label);
            expect(cue.point).toMatchObject({x:ASSIGNMENT_DESTINATIONS[id].center.x,z:ASSIGNMENT_DESTINATIONS[id].center.z});
            expect(cue.action).toBe(i===5?'BRING CASE TO FINISH':'BRING CASE INSIDE');
        });
        a.phase='suspended';expect(assignmentGuidance(a,{x:0,y:3,z:0})?.via).toBe('PROGRESS PAUSED');
        a.phase='closed';expect(assignmentGuidance(a,{x:0,y:3,z:0})).toBeUndefined();
    });
    it('guides everyone up real sewer ramps to a street destination',()=>{
        const a=state(),underground=assignmentGuidance(a,{x:75,y:-4,z:0})!;
        expect(underground.via).toBe('EXIT SEWER ↑');expect(underground.point.y).toBeLessThan(0);
        const onRamp=assignmentGuidance(a,{x:112,y:-4,z:0})!;
        expect(onRamp.point.y).toBeGreaterThan(0);expect(onRamp.point.x).toBeGreaterThan(130);
        expect(assignmentGuidance(a,{x:138,y:3,z:0})?.via).toBe('');
    });
    it('guides down a real pipe to Maintenance, then points at the room underground',()=>{
        const a=state();a.stamps=1;
        const street=assignmentGuidance(a,{x:125,y:3,z:10})!;
        expect(street.via).toBe('GO UNDERGROUND ↓');expect(street.point.y).toBeGreaterThan(0);
        const mouth=assignmentGuidance(a,{x:140,y:3,z:0})!;expect(mouth.point.y).toBeLessThan(0);
        const room=assignmentGuidance(a,{x:55,y:-4,z:-36})!;
        expect(room.via).toBe('');expect(room.point).toEqual({x:65,y:-4,z:-36});
    });
    it('keeps a behind-camera destination visible at the screen edge',()=>{
        const camera=new PerspectiveCamera(60,1440/900,.1,1000);camera.position.set(130,3,-15);camera.lookAt(130,3,10);
        const target=assignmentGuidance(state(),camera.position)!.point;
        const cue=locateCase(new Vector3(target.x,target.y,target.z),camera,1440,900);
        expect(cue.edge).toBe(true);expect(cue.behind).toBe(true);
        expect(cue.x).toBeGreaterThan(0);expect(cue.x).toBeLessThan(1440);expect(cue.y).toBeGreaterThan(0);expect(cue.y).toBeLessThan(900);
    });
    it('shows no landmark guidance in the other assignments',()=>{
        for(const id of ['closing-time','excessive-force'] as const)expect(assignmentGuidance(createAssignment(id,0),{x:0,y:3,z:0})).toBeUndefined();
    });
});
