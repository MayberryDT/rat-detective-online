import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LandmarkSilhouette } from './LandmarkSilhouette';
import { assignmentGuidance } from './assignmentGuidance';
import { locateCase } from './caseLocator';
import { setText } from '../ui/setText';
import { activeDestination, ASSIGNMENT_DESTINATIONS, type AssignmentState, type DestinationId } from '../shared/assignments';

type Mass = [x:number, z:number, width:number, depth:number, bottom:number, top:number];
// Outline the existing architecture, including its recognizable rooftop silhouette.
// These are visibility graphics only: no lighting, collision or map changes.
const crowns: Partial<Record<DestinationId, Mass[]>> = {
    records:[[-16,-70,34,18,36,70],[-16,-70,24,16,70,92],[-16,-70,16,12,92,104],[-16,-70,7,7,104,110]],
    icebox:[[130,-81,30,12,36,54],...[114,146].flatMap(x=>[[x,-79,10,10,36,74],[x,-79,13,13,74,84]] as Mass[])],
    needleworks:[[-74,100,12,12,36,94],[-74,100,15,15,94,102],[-74,100,7,7,102,108],[-133,66,3.4,3.4,36,90],[-125,66,3.4,3.4,36,90]],
    pump:[[125,112,17,15,36,42],[125,112,20,20,42,56],[125,112,21,21,56,58],[105,105,5,5,36,67]],
};
export class AssignmentDestinations {
    readonly root = new THREE.Group();
    private readonly silhouette=new LandmarkSilhouette();
    private active=false;
    private strength=.85;
    private readonly landmarks = new Map<DestinationId, THREE.Group>();
    private readonly cue=document.createElement('div');
    private readonly label=document.createElement('strong');
    private readonly detail=document.createElement('span');
    private readonly arrow=document.createElement('i');
    private readonly viewer=new THREE.Vector3();
    private readonly target=new THREE.Vector3();
    constructor(_scene:THREE.Scene) {
        this.root.name='assignment-landmark-silhouette';this.silhouette.scene.add(this.root);
        this.cue.className='assignment-destination';this.cue.hidden=true;this.arrow.textContent='➤';
        for(const child of [this.arrow,this.label,this.detail])this.cue.appendChild(child);
        document.body.appendChild(this.cue);
        for(const id of Object.keys(ASSIGNMENT_DESTINATIONS) as DestinationId[]){
            const b=ASSIGNMENT_DESTINATIONS[id].bounds,group=new THREE.Group();group.name=id;group.visible=false;
            const masses:Mass[]=id==='sluice'
                ? [...[-22,22].flatMap(z=>[[-137,z,18,20,0,20],[-137,z,16,18,20,44],[-137,z,12,14,44,58],[-137,z,15,17,58,62]] as Mass[]),[-137,0,16,62,21,27],[-137,0,18,64,27,29]]
                : [[(b.xmin+b.xmax)/2,(b.zmin+b.zmax)/2,b.xmax-b.xmin,b.zmax-b.zmin,id==='maintenance'?-7:0,id==='maintenance'?-1:36],...(crowns[id]??[])];
            const geometries:THREE.BufferGeometry[]=[];
            for(const [x,z,w,d,low,high] of masses){
                // A solid union supplies only the exterior contour; none of these
                // mask faces are drawn into the gameplay image.
                const round=id==='pump'&&x===125&&low>=42;
                const geometry=round?new THREE.CylinderGeometry(w/2,w/2,high-low,32):new THREE.BoxGeometry(w,high-low,d);
                geometry.translate(x,(low+high)/2,z);geometries.push(geometry);
            }
            const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
            const mask=new THREE.Mesh(geometry,this.silhouette.ink);mask.raycast=()=>{};group.add(mask);
            this.root.add(group);this.landmarks.set(id,group);
        }
    }
    update(state?:AssignmentState):void {
        const destination=state&&state.phase!=='closed'?activeDestination(state):undefined;
        this.active=!!destination;this.strength=state?.phase==='suspended'?.34:.85;
        for(const [id,group] of this.landmarks)group.visible=id===destination;
    }
    render(renderer:THREE.WebGLRenderer,camera:THREE.Camera):void {if(this.active)this.silhouette.render(renderer,camera,this.strength);}
    updateCue(state:AssignmentState|undefined,camera:THREE.Camera):void {
        camera.getWorldPosition(this.viewer);
        const guidance=assignmentGuidance(state,this.viewer);this.cue.hidden=!guidance;
        if(!guidance)return;
        this.target.set(guidance.point.x,guidance.point.y,guidance.point.z);
        const p=locateCase(this.target,camera,window.innerWidth,window.innerHeight);
        const top=Math.min(window.innerHeight*.55,window.innerWidth<=700?410:330);
        const y=Math.max(top,Math.min(window.innerHeight-95,p.y));
        this.cue.style.left=`${Math.min(window.innerWidth-115,Math.max(115,p.x))}px`;this.cue.style.top=`${y}px`;
        this.cue.dataset.edge=String(p.edge);this.cue.dataset.paused=String(state?.phase==='suspended');
        this.arrow.hidden=!p.edge;this.arrow.style.transform=`rotate(${p.angle}rad)`;
        setText(this.label,guidance.label);
        setText(this.detail,`${guidance.via||guidance.action} · ${Math.round(p.distance)}m`);
    }
    dispose():void {this.cue.remove();this.landmarks.clear();this.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.root.removeFromParent();this.silhouette.dispose();}
}
