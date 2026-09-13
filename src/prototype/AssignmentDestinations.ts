import * as THREE from 'three';
import { assignmentGuidance } from './assignmentGuidance';
import { locateCase } from './caseLocator';
import { setText } from '../ui/setText';
import { clearAimLabel } from '../ui/aimClearance';
import type { AssignmentState } from '../shared/assignments';

/** Screen-space destination guidance; buildings retain their ordinary appearance. */
export class AssignmentDestinations {
    private readonly cue=document.createElement('div');
    private readonly label=document.createElement('strong');
    private readonly detail=document.createElement('span');
    private readonly arrow=document.createElement('i');
    private readonly viewer=new THREE.Vector3();
    private readonly target=new THREE.Vector3();
    constructor() {
        this.cue.className='assignment-destination';this.cue.hidden=true;this.arrow.textContent='➤';
        for(const child of [this.arrow,this.label,this.detail])this.cue.appendChild(child);
        document.body.appendChild(this.cue);
    }
    clear():void {this.cue.hidden=true;}
    updateCue(state:AssignmentState|undefined,camera:THREE.Camera):void {
        camera.getWorldPosition(this.viewer);
        const guidance=assignmentGuidance(state,this.viewer);this.cue.hidden=!guidance;
        if(!guidance)return;
        this.target.set(guidance.point.x,guidance.point.y,guidance.point.z);
        const p=locateCase(this.target,camera,window.innerWidth,window.innerHeight);
        const x=Math.min(window.innerWidth-125,Math.max(125,p.x));
        const label=clearAimLabel(x,p.y,250,150,window.innerWidth,window.innerHeight);
        this.cue.style.left=`${label.x}px`;this.cue.style.top=`${label.y}px`;
        this.cue.dataset.edge=String(p.edge);this.cue.dataset.paused=String(state?.phase==='suspended');
        this.arrow.hidden=!p.edge;this.arrow.style.transform=`rotate(${p.angle}rad)`;
        setText(this.label,guidance.label);
        setText(this.detail,`${guidance.via||guidance.action} · ${Math.round(p.distance)}m`);
    }
    dispose():void {this.cue.remove();}
}
