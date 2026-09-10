import type {FoleyWorld} from '../audio/FoleyWorld';
import {DispatchSirenAudio} from '../audio/DispatchSirenAudio';
import { createCaseGrip } from './CaseGrip';
import {setText} from '../ui/setText';
import {clearAimLabel} from '../ui/aimClearance';
import { ExtraCaseVisual } from './ExtraCaseVisual';
import * as THREE from 'three';
import type { ChaosState, CorpseState } from '../shared/chaosState';
import { CHAOS_TUNING, CASE_LOOSE_SCALE, CASE_HAND, CASE_CARRY_ROTATION, DISPATCH_STATIONS } from '../shared/chaosState';
import { BALL_RADIUS } from '../shared/ballTuning';
import { createRatMesh } from '../utils/RatModel';
import { RatAnimator, RAT_CARRY_SHOULDER } from '../utils/RatAnimator';
import { disposeMeshResources } from '../utils/disposeMeshResources';
import { createCheeseBallGeometry, createCheeseBallMaterial } from '../weapons/CheeseProjectileModel';
import { CheeseImpactEffects } from '../weapons/CheeseImpactEffects';
import { bindIncidentAudio, disposeIncidentAudio, playDelayedThud, playPopcornPop, startCaseBuzz } from '../audio/IncidentAudio';
import type { RatEntity } from '../entities/RatEntity';
import { incidentInfo } from '../shared/incidentCatalog';
import { DispatchHud } from './DispatchHud';
import { AssignmentDestinations } from './AssignmentDestinations';
import type { FeedbackCue } from '../audio/FeedbackAudio';
import type { Vec3Data } from '../shared/networkProtocol';
import { locateCase } from './caseLocator';
import { PressureMachine } from './PressureMachine';
import { CaseBeacon } from './CaseBeacon';
import { buildDispatchModel, updateDispatchSiren } from './DispatchModel';
import { reactToLandmarkImpact } from './LandmarkReactions';
import { addLeatherBriefcase } from './CaseModel';
import { ChaosPresentation, copyPresentationPose, type PresentationPose } from '../shared/ChaosPresentation';

const caseCarryRotation=new THREE.Quaternion(CASE_CARRY_ROTATION.x,CASE_CARRY_ROTATION.y,CASE_CARRY_ROTATION.z,CASE_CARRY_ROTATION.w);

export class ChaosView {
    private readonly root=new THREE.Group();
    private readonly caseRoot=new THREE.Group();
    private readonly extraCases=new Map<string,ExtraCaseVisual>();
    private readonly caseBeacon:CaseBeacon;
    private readonly dispatch=new THREE.Group();
    private readonly kiosks:Array<ReturnType<typeof buildDispatchModel>>=[];
    private readonly sirenAudio:DispatchSirenAudio;
    private readonly pressureMachine:PressureMachine;
    private readonly textCanvas=document.createElement('canvas');
    private readonly textTexture:THREE.CanvasTexture;
    private readonly hud:DispatchHud;
    private readonly assignmentDestinations:AssignmentDestinations;
    private readonly caseMarker=document.createElement('div');
    private readonly caseMarkerIcon=document.createElement('div');
    private readonly caseMarkerArrow=document.createElement('div');
    private readonly caseMarkerDetail=document.createElement('div');
    private readonly impacts:CheeseImpactEffects;
    private readonly ballGeometry=createCheeseBallGeometry();
    private readonly ballMaterial=createCheeseBallMaterial();
    private readonly bullets=new THREE.InstancedMesh(this.ballGeometry,this.ballMaterial,CHAOS_TUNING.maxShots);
    private readonly chargedMaterial=createCheeseBallMaterial(true);
    private readonly chargedBullets=new THREE.InstancedMesh(this.ballGeometry,this.chargedMaterial,CHAOS_TUNING.maxShots);
    private readonly glowGeometry=new THREE.SphereGeometry(.17,24,16);
    private readonly glowMaterial=new THREE.MeshBasicMaterial({color:0xff240b,side:THREE.BackSide,transparent:true,opacity:.96,blending:THREE.AdditiveBlending,depthTest:true,depthWrite:false,toneMapped:false});
    private readonly chargedGlow=new THREE.InstancedMesh(this.glowGeometry,this.glowMaterial,CHAOS_TUNING.maxShots);
    private readonly dangerGlow=new THREE.InstancedMesh(this.glowGeometry,new THREE.MeshBasicMaterial({color:0xff4822,side:THREE.BackSide,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),CHAOS_TUNING.maxShots);
    private readonly dangerTrails=new THREE.InstancedMesh(new THREE.SphereGeometry(.1,8,6),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.65,depthWrite:false,toneMapped:false}),CHAOS_TUNING.maxShots);
    private readonly trailPose=new THREE.Object3D();
    private readonly trailDirection=new THREE.Vector3();
    private readonly trailAxis=new THREE.Vector3(0,0,1);
    private readonly dangerColor=new THREE.Color(0xff602a);
    private readonly lethalColor=new THREE.Color(0xff3015);
    private readonly ownCrossfireTint=new THREE.Color(1,1,1);
    private readonly enemyCrossfireTint=new THREE.Color(2.4,1.4,1.2);
    private myId='';
    private readonly ballPose=new THREE.Object3D();
    private readonly missileTrail=new THREE.InstancedMesh(new THREE.SphereGeometry(.18,8,8),new THREE.MeshBasicMaterial({color:0xff2a12,transparent:true,opacity:.42,toneMapped:false,depthWrite:false}),12);
    private corpses=new Map<string,{mesh:THREE.Group;animator:RatAnimator;state:CorpseState}>();
    private arm:THREE.Group|null=null;
    private carrier:RatEntity|null=null;
    private state:ChaosState|null=null;
    private receivedAt=0;
    private readonly presentation=new ChaosPresentation();
    private readonly presented:PresentationPose={p:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1}};
    private lastDispatch='';
    private readonly p=new THREE.Vector3();
    private readonly impactPoint=new THREE.Vector3();
    private readonly impactNormal=new THREE.Vector3();
    private readonly audioPosition=new THREE.Vector3();
    setScores(scores: readonly import('../shared/networkProtocol').ScoreEntry[], myId: string):void {this.myId=myId;this.hud.setScores(scores,myId);}
    constructor(private readonly scene:THREE.Scene,private resolveRat:(id:string)=>RatEntity|undefined,private audio?:AudioContext,private extrapolate=true,private feedback?:(cue:FeedbackCue,origin?:Vec3Data)=>void,private foley?:FoleyWorld){
        this.sirenAudio=new DispatchSirenAudio(this.audio);
        this.bullets.count=0;this.bullets.frustumCulled=false;this.root.add(this.bullets);
        this.chargedBullets.count=0;this.chargedBullets.frustumCulled=false;this.chargedBullets.name='crossfire-balls';this.root.add(this.chargedBullets);
        this.chargedGlow.count=0;this.chargedGlow.frustumCulled=false;this.chargedGlow.name='crossfire-glow';this.root.add(this.chargedGlow);
        for(const [mesh,name] of [[this.dangerGlow,'danger-cheese-rims'],[this.dangerTrails,'danger-cheese-trails']] as const){mesh.count=0;mesh.frustumCulled=false;mesh.name=name;this.root.add(mesh);}
        this.missileTrail.count=0;this.missileTrail.frustumCulled=false;this.missileTrail.name='case-missile-trail';this.root.add(this.missileTrail);
        bindIncidentAudio(this.audio);
        this.root.name='records-chaos';scene.add(this.root);scene.add(this.caseRoot,this.dispatch);
        this.caseRoot.name='hot-case';
        this.caseBeacon=new CaseBeacon(scene);
        addLeatherBriefcase(this.caseRoot);
        this.caseRoot.userData.aimTarget=true;
        this.pressureMachine=new PressureMachine(scene,this.audio);
        this.dispatch.userData.aimTarget=true;
        this.textCanvas.width=256;this.textCanvas.height=128;
        this.textTexture=new THREE.CanvasTexture(this.textCanvas);
        for(const station of DISPATCH_STATIONS){
            const cabinet=new THREE.Group();cabinet.position.set(station.box.x,station.box.y,station.box.z);
            cabinet.name='dispatch-'+station.id;this.dispatch.add(cabinet);
            this.kiosks.push(buildDispatchModel(cabinet,this.textTexture));
        }
        this.hud=new DispatchHud(frequency=>this.feedback?this.feedback('tick'):this.bell(frequency),this.feedback);
        this.assignmentDestinations=new AssignmentDestinations(scene);
        // DOM projection stays crisp at city scale and visible through all architecture.
        // It adds no dynamic lights, raycasts, or physics to the physical case.
        Object.assign(this.caseMarker.style,{position:'fixed',left:'0',top:'0',display:'none',width:'174px',
            textAlign:'center',pointerEvents:'none',zIndex:'6',color:'#ffe6a1',font:'bold 12px monospace',
            textShadow:'0 2px 3px #000, 0 0 5px #000',willChange:'transform'});
        this.caseMarker.setAttribute('aria-label','Hot Case location');
        Object.assign(this.caseMarkerIcon.style,{position:'relative',margin:'0 auto 5px',width:'38px',height:'34px',
            boxSizing:'border-box',border:'2px solid #ffe6a1',borderRadius:'5px',background:'#311a15f2',
            boxShadow:'0 0 0 3px #110d12dc, 0 0 16px #ff9b3266'});
        const handle=document.createElement('div');
        Object.assign(handle.style,{position:'absolute',left:'10px',top:'-8px',width:'10px',height:'6px',
            border:'2px solid #ffe6a1',borderBottom:'0',borderRadius:'3px 3px 0 0',background:'#201218'});
        const latch=document.createElement('div');
        Object.assign(latch.style,{position:'absolute',left:'14px',top:'10px',width:'6px',height:'10px',
            background:'#ffe6a1',boxShadow:'-10px 0 0 -2px #ffe6a1, 10px 0 0 -2px #ffe6a1'});
        this.caseMarkerIcon.appendChild(handle);this.caseMarkerIcon.appendChild(latch);
        Object.assign(this.caseMarkerArrow.style,{position:'absolute',left:'50%',top:'17px',width:'0',height:'0',
            borderTop:'6px solid transparent',borderBottom:'6px solid transparent',borderLeft:'11px solid #fff1cc',
            transformOrigin:'0 0',filter:'drop-shadow(0 0 2px #000)',display:'none'});
        const title=document.createElement('div');title.textContent='HOT CASE';
        Object.assign(title.style,{display:'inline-block',padding:'0',background:'none',
            letterSpacing:'.8px',border:'none',fontSize:'11px'});
        Object.assign(this.caseMarkerDetail.style,{marginTop:'2px',fontSize:'9px',color:'#d3c8b3'});
        for(const child of [title,this.caseMarkerDetail])this.caseMarker.appendChild(child);
        document.body.appendChild(this.caseMarker);
        this.impacts=new CheeseImpactEffects(scene);
    }
    apply(state:ChaosState){
        this.foley?.apply(state);
        this.state=state;this.receivedAt=performance.now();
        this.assignmentDestinations.update(state.assignment);
        if(this.extrapolate)this.presentation.apply(state,this.receivedAt);
        const extraIds=new Set((state.extraCases??[]).map(c=>c.id));
        for(const [id,visual] of this.extraCases)if(!extraIds.has(id)){visual.dispose();this.extraCases.delete(id);}
        for(const extra of state.extraCases??[]){
            let visual=this.extraCases.get(extra.id);
            if(!visual){visual=new ExtraCaseVisual(this.scene,extra.id,this.resolveRat,this.extrapolate);this.extraCases.set(extra.id,visual);}
            visual.apply(state,extra,this.receivedAt);
        }
        for(const hit of state.impacts){
            if(!hit.audioOnly)this.impacts.emit(this.impactPoint.set(hit.p.x,hit.p.y,hit.p.z),this.impactNormal.set(hit.n.x,hit.n.y,hit.n.z),hit.surface,hit.scale??1);
            if(hit.cue==='pop')playPopcornPop(hit.p);
            if(hit.cue==='thud')playDelayedThud(hit.p);
            if(hit.cue==='case-hit')this.feedback?.('case-hit',hit.p);
            if(!hit.audioOnly)reactToLandmarkImpact(this.root.parent as THREE.Scene,hit.p);
        }
        const corpses=new Set(state.corpses.map(c=>c.id));
        for(const [id,c] of this.corpses)if(!corpses.has(id)){this.root.remove(c.mesh);disposeMeshResources(c.mesh);this.corpses.delete(id);}
        for(const c of state.corpses){
            const victim=this.resolveRat(c.victimId);if(victim?.dead)victim.useSharedCorpse();
            let model=this.corpses.get(c.id);
            if(!model){
                const mesh=createRatMesh(c.appearance);
                model={mesh,animator:new RatAnimator(mesh),state:c};this.corpses.set(c.id,model);this.root.add(mesh);
            }
            model.state=c;
        }
    }
    private setCarrier(entity:RatEntity|null){
        if(this.carrier===entity)return;
        if(this.arm){this.arm.removeFromParent();disposeMeshResources(this.arm);this.arm=null;}
        this.carrier=entity;
        if(!entity)return;
        this.arm=createCaseGrip(entity);
    }
    update(dt:number,camera:THREE.Camera){
        this.impacts.update(dt);
        camera.getWorldPosition(this.audioPosition);
        if(this.audio)bindIncidentAudio(this.audio,this.audioPosition);
        const s=this.state;if(!s)return;
        // The solo preview already stepped physics this frame. Extrapolating it
        // again counted CPU/render preparation time as extra ball travel.
        const renderTime=performance.now();
        const elapsed=this.extrapolate?Math.min((renderTime-this.receivedAt)/1000,.08):0,now=s.time+elapsed*1000;
        const owner=s.case.owner?this.resolveRat(s.case.owner):undefined;
        this.setCarrier(owner&&!owner.dead?owner:null);
        this.caseRoot.scale.setScalar(s.case.owner?1:CASE_LOOSE_SCALE);
        this.caseRoot.visible=!s.case.returningUntil || Math.floor(now/100)%2===0;
        const evidence=s.dispatch.phase==='active'&&incidentInfo(s.dispatch.incident).id==='evidence-tampering';
        const hot=!s.case.owner&&(!!s.case.missileOwner||evidence);
        this.caseRoot.traverse(object=>{
            const material=(object as THREE.Mesh).material;
            if(!(material instanceof THREE.MeshStandardMaterial)||object.name!=='leather-case-shell')return;
            material.emissive.setHex(hot?0xff2208:0x633d29);
            material.emissiveIntensity=hot?1.4:.28;
        });
        if(owner&&!owner.dead){
            const anchor=this.arm!.parent!;
            // Anchor the rigid case at the gripping paw, even while the coat
            // subtly stretches on a step or landing. Its handle never slides.
            this.caseRoot.position.set(CASE_HAND.x,CASE_HAND.y+.43,CASE_HAND.z).sub(RAT_CARRY_SHOULDER);
            anchor.localToWorld(this.caseRoot.position);
            anchor.getWorldQuaternion(this.caseRoot.quaternion).normalize().multiply(caseCarryRotation);
            this.caseRoot.position.sub(this.p.set(0,.43,0).applyQuaternion(this.caseRoot.quaternion));
        }else{
            if(!this.extrapolate||!this.presentation.looseCase(renderTime,this.presented))copyPresentationPose(s.case,this.presented);
            const {p,q}=this.presented;
            this.caseRoot.position.set(p.x,p.y,p.z);this.caseRoot.quaternion.set(q.x,q.y,q.z,q.w);
        }
        this.caseBeacon.update(this.caseRoot,camera,!!this.carrier?.isPlayer);
        for(const visual of this.extraCases.values())visual.update(camera,renderTime,now);
        this.updateCaseMarker(camera,now);
        this.bullets.count=0;this.chargedBullets.count=0;this.chargedGlow.count=0;this.missileTrail.count=0;this.dangerGlow.count=0;this.dangerTrails.count=0;
        const crossfire=s.dispatch.phase==='active'&&incidentInfo(s.dispatch.incident).id==='crossfire';
        for(let i=0;i<Math.min(s.shots.length,CHAOS_TUNING.maxShots);i++){
            const shot=s.shots[i];
            const p=shot.stuckUntil||!(this.extrapolate&&this.presentation.shot(shot.id,renderTime,this.presented))?shot.p:this.presented.p;
            const scale=(shot.radius??BALL_RADIUS)/BALL_RADIUS;
            this.ballPose.position.set(p.x,p.y,p.z);
            this.ballPose.rotation.set(now*.015+i,now*.009,0);
            const pulse=shot.stuckUntil?1+Math.sin(now*.03)*.16:1;
            this.ballPose.scale.setScalar(scale*pulse);this.ballPose.updateMatrix();
            const own=shot.owner===this.myId||!!this.resolveRat(shot.owner)?.isPlayer;
            const hot=crossfire&&shot.wallBounced;
            const batch=hot?this.chargedBullets:this.bullets;
            const ballIndex=batch.count++;batch.setMatrixAt(ballIndex,this.ballPose.matrix);
            if(hot)batch.setColorAt(ballIndex,own?this.ownCrossfireTint:this.enemyCrossfireTint);
            if(!own){
                this.ballPose.scale.setScalar(scale*pulse*(hot?1.14:1));this.ballPose.updateMatrix();
                const rim=hot?this.chargedGlow:this.dangerGlow;rim.setMatrixAt(rim.count++,this.ballPose.matrix);
                this.trailDirection.set(shot.v.x,shot.v.y,shot.v.z);
                if(!shot.stuckUntil&&this.trailDirection.lengthSq()>.01){
                    this.trailDirection.normalize();const length=Math.min(2.4,(hot?1.4:.85)*Math.sqrt(scale));
                    this.trailPose.position.copy(this.ballPose.position).addScaledVector(this.trailDirection,-scale*BALL_RADIUS-length/2);
                    this.trailPose.quaternion.setFromUnitVectors(this.trailAxis,this.trailDirection);
                    this.trailPose.scale.set(.5*Math.sqrt(scale),.5*Math.sqrt(scale),length/.2);this.trailPose.updateMatrix();
                    const at=this.dangerTrails.count++;this.dangerTrails.setMatrixAt(at,this.trailPose.matrix);this.dangerTrails.setColorAt(at,hot?this.lethalColor:this.dangerColor);
                }
            }
        }
        const missiles=[s.case,...s.extraCases??[]].filter(c=>!c.owner&&(c.missileOwner||evidence));
        let nearestCase=missiles[0],nearestDistance=Infinity;
        for(const missile of missiles){
            const distance=(this.audioPosition.x-missile.p.x)**2+(this.audioPosition.y-missile.p.y)**2+(this.audioPosition.z-missile.p.z)**2;
            if(distance<nearestDistance){nearestDistance=distance;nearestCase=missile;}
        }
        startCaseBuzz(evidence&&!!nearestCase,nearestCase?.p);
        for(const missile of missiles.slice(0,8)){
            const visual=missile===s.case?this.caseRoot:'id' in missile&&typeof missile.id==='string'?this.extraCases.get(missile.id)?.root:undefined;
            if(!visual)continue;
            this.ballPose.position.copy(visual.position);this.ballPose.quaternion.copy(visual.quaternion);
            this.ballPose.scale.set(1.5,.8,1.2);this.ballPose.updateMatrix();
            this.missileTrail.setMatrixAt(this.missileTrail.count++,this.ballPose.matrix);
        }
        this.bullets.instanceMatrix.needsUpdate=true;this.chargedBullets.instanceMatrix.needsUpdate=true;
        if(this.chargedBullets.instanceColor)this.chargedBullets.instanceColor.needsUpdate=true;
        this.chargedGlow.instanceMatrix.needsUpdate=true;this.missileTrail.instanceMatrix.needsUpdate=true;
        this.dangerGlow.instanceMatrix.needsUpdate=true;this.dangerTrails.instanceMatrix.needsUpdate=true;
        if(this.dangerTrails.instanceColor)this.dangerTrails.instanceColor.needsUpdate=true;
        for(const c of this.corpses.values()){
            const b=c.state;
            if(!this.extrapolate||!this.presentation.corpse(b.id,renderTime,this.presented))copyPresentationPose(b,this.presented);
            const {p,q}=this.presented;c.mesh.quaternion.set(q.x,q.y,q.z,q.w);
            c.mesh.position.set(p.x,p.y,p.z);
            c.mesh.position.sub(this.p.set(0,.95,0).applyQuaternion(c.mesh.quaternion));
            c.animator.poseDeath((now-b.born)/1000,dt,b.spin,0,false);
        }
        const d=s.dispatch;
        const localCase=[s.case,...s.extraCases??[]].find(c=>c.owner&&this.resolveRat(c.owner)?.isPlayer);
        const hudCase=localCase??s.case,hudOwner=hudCase.owner?this.resolveRat(hudCase.owner):undefined;
        this.hud.update(hudCase===s.case?s:{...s,case:hudCase},now,hudOwner?.name,!!hudOwner?.isPlayer);
        this.assignmentDestinations.updateCue(s.assignment,camera);
        this.pressureMachine.update(s.pressure,now,camera);
        for(const kiosk of this.kiosks){
        updateDispatchSiren(kiosk,d.phase==='ready',renderTime/1000);
        kiosk.switchHandle.position.z=d.phase==='ready'?.58:.55;
        const material=kiosk.lamp.material as THREE.MeshStandardMaterial;
        material.emissive.setHex(d.phase==='ready'?0xffdc8c:d.phase==='active'?0xee793a:0x352d38);
        material.emissiveIntensity=d.phase==='rolling'?(Math.floor(now/120)%2)*1.5:d.phase==='ready'?1.2:.3;
        }
        const nearest=DISPATCH_STATIONS.reduce((distance,s)=>Math.min(distance,Math.hypot(s.box.x-this.audioPosition.x,s.box.y+2.1-this.audioPosition.y,s.box.z-this.audioPosition.z)),Infinity);
        this.sirenAudio.update(d.phase==='ready',nearest);
        if(this.lastDispatch!==d.phase){
            this.lastDispatch=d.phase;

            const ctx=this.textCanvas.getContext('2d')!;
            ctx.fillStyle='#17121d';ctx.fillRect(0,0,256,128);ctx.fillStyle='#f3d7a1';ctx.textAlign='center';
            ctx.font='bold 30px monospace';ctx.fillText('DISPATCH',128,43);
            ctx.font='bold 26px monospace';ctx.fillText(d.phase==='ready'?'READY':d.phase==='cooldown'?'LINE BUSY':d.phase.toUpperCase(),128,93);
            this.textTexture.needsUpdate=true;
        }
    }
    private updateCaseMarker(camera:THREE.Camera,now:number){
        const s=this.state!;
        if(this.carrier?.isPlayer){this.caseMarker.style.display='none';return;}
        // Float the badge above the case so it does not cover the physical pickup
        // or a carrier's gun at close range. The bright shell outline marks its body.
        this.p.copy(this.caseRoot.position);this.p.y+=2.1;
        const location=locateCase(this.p,camera,window.innerWidth,window.innerHeight);
        this.caseMarker.style.display='block';
        // The badge follows the case in world space; its label hangs below it.
        const label=clearAimLabel(location.x,location.y+15,190,90,window.innerWidth,window.innerHeight);
        this.caseMarker.style.transform=`translate(${label.x-87}px,${label.y-32}px)`;
        this.caseMarkerIcon.style.transform=`scale(${1+Math.sin(now*.003)*.045})`;
        this.caseMarkerArrow.style.display=location.edge?'block':'none';
        this.caseMarkerArrow.style.transform=`rotate(${location.angle}rad) translate(29px,-6px)`;
        const status=s.case.returningUntil?'RETURNING':s.case.owner?'CARRIED':'LOOSE';
        setText(this.caseMarkerDetail,`${status} · ${Math.round(location.distance)} m${location.behind?' · BEHIND':''}`);
        this.caseMarkerIcon.style.background=s.case.owner?'#583315f2':'#311a15f2';
    }
    private bell(frequency:number){
        const context=this.audio;if(!context || context.state!=='running')return;
        const oscillator=context.createOscillator(),gain=context.createGain();
        oscillator.type='triangle';oscillator.frequency.setValueAtTime(frequency,context.currentTime);
        const duration=frequency<=200?.6:.12;
        gain.gain.setValueAtTime(frequency<=200?.24:.08,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);
        oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+duration);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
    renderOutline(renderer:THREE.WebGLRenderer,camera:THREE.Camera):void {this.assignmentDestinations.render(renderer,camera);}
    getDiagnostics(){return {receivedShots:this.state?.shots.length??0,renderedBalls:this.bullets.count+this.chargedBullets.count,corpses:this.corpses.size,snapshotAgeMs:this.receivedAt?performance.now()-this.receivedAt:null,presentation:this.extrapolate?this.presentation.diagnostics():null};}
    dispose(){
        this.sirenAudio.dispose();this.assignmentDestinations.dispose();
        this.presentation.clear();
        for(const visual of this.extraCases.values())visual.dispose();this.extraCases.clear();
        this.pressureMachine.dispose();this.caseBeacon.dispose();this.setCarrier(null);this.hud.dispose();this.caseMarker.remove();this.root.removeFromParent();this.caseRoot.removeFromParent();this.dispatch.removeFromParent();
        disposeMeshResources(this.caseRoot);disposeMeshResources(this.dispatch);
        startCaseBuzz(false);disposeIncidentAudio();this.impacts.dispose();this.textTexture.dispose();
        disposeMeshResources(this.root);this.bullets.dispose();this.chargedBullets.dispose();this.chargedGlow.dispose();this.dangerGlow.dispose();this.dangerTrails.dispose();this.missileTrail.dispose();this.ballGeometry.dispose();this.glowGeometry.dispose();this.ballMaterial.dispose();this.chargedMaterial.dispose();this.glowMaterial.dispose();
    }
}
