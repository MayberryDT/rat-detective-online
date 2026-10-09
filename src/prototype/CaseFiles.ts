import * as THREE from 'three';
import {CLUES,paperArt,paperFamily,paperShape,type CaseClue,type CasePrints} from '../shared/caseClues';
import type {Vec3Data} from '../shared/networkProtocol';
import {gustAt,LOOSE,looseLifts,paperHash,windAt,type LooseLift} from '../shared/paperWind';
import {casePaperArt,PAPER_BACK,paperCellOffset,paperUv} from './CasePaperArt';
import {PawPrints} from './PawPrints';
import {CityMarksView} from './CityMarksView';
import type {ChaosState} from '../shared/chaosState';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';
import {reducedMotion} from '../ui/motion';

export interface PaperSupport {y:number;normal:Vec3Data}
/** Sheet size in world units per family, the atlas documents' own proportions. */
export const PAPER_SIZES:readonly [number,number][]=[[.82,1.10],[.79,1.03],[.43,.96],[.76,.65]];
const UP=new THREE.Vector3(0,1,0);
const TAU=Math.PI*2;
/** How a family's stock takes the wind: receipts flutter, photographs barely stir. `lift`: edge lift in a full gust. */
const STOCK=[{gain:.7,lift:.075},{gain:.6,lift:.065},{gain:1,lift:.1},{gain:.25,lift:.03}] as const;
/** Blowing in and away (ms), how recently born a sheet must be to blow in, and how many may be in the air at once. */
const ARRIVE_MS=1150,LEAVE_MS=1900,ARRIVING_WINDOW=2600,MAX_FLYING=12;
/** The eye-catch (Tyler, 8 October): the first time a sheet lying `near`…`far` from the rat comes into the camera's
 * clear view, a gust lifts it and sets it back down where it lay (`ms`). At most one in `apart` units every `quietMs`,
 * none closer together than `gapMs` anywhere, and `rays` sight checks a frame. */
const CATCH={near:9,far:45,ms:1300,lift:.8,roll:1.3,apart:5,quietMs:10000,gapMs:1500,rays:2,retryMs:400} as const;

/** Rest shapes: two per family, none of them tents. (x, z) run 0…1 across the sheet's width and depth. */
const SHAPES:readonly ((x:number,z:number)=>number)[][]=[
    [(x,z)=>.035*Math.max(0,(x+z-1.55)/.45)**2,x=>.04*Math.max(0,(x-.72)/.28)**2],
    [(_x,z)=>.006*Math.sin(z*6.3),(_x,z)=>.016*Math.abs(((z*3)%2)-1)],
    [(_x,z)=>.05*z**4,(x,z)=>.006*(1+Math.sin(x*9+z*4))+.005*(1+Math.sin(z*13+1))],
    [()=>.003,(x,z)=>.03*Math.max(0,(x-z-.5)/.5)**2],
];
/** The edge facing `paperBend.x` (sheet frame) lifts by `paperBend.y`; `z` flutters it with phase `w`. Both only lift:
 * no vertex goes below the sheet's base, which sits just above the pavement. */
const BEND=`vec2 paperDir=vec2(cos(paperBend.x),sin(paperBend.x));
    float paperAlong=dot(position.xz,paperDir),paperReach=max(0.,paperAlong+.1),paperRamp=clamp((paperAlong+.3)/.8,0.,1.);
    float paperLift=paperBend.y*paperReach*paperReach/.4225+paperBend.z*(.5+.5*sin(paperAlong*10.+paperBend.w))*paperRamp;
    float paperSlope=paperBend.y*2.*paperReach/.4225+paperBend.z*5.*cos(paperAlong*10.+paperBend.w)*paperRamp;`;

interface Rest {at:Vec3Data;support:PaperSupport|null|undefined;yaw:number}
interface Flight {at:THREE.Vector3;roll:number;pitch:number;yaw:number;scale:number;flap:number}
interface Sheet {
    c:CaseClue;hash:number;family:number;art:number;shape:number;scale:number;
    p:Rest;q?:Rest;
    /** Where it lies this frame (`p`, or `q` after an odd number of gusts carried it). */
    current:Rest;
    sheltered?:boolean;
    lift:number;liftV:number;hop:number;hopV:number;bend:number;bendTo:number;touchedAt:number;
    /** A loose sheet in the air between its spots this frame. */
    flying?:boolean;
    arrive?:{start:number;from?:THREE.Vector3};
    leave?:{start:number;to:THREE.Vector3;far:boolean;rest:Rest};
    loose:{lifts:LooseLift[];next:number;count:number};
    seenAt:number;shown:boolean;
    /** Seen in the clear from this view (`noticed`), the last sight check, and when a gust lifted it to catch the eye
     * (until it lands again). */
    noticed?:true;lookedAt?:number;caught?:number;
}

/** P4 case papers, presentation only: the authority owns every sheet's id, place and look. A sheet keeps one record
 * for its whole life, so it is the same document in the same pose every frame, admitted with hysteresis (sheets on
 * screen keep their budget slot). The harbour wind (paperWind) lifts edges in passing gusts and now and then carries
 * a loose sheet to its second resting spot and back; new sheets blow in and retired ones blow away rather than pop.
 * Passing rats and shots ruffle them. Eight small instanced batches share one material; GPU depth owns occlusion. */
export class CaseFiles {
    readonly root=new THREE.Group();
    private readonly batches:THREE.InstancedMesh[]=[];
    private readonly material:THREE.MeshStandardMaterial;
    private readonly frustum=new THREE.Frustum();
    private readonly matrix=new THREE.Matrix4();
    private readonly sphere=new THREE.Sphere(new THREE.Vector3(),1.2);
    private readonly pose=new THREE.Object3D();
    private readonly normal=new THREE.Vector3();
    private readonly turn=new THREE.Quaternion();
    private readonly euler=new THREE.Euler(0,0,0,'YXZ');
    private readonly flightAt=new THREE.Vector3();
    private readonly cameraAt=new THREE.Vector3();
    private readonly sheets=new Map<string,Sheet>();
    private readonly candidates:{sheet:Sheet;distance:number}[]=[];
    private readonly live=new Set<string>();
    private primed=false;
    private time=0;
    visibleIds:string[]=[];
    /** Continuity counters for E2E traces: sheets blown in and away, sheets dropped from view while still in range and
     * in the frustum (`evicted`: the budget), sheets that left without blowing away while on screen (`popped`), and
     * eye-catching gusts (`caught`). */
    readonly stats={arrivals:0,departures:0,evicted:0,popped:0,caught:0};
    /** The paw prints beside the papers, drawn with them. */
    readonly paws=new PawPrints();
    /** What the chaos leaves: chalk outlines, witnesses' tips, sewer muck (`cityMarks.ts`). */
    readonly marks=new CityMarksView();
    private lastCatch=-Infinity;
    private catches:{x:number;z:number;at:number}[]=[];
    private catchRays=0;
    /** Replays: papers lie still (no wind, no blowing in or away). */
    still=false;
    /** Cached static-city support under a sheet, not a visibility test. Called once per resting spot. */
    support:(p:Vec3Data)=>PaperSupport|undefined=p=>({y:p.y,normal:{x:0,y:1,z:0}});
    /** Whether a straight flight between two points misses the static city: blown sheets never pass through walls. */
    clearPath:(a:Vec3Data,b:Vec3Data)=>boolean=()=>true;
    constructor(){
        this.root.name='physical-case-files';
        this.root.userData.noNoir=true; // adopted explicitly with the dynamic dressing path
        this.root.userData.caseFiles=this;
        this.paws.support=p=>this.support(p);this.root.add(this.paws.mesh);
        this.marks.muck.support=p=>this.support(p);this.root.add(this.marks.root);
        // The case file's art is drawn on first use (`ensureArt`); the load's warm-up does it, so the program links before play.
        this.material=new THREE.MeshStandardMaterial({
            emissive:0xffffff,emissiveIntensity:.55,roughness:1,metalness:0,side:THREE.FrontSide});
        this.material.onBeforeCompile=shader=>{
            shader.vertexShader=shader.vertexShader
                .replace('#include <common>','#include <common>\nattribute float paperSide;\nattribute vec4 paperTile;\nattribute vec4 paperBend;')
                .replace('#include <uv_vertex>',`#include <uv_vertex>
                    vec2 paperCell=mix(paperTile.xy,paperTile.zw,paperSide);
                    #ifdef USE_MAP
                    vMapUv+=paperCell;
                    #endif
                    #ifdef USE_EMISSIVEMAP
                    vEmissiveMapUv+=paperCell;
                    #endif`)
                .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
                    ${BEND}
                    objectNormal=normalize(objectNormal-vec3(paperDir.x,0.,paperDir.y)*paperSlope*sign(objectNormal.y));`)
                .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y+=paperLift;');
        };
        this.material.customProgramCacheKey=()=>'case-paper-v2';
        for(let family=0;family<4;family++)for(let shape=0;shape<2;shape++){
            const mesh=new THREE.InstancedMesh(paperGeometry(family,shape),this.material,CLUES.visible);
            mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.raycast=()=>{};mesh.receiveShadow=true;
            mesh.name=`case-paper-${['statement','form','receipt','photo'][family]}-${shape}`;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            for(const name of ['paperTile','paperBend']){
                const attribute=new THREE.InstancedBufferAttribute(new Float32Array(CLUES.visible*4),4);
                attribute.setUsage(THREE.DynamicDrawUsage);mesh.geometry.setAttribute(name,attribute);
            }
            this.batches.push(mesh);this.root.add(mesh);
        }
    }
    /** `now`: the authority's clock, so gusts and loose sheets agree across clients. `focus`: the local rat, which reads
     * papers out to `CLUES.range` like any rat; the orbiting camera must not move that edge. */
    update(clues:readonly CaseClue[],now:number,camera:THREE.Camera,dt=1/60,focus?:THREE.Vector3,prints:readonly CasePrints[]=[],marks:Pick<ChaosState,'chalk'|'tips'|'muck'>={}):void {
        if(clues.length)this.ensureArt();
        camera.updateMatrixWorld();this.time=now;
        this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        const motion=this.motion(),eye=focus??camera.position;
        this.sync(clues,now,motion,eye);
        this.paws.update(prints,now,eye,this.frustum,motion,this.still);
        this.marks.update(marks,now,eye,this.frustum,motion,this.still);
        this.catchRays=0;camera.getWorldPosition(this.cameraAt);
        const candidates=this.candidates;candidates.length=0;
        for(const sheet of this.sheets.values()){
            // A sheet that landed out of sight has simply landed.
            if(sheet.arrive&&now>=sheet.arrive.start+ARRIVE_MS)sheet.arrive=undefined;
            if(sheet.arrive&&now<sheet.arrive.start)continue;
            const rest=this.place(sheet,now,motion);if(!rest)continue;
            const y=rest.support!.y,distance=Math.hypot(rest.at.x-eye.x,y-eye.y,rest.at.z-eye.z),moving=!!(sheet.leave||sheet.arrive||sheet.flying||sheet.caught!==undefined);
            // Leaving sheets were on screen in range; everything else reads only out to a rat's range.
            if(!sheet.leave&&distance>(sheet.shown?CLUES.range+4:CLUES.range))continue;
            this.sphere.center.set(rest.at.x,y,rest.at.z);this.sphere.radius=moving?7:1.2;
            if(!this.frustum.intersectsSphere(this.sphere))continue;
            candidates.push({sheet,distance});
        }
        // Sheets already on screen keep their budget slot; newcomers fill what is left, nearest first.
        candidates.sort((a,b)=>Number(b.sheet.shown)-Number(a.sheet.shown)||a.distance-b.distance||(a.sheet.c.id<b.sheet.c.id?-1:1));
        const counts=new Array<number>(this.batches.length).fill(0);this.visibleIds=[];
        // Dropped by the budget while still in range and in view: counted, so a trace can tell.
        for(let i=CLUES.visible;i<candidates.length;i++)if(candidates[i]!.sheet.shown)this.stats.evicted++;
        for(const sheet of this.sheets.values())sheet.shown=false;
        for(let i=0;i<Math.min(CLUES.visible,candidates.length);i++){const {sheet,distance}=candidates[i]!;
            if(distance<70)this.animate(sheet,now,dt,motion);
            this.notice(sheet,distance,now,motion);
            const batch=sheet.family*2+sheet.shape;
            this.write(sheet,now,motion,this.batches[batch]!,counts[batch]!++);
            sheet.shown=true;sheet.seenAt=now;this.visibleIds.push(sheet.c.id);
        }
        for(const [id,sheet] of this.sheets)if(sheet.leave&&now>=sheet.leave.start+LEAVE_MS)this.sheets.delete(id);
        for(const [i,mesh] of this.batches.entries()){
            mesh.count=counts[i]!;mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;
            (mesh.geometry.getAttribute('paperTile') as THREE.InstancedBufferAttribute).needsUpdate=true;
            (mesh.geometry.getAttribute('paperBend') as THREE.InstancedBufferAttribute).needsUpdate=true;
        }
    }
    /** Rats brushing past (you and the others, this frame) lift the sheets they pass. */
    rats(positions:readonly {position:Vec3Data}[]):void {
        if(!this.motion())return;
        for(const {position:r} of positions)for(const sheet of this.sheets.values()){
            if(!sheet.shown||sheet.leave||sheet.arrive||sheet.caught!==undefined||this.time-sheet.touchedAt<1200)continue;
            const at=sheet.current.at,dx=at.x-r.x,dz=at.z-r.z;
            if(Math.abs((sheet.current.support?.y??at.y)-r.y)>1.2||dx*dx+dz*dz>1.7*1.7)continue;
            sheet.touchedAt=this.time;sheet.liftV=Math.min(4,sheet.liftV+2.2);sheet.bendTo=Math.atan2(-dz,-dx);
        }
    }
    /** A ball or blast striking near sheets makes them jump in place and lifts the edge facing it. */
    impact(p:Vec3Data,strength=1):void {
        if(!this.motion())return;
        const reach=1.4+Math.min(2,strength)*.6;
        for(const sheet of this.sheets.values()){
            if(!sheet.shown||sheet.leave||sheet.arrive||sheet.caught!==undefined)continue;
            const at=sheet.current.at,d=Math.hypot(at.x-p.x,(sheet.current.support?.y??at.y)-p.y,at.z-p.z);
            if(d>reach)continue;
            const k=1-d/reach;sheet.hopV=Math.min(3,sheet.hopV+1.8*k*Math.min(2,strength));sheet.liftV=Math.min(4,sheet.liftV+3*k);sheet.bendTo=Math.atan2(p.z-at.z,p.x-at.x);
        }
    }
    /** This view of every live sheet, for E2E continuity traces: id, look, state and resting pose. */
    trace():{id:string;s:number;state:string;x:number;y:number;z:number;yaw:number;shown:boolean}[] {
        const out=[];
        for(const sheet of this.sheets.values()){
            const state=sheet.leave?'leaving':sheet.arrive?(this.time<sheet.arrive.start?'waiting':'arriving'):sheet.caught!==undefined?'caught':sheet.current===sheet.q?'q':'p';
            const rest=sheet.leave?.rest??sheet.current;
            out.push({id:sheet.c.id,s:sheet.c.s,state,x:rest.at.x,y:rest.support?.y??rest.at.y,z:rest.at.z,yaw:rest.yaw,shown:sheet.shown});
        }
        return out;
    }
    private ensureArt():void {
        if(this.material.map)return;
        const art=casePaperArt();this.material.map=art.map;this.material.emissiveMap=art.edge;this.material.needsUpdate=true;
    }
    warm():void{
        this.ensureArt();
        for(const mesh of this.batches){mesh.count=1;mesh.visible=true;mesh.setMatrixAt(0,this.matrix.identity());mesh.instanceMatrix.needsUpdate=true;}
        this.paws.warm();this.marks.warm();
    }
    clear():void{this.visibleIds=[];this.sheets.clear();this.primed=false;this.lastCatch=-Infinity;this.catches=[];for(const mesh of this.batches){mesh.count=0;mesh.visible=false;}this.paws.clear();this.marks.clear();}
    /** The atlas is shared for the page's life; only this view's meshes and material go. */
    dispose():void{this.root.removeFromParent();this.clear();for(const mesh of this.batches){mesh.geometry.dispose();mesh.dispose();}this.material.dispose();this.paws.dispose();this.marks.dispose();}

    private motion():boolean {return !this.still&&feelState().on('paperWind')&&!reducedMotion();}
    /** The eye-catch: a sheet lying out in the open, first seen in the clear from this camera at a middle distance,
     * catches a gust and settles back (CATCH). Close sheets are plain to see; moving ones already catch the eye. */
    private notice(sheet:Sheet,distance:number,now:number,motion:boolean):void {
        if(sheet.noticed)return;
        if(sheet.arrive||sheet.leave||sheet.flying||distance<CATCH.near){sheet.noticed=true;return;}
        if(distance>CATCH.far||this.catchRays>=CATCH.rays||now-(sheet.lookedAt??-Infinity)<CATCH.retryMs)return;
        const rest=sheet.current,y=rest.support!.y+.25;
        this.catchRays++;sheet.lookedAt=now;
        if(!this.clearPath(this.cameraAt,{x:rest.at.x,y,z:rest.at.z}))return;
        sheet.noticed=true;
        if(!motion||sheet.sheltered!==false||sheet.q&&sheet.current!==sheet.p||now-this.lastCatch<CATCH.gapMs)return;
        this.catches=this.catches.filter(c=>now-c.at<CATCH.quietMs);
        if(this.catches.some(c=>Math.hypot(c.x-rest.at.x,c.z-rest.at.z)<CATCH.apart))return;
        sheet.caught=now;this.lastCatch=now;this.stats.caught++;this.catches.push({x:rest.at.x,z:rest.at.z,at:now});
    }
    /** New ids arrive (blowing in, if born moments ago while this view watched); gone ids blow away if on screen nearby. */
    private sync(clues:readonly CaseClue[],now:number,motion:boolean,eye:THREE.Vector3):void {
        const live=this.live;live.clear();let flying=0;
        for(const sheet of this.sheets.values())
            if(sheet.arrive&&now>=sheet.arrive.start&&now<sheet.arrive.start+ARRIVE_MS||sheet.leave&&now>=sheet.leave.start&&now<sheet.leave.start+LEAVE_MS)flying++;
        for(const c of clues){
            live.add(c.id);
            if(this.sheets.has(c.id))continue;
            const hash=paperHash(c.id),yaw=(hash>>>4)%628/100;
            const p:Rest={at:c.p,support:undefined,yaw},q:Rest|undefined=c.q?{at:c.q,support:undefined,yaw:yaw+((hash>>>20)%100/100-.5)*1.4}:undefined;
            const sheet:Sheet={c,hash,family:paperFamily(c.s),art:Math.min(2,paperArt(c.s)),shape:paperShape(c.s),scale:.93+(hash>>>12)%15/100,
                p,...(q?{q}:{}),current:p,lift:0,liftV:0,hop:0,hopV:0,bend:0,bendTo:0,touchedAt:-Infinity,loose:{lifts:[],next:1,count:0},seenAt:-Infinity,shown:false};
            // Blows in only where someone might watch: near this view.
            if(this.primed&&motion&&now-c.at<ARRIVING_WINDOW&&Math.hypot(c.p.x-eye.x,c.p.z-eye.z)<50){
                // Staggered, so a burst of new sheets is a few pages blowing in, never a storm.
                sheet.arrive={start:Math.max(now,c.at)+(hash>>>8)%700+Math.max(0,flying-MAX_FLYING)*250};flying++;this.stats.arrivals++;
            }
            this.sheets.set(c.id,sheet);
        }
        for(const [id,sheet] of this.sheets){
            if(live.has(id)||sheet.leave)continue;
            // Every sheet on screen in range blows away; one out of sight simply goes.
            const rest=sheet.current,near=Math.hypot(rest.at.x-eye.x,(rest.support?.y??rest.at.y)-eye.y,rest.at.z-eye.z)<CLUES.range+4;
            if(!motion||!sheet.shown||!near||!rest.support||flying>=MAX_FLYING){if(sheet.shown&&motion)this.stats.popped++;this.sheets.delete(id);continue;}
            flying++;sheet.arrive=undefined;this.stats.departures++;
            sheet.leave={start:now+(sheet.hash>>>9)%500,to:new THREE.Vector3(),far:false,rest};
            this.planLeave(sheet,rest);
        }
        this.primed=true;
    }
    /** This frame's resting spot. A loose sheet is at `q` after an odd number of lifts (in the air, its destination). */
    private place(sheet:Sheet,now:number,motion:boolean):Rest|undefined {
        if(sheet.leave)return sheet.leave.rest;
        const p=this.supported(sheet.p);if(!p)return undefined;
        sheet.current=p;sheet.flying=false;
        if(!motion||!sheet.q||sheet.arrive||!this.supported(sheet.q))return p;
        const loose=looseLifts(sheet.c.id,sheet.c.at,sheet.c.p,now,sheet.loose.lifts,sheet.loose.next,sheet.loose.count);
        sheet.loose.next=loose.nextSlot;sheet.loose.count=loose.count;
        if(sheet.loose.count%2)sheet.current=sheet.q;
        const last=sheet.loose.lifts[sheet.loose.lifts.length-1];
        sheet.flying=!!last&&now>=last.at&&now<last.at+LOOSE.flightMs;
        return sheet.current;
    }
    private supported(rest:Rest):Rest|undefined {
        if(rest.support===undefined)rest.support=this.support(rest.at)??null;
        return rest.support?rest:undefined;
    }
    /** Downwind and up, whichever way is open; with no way out (a low ceiling), it flips over where it lay. */
    private planLeave(sheet:Sheet,rest:Rest):void {
        const from={x:rest.at.x,y:rest.support!.y+.3,z:rest.at.z},w=windAt(rest.at.x,rest.at.z),turn=((sheet.hash>>>5)%100/100-.5)*.9;
        for(const [angle,reach,rise] of [[turn,6,3.2],[turn+.7,5,2.6],[turn-.7,5,2.6],[0,1.2,2.2]] as const){
            const c=Math.cos(angle),s=Math.sin(angle),to={x:from.x+(w.x*c-w.z*s)*reach,y:from.y+rise,z:from.z+(w.x*s+w.z*c)*reach};
            if(this.clearPath(from,{x:from.x,y:to.y,z:from.z})&&this.clearPath(from,to)){sheet.leave!.to.set(to.x,to.y,to.z);sheet.leave!.far=true;return;}
        }
        sheet.leave!.to.set(from.x,from.y+.25,from.z);
    }
    /** From upwind and above, if that air is open; else straight down from a little above. */
    private planArrive(rest:Rest):THREE.Vector3 {
        const land={x:rest.at.x,y:rest.support!.y+.15,z:rest.at.z},w=windAt(rest.at.x,rest.at.z);
        for(const [back,rise] of [[2.4,1.9],[.6,1.4]] as const){
            const from={x:land.x-w.x*back,y:land.y+rise,z:land.z-w.z*back};
            if(this.clearPath(from,land)&&this.clearPath(land,{x:land.x,y:from.y,z:land.z}))return new THREE.Vector3(from.x,from.y,from.z);
        }
        return new THREE.Vector3(land.x,land.y+.45,land.z);
    }
    /** Edge flex (a damped spring toward the passing gust) and the in-place hop after a disturbance. */
    private animate(sheet:Sheet,now:number,dt:number,motion:boolean):void {
        if(!motion){sheet.lift=sheet.liftV=sheet.hop=sheet.hopV=0;return;}
        const step=Math.min(dt,.05),stock=STOCK[sheet.family]!,rest=sheet.current;
        if(sheet.sheltered===undefined&&rest.support){
            // Interiors and the sewers are calm: a roof within eight units keeps the wind off.
            const y=rest.support.y;sheet.sheltered=y< -.5||!this.clearPath({x:rest.at.x,y:y+.4,z:rest.at.z},{x:rest.at.x,y:y+8,z:rest.at.z});
        }
        const gust=sheet.sheltered?0:gustAt(rest.at.x,rest.at.z,now-(sheet.hash>>>3)%400);
        const target=gust*stock.lift*FEEL.paperWind.params.strength,k=7+(sheet.hash>>>6)%40/10;
        sheet.liftV+=(k*k*(target-sheet.lift)-2*.32*k*sheet.liftV)*step;sheet.lift=Math.max(-.01,Math.min(.25,sheet.lift+sheet.liftV*step));
        sheet.hopV-=22*step;sheet.hop+=sheet.hopV*step;
        if(sheet.hop<0){sheet.hop=0;sheet.hopV=sheet.hopV< -.6?-sheet.hopV*.25:0;}
        // The lifting edge turns toward a rat or a ball over a few frames, then eases back to the upwind side.
        const w=windAt(rest.at.x,rest.at.z);sheet.bendTo+=wrap(Math.atan2(-w.z,-w.x)-sheet.bendTo)*Math.min(1,step*1.2);
        sheet.bend+=wrap(sheet.bendTo-sheet.bend)*Math.min(1,step*9);
    }
    private write(sheet:Sheet,now:number,motion:boolean,mesh:THREE.InstancedMesh,index:number):void {
        const rest=sheet.leave?.rest??sheet.current,support=rest.support!,stock=STOCK[sheet.family]!,pose=this.pose;
        let roll=0,pitch=0,yaw=rest.yaw,scale=sheet.scale,lift=sheet.lift;
        const gust=motion&&!sheet.sheltered?gustAt(rest.at.x,rest.at.z,now):0;
        let flutter=(.006+.02*gust)*stock.gain*Math.min(1,Math.abs(sheet.lift)*14);
        const flight=this.flight(sheet,now,motion,rest);
        if(flight){
            pose.position.copy(flight.at);pose.quaternion.identity();
            roll=flight.roll;pitch=flight.pitch;yaw=flight.yaw;scale*=flight.scale;flutter=.035*stock.gain+.01;lift=.06*flight.flap;
        }else{
            pose.position.set(rest.at.x,support.y+.012+sheet.hop+(sheet.hash%7)*.0006,rest.at.z);
            this.normal.set(support.normal.x,support.normal.y,support.normal.z).normalize();
            pose.quaternion.setFromUnitVectors(UP,this.normal);
        }
        this.euler.set(roll,yaw,pitch);this.turn.setFromEuler(this.euler);pose.quaternion.multiply(this.turn);
        pose.scale.setScalar(scale);pose.updateMatrix();mesh.setMatrixAt(index,pose.matrix);
        // A direction at world angle a lies at a + yaw in the sheet's own frame (three's Y rotation).
        const local=wrap(sheet.bend+yaw),tile=paperCellOffset(sheet.family,sheet.art),back=paperCellOffset(sheet.family,PAPER_BACK);
        const phase=(now/1000*13*(1+(sheet.hash>>>10)%30/100)+sheet.hash%7)%TAU;
        (mesh.geometry.getAttribute('paperTile') as THREE.InstancedBufferAttribute).setXYZW(index,tile.u,tile.v,back.u,back.v);
        (mesh.geometry.getAttribute('paperBend') as THREE.InstancedBufferAttribute).setXYZW(index,local,lift,flutter,phase);
    }
    /** Blowing in, blowing away, or a loose sheet carried between its spots: position, tumble and absolute yaw. */
    private flight(sheet:Sheet,now:number,motion:boolean,rest:Rest):Flight|undefined {
        const h=sheet.hash,side=(h&2)?1:-1,out=this.flightAt,w=windAt(rest.at.x,rest.at.z);
        if(sheet.arrive){
            sheet.arrive.from??=this.planArrive(rest);
            const u=(now-sheet.arrive.start)/ARRIVE_MS;
            if(u>=1){sheet.arrive=undefined;sheet.liftV+=1.4;return undefined;}
            const e=1-(1-u)**2,sway=Math.sin(u*Math.PI*2.4)*.35*(1-u);
            out.set(rest.at.x,rest.support!.y+.012,rest.at.z).sub(sheet.arrive.from).multiplyScalar(e).add(sheet.arrive.from);
            out.x+=-w.z*sway*side;out.z+=w.x*sway*side;
            return {at:out,roll:(1-u)**2*1.1*Math.sin(u*7+h%5),pitch:(1-u)*.5*Math.sin(u*5+1),yaw:rest.yaw+(1-u)*side*1.2,scale:1,flap:Math.sin(u*14)};
        }
        if(sheet.leave){
            const u=(now-sheet.leave.start)/LEAVE_MS;if(u<0)return undefined;
            const e=u*u*(3-2*u),sway=Math.sin(u*Math.PI*3)*.3*u;
            out.set(rest.at.x,rest.support!.y+.012,rest.at.z);out.lerp(sheet.leave.to,e);out.y+=Math.sin(u*Math.PI)*.4;
            out.x+=-w.z*sway*side;out.z+=w.x*sway*side;
            // One in the open sails off out of sight; one with nowhere to fly flips over once and is gone.
            const scale=sheet.leave.far?(u<.72?1:Math.max(0,1-(u-.72)/.28)):(u<.35?1:Math.max(0,1-(u-.35)/.3));
            return {at:out,roll:u*2.4*side,pitch:Math.sin(u*6)*.5,yaw:rest.yaw+u*side*2,scale,flap:Math.sin(u*16)};
        }
        if(sheet.caught!==undefined){
            const u=(now-sheet.caught)/CATCH.ms;
            if(u>=1||!motion){sheet.caught=undefined;sheet.liftV+=1.2;}
            else{
                // Up off the ground, a little downwind and back, tipping up nearly on edge (a flash of paper), and down where it lay.
                const up=Math.sin(u*Math.PI),drift=Math.sin(u*Math.PI)*.35;
                out.set(rest.at.x+w.x*drift,rest.support!.y+.012+up*CATCH.lift,rest.at.z+w.z*drift);
                return {at:out,roll:Math.sin(u*Math.PI)*CATCH.roll*side,pitch:Math.sin(u*TAU)*.3,yaw:rest.yaw+Math.sin(u*Math.PI)*.5*side,scale:1,flap:Math.sin(u*16)};
            }
        }
        if(!motion||!sheet.q?.support||!sheet.p.support)return undefined;
        const last=sheet.loose.lifts[sheet.loose.lifts.length-1];
        if(!last||now<last.at||now>=last.at+LOOSE.flightMs)return undefined;
        const [a,b]=last.from==='p'?[sheet.p,sheet.q]:[sheet.q,sheet.p];
        const u=(now-last.at)/LOOSE.flightMs,e=u*u*(3-2*u),dx=b.at.x-a.at.x,dz=b.at.z-a.at.z,d=Math.hypot(dx,dz)||1;
        const sway=Math.sin(u*Math.PI*3)*.25*(1-u);
        out.set(a.at.x+dx*e-dz/d*sway,a.support!.y+(b.support!.y-a.support!.y)*e+.012+Math.sin(u*Math.PI)*(.8+(h%40)/100),a.at.z+dz*e+dx/d*sway);
        // The roll stays under a half turn, so the back only flashes.
        return {at:out,roll:Math.sin(u*Math.PI)*1.25*side,pitch:Math.sin(u*TAU)*.35,yaw:a.yaw+wrap(b.yaw-a.yaw)*e,scale:1,flap:Math.sin(u*18)};
    }
}
function wrap(a:number):number {return Math.atan2(Math.sin(a),Math.cos(a));}

/** One sheet: a front layer and a back layer (reversed winding, mirrored so its own print reads from below) with its
 * rest shape baked in; every vertex knows its side, so each finds its atlas cell. */
function paperGeometry(family:number,shape:number):THREE.BufferGeometry {
    const [w,d]=PAPER_SIZES[family]!,front=new THREE.PlaneGeometry(w,d,6,8);front.rotateX(-Math.PI/2);
    const pos=front.getAttribute('position'),uv=front.getAttribute('uv'),profile=SHAPES[family]![shape]!;
    for(let i=0;i<pos.count;i++){
        const a=pos.getX(i)/w+.5,b=-pos.getZ(i)/d+.5;
        pos.setY(i,profile(a,1-b));
        const t=paperUv(family,a,b);uv.setXY(i,t.u,t.v);
    }
    front.computeVertexNormals();
    const back=front.clone(),buv=back.getAttribute('uv'),bnormal=back.getAttribute('normal'),bpos=back.getAttribute('position');
    for(let i=0;i<bpos.count;i++){
        const t=paperUv(family,.5-bpos.getX(i)/w,-bpos.getZ(i)/d+.5);
        buv.setXY(i,t.u,t.v);bnormal.setXYZ(i,-bnormal.getX(i),-bnormal.getY(i),-bnormal.getZ(i));
    }
    const index=back.getIndex()!;
    for(let i=0;i<index.count;i+=3){const t=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,t);}
    const merged=new THREE.BufferGeometry(),count=pos.count;
    for(const name of ['position','normal','uv']){
        const x=front.getAttribute(name),y=back.getAttribute(name),data=new Float32Array(x.array.length*2);
        data.set(x.array as Float32Array);data.set(y.array as Float32Array,x.array.length);
        merged.setAttribute(name,new THREE.BufferAttribute(data,x.itemSize));
    }
    const side=new Float32Array(count*2);side.fill(1,count);merged.setAttribute('paperSide',new THREE.BufferAttribute(side,1));
    const fi=front.getIndex()!,indices=new Uint16Array(fi.count*2);
    for(let i=0;i<fi.count;i++){indices[i]=fi.getX(i);indices[fi.count+i]=index.getX(i)+count;}
    merged.setIndex(new THREE.BufferAttribute(indices,1));merged.computeBoundingSphere();
    front.dispose();back.dispose();
    return merged;
}
