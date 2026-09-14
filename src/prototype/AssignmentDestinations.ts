import * as THREE from 'three';
import { assignmentGuidance } from './assignmentGuidance';
import { locateCase } from './caseLocator';
import { setText } from '../ui/setText';
import { placeHudLabel, type HudRect } from '../ui/hudLabelPlacement';
import type { AssignmentState } from '../shared/assignments';

/** Screen-space destination guidance; buildings retain their ordinary appearance. */
export class AssignmentDestinations {
    private readonly cue=document.createElement('div');
    private readonly label=document.createElement('strong');
    private readonly detail=document.createElement('span');
    private readonly arrow=document.createElement('i');
    private readonly viewer=new THREE.Vector3();
    private readonly target=new THREE.Vector3();
    private measureAt=0;
    private obstacles:HudRect[]=[];
    private width=250;
    private height=150;
    constructor() {
        this.cue.className='assignment-destination';this.cue.hidden=true;this.arrow.textContent='➤';
        for(const child of [this.arrow,this.label,this.detail])this.cue.appendChild(child);
        document.body.appendChild(this.cue);
    }
    clear():void {this.cue.hidden=true;}
    updateCue(state:AssignmentState|undefined,camera:THREE.Camera,feet?:{x:number;y:number;z:number}):void {
        camera.getWorldPosition(this.viewer);
        const guidance=assignmentGuidance(state,feet??this.viewer);this.cue.hidden=!guidance;
        if(!guidance)return;
        this.target.set(guidance.point.x,guidance.point.y,guidance.point.z);
        const p=locateCase(this.target,camera,window.innerWidth,window.innerHeight);
        setText(this.label,guidance.label);
        setText(this.detail,`${guidance.via||guidance.action} · ${Math.round(p.distance)}m`);
        // Measure at most 7 times/sec, not on every rendered world update.
        // Reserve the arrow's height even when it was previously hidden.
        const now=performance.now();
        if(now>=this.measureAt){
            this.measureAt=now+150;
            const bounds=this.cue.getBoundingClientRect();this.width=bounds.width||250;
            this.height=(bounds.height||100)+(this.arrow.hidden?40:0);
            this.obstacles=Array.from(document.querySelectorAll<HTMLElement>('.jurisdiction-timer:not([hidden]),.assignment-ledger,.dispatch-ledger,.dispatch-roulette:not([hidden]),.assignment-reveal:not([hidden]),.case-broadcast:not([hidden]),.pickup-buffs,.touch-stick,.touch-fire,.touch-jump'))
                .filter(el=>el.getClientRects().length>0).map(el=>el.getBoundingClientRect());
        }
        const label=placeHudLabel(p.x,p.y,this.width,this.height,window.innerWidth,window.innerHeight,this.obstacles);
        this.cue.style.left=`${label.x}px`;this.cue.style.top=`${label.y}px`;
        this.cue.dataset.edge=String(p.edge);this.cue.dataset.paused=String(state?.phase==='suspended');
        const moved=Math.hypot(label.x-p.x,label.y-p.y)>20;
        this.arrow.hidden=!p.edge&&!moved;
        this.arrow.style.transform=`rotate(${p.edge?p.angle:Math.atan2(p.y-label.y,p.x-label.x)}rad)`;
    }
    dispose():void {this.cue.remove();}
}
