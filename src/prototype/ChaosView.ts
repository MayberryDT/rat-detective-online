import { createCaseGrip } from './CaseGrip';
import { ExtraCaseVisual } from './ExtraCaseVisual';
import * as THREE from 'three';
import type { ChaosState, CorpseState } from '../shared/chaosState';
import { CHAOS_TUNING, CASE_LOOSE_SCALE, CASE_HAND, CASE_CARRY_ROTATION, DISPATCH_STATIONS } from '../shared/chaosState';
import { createRatMesh } from '../utils/RatModel';
import { RatAnimator, RAT_CARRY_SHOULDER } from '../utils/RatAnimator';
import { disposeMeshResources } from '../utils/disposeMeshResources';
import { createCheeseBallGeometry } from '../weapons/CheeseProjectileModel';
import { CheeseImpactEffects } from '../weapons/CheeseImpactEffects';
import type { RatEntity } from '../entities/RatEntity';
import { incidentInfo } from '../shared/incidentCatalog';
import { DispatchHud } from './DispatchHud';
import { locateCase } from './caseLocator';
import { PressureMachine } from './PressureMachine';
import { CaseBeacon } from './CaseBeacon';
import { buildDispatchModel } from './DispatchModel';
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
    private readonly kiosks:Array<{switchHandle:THREE.Mesh;lamp:THREE.Mesh}>=[];
    private readonly pressureMachine:PressureMachine;
    private readonly textCanvas=document.createElement('canvas');
    private readonly textTexture:THREE.CanvasTexture;
    private readonly hud:DispatchHud;
    private readonly caseMarker=document.createElement('div');
    private readonly caseMarkerIcon=document.createElement('div');
    private readonly caseMarkerArrow=document.createElement('div');
    private readonly caseMarkerDetail=document.createElement('div');
    private readonly impacts:CheeseImpactEffects;
    private readonly ballGeometry=createCheeseBallGeometry();
    private readonly ballMaterial=new THREE.MeshStandardMaterial({color:0xffc34a,emissive:0xffc34a,emissiveIntensity:.7,roughness:.65});
    private readonly bullets=new THREE.InstancedMesh(this.ballGeometry,this.ballMaterial,CHAOS_TUNING.maxShots);
    private readonly chargedMaterial=new THREE.MeshStandardMaterial({color:0xff233b,emissive:0xff1028,emissiveIntensity:1.8,roughness:.5,toneMapped:false});
    private readonly chargedBullets=new THREE.InstancedMesh(this.ballGeometry,this.chargedMaterial,CHAOS_TUNING.maxShots);
    private readonly ballPose=new THREE.Object3D();
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
    constructor(private readonly scene:THREE.Scene,private resolveRat:(id:string)=>RatEntity|undefined,private audio?:AudioContext,private extrapolate=true){
        this.bullets.count=0;this.bullets.frustumCulled=false;this.root.add(this.bullets);
        this.chargedBullets.count=0;this.chargedBullets.frustumCulled=false;this.chargedBullets.name='crossfire-balls';this.root.add(this.chargedBullets);
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
        this.hud=new DispatchHud(frequency=>this.bell(frequency));
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
        this.state=state;this.receivedAt=performance.now();
        if(this.extrapolate)this.presentation.apply(state,this.receivedAt);
        const extraIds=new Set((state.extraCases??[]).map(c=>c.id));
        for(const [id,visual] of this.extraCases)if(!extraIds.has(id)){visual.dispose();this.extraCases.delete(id);}
        for(const extra of (state.extraCases??[]).slice(0,3)){
            let visual=this.extraCases.get(extra.id);
            if(!visual){visual=new ExtraCaseVisual(this.scene,extra.id,this.resolveRat,this.extrapolate);this.extraCases.set(extra.id,visual);}
            visual.apply(state,extra,this.receivedAt);
        }
        for(const hit of state.impacts){this.impacts.emit(this.impactPoint.set(hit.p.x,hit.p.y,hit.p.z),this.impactNormal.set(hit.n.x,hit.n.y,hit.n.z),hit.surface);reactToLandmarkImpact(this.root.parent as THREE.Scene,hit.p);}
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
        const s=this.state;if(!s)return;
        // The solo preview already stepped physics this frame. Extrapolating it
        // again counted CPU/render preparation time as extra ball travel.
        const renderTime=performance.now();
        const elapsed=this.extrapolate?Math.min((renderTime-this.receivedAt)/1000,.08):0,now=s.time+elapsed*1000;
        const owner=s.case.owner?this.resolveRat(s.case.owner):undefined;
        this.setCarrier(owner&&!owner.dead?owner:null);
        this.caseRoot.scale.setScalar(s.case.owner?1:CASE_LOOSE_SCALE);
        this.caseRoot.visible=!s.case.returningUntil || Math.floor(now/100)%2===0;
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
        this.bullets.count=0;this.chargedBullets.count=0;
        const crossfire=s.dispatch.phase==='active'&&incidentInfo(s.dispatch.incident).id==='crossfire';
        for(let i=0;i<Math.min(s.shots.length,CHAOS_TUNING.maxShots);i++){
            const shot=s.shots[i];
            const p=this.extrapolate&&this.presentation.shot(shot.id,renderTime,this.presented)?this.presented.p:shot.p;
            this.ballPose.position.set(p.x,p.y,p.z);
            this.ballPose.rotation.set(now*.015+i,now*.009,0);this.ballPose.updateMatrix();
            const batch=crossfire&&shot.wallBounced?this.chargedBullets:this.bullets;
            batch.setMatrixAt(batch.count++,this.ballPose.matrix);
        }
        this.bullets.instanceMatrix.needsUpdate=true;this.chargedBullets.instanceMatrix.needsUpdate=true;
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
        this.pressureMachine.update(s.pressure,now,camera);
        for(const kiosk of this.kiosks){
        kiosk.switchHandle.position.z=d.phase==='ready'?.58:.55;
        const material=kiosk.lamp.material as THREE.MeshStandardMaterial;
        material.emissive.setHex(d.phase==='ready'?0xffdc8c:d.phase==='active'?0xee793a:0x352d38);
        material.emissiveIntensity=d.phase==='rolling'?(Math.floor(now/120)%2)*1.5:d.phase==='ready'?1.2:.3;
        }
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
        this.caseMarker.style.transform=`translate(${location.x-87}px,${location.y-17}px)`;
        this.caseMarkerIcon.style.transform=`scale(${1+Math.sin(now*.003)*.045})`;
        this.caseMarkerArrow.style.display=location.edge?'block':'none';
        this.caseMarkerArrow.style.transform=`rotate(${location.angle}rad) translate(29px,-6px)`;
        const status=s.case.returningUntil?'RETURNING':s.case.owner?'CARRIED':'LOOSE';
        this.caseMarkerDetail.textContent=`${status} · ${Math.round(location.distance)} m${location.behind?' · BEHIND':''}`;
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
    getDiagnostics(){return {receivedShots:this.state?.shots.length??0,renderedBalls:this.bullets.count+this.chargedBullets.count,corpses:this.corpses.size,snapshotAgeMs:this.receivedAt?performance.now()-this.receivedAt:null,presentation:this.extrapolate?this.presentation.diagnostics():null};}
    dispose(){
        this.presentation.clear();
        for(const visual of this.extraCases.values())visual.dispose();this.extraCases.clear();
        this.pressureMachine.dispose();this.caseBeacon.dispose();this.setCarrier(null);this.hud.dispose();this.caseMarker.remove();this.root.removeFromParent();this.caseRoot.removeFromParent();this.dispatch.removeFromParent();
        disposeMeshResources(this.caseRoot);disposeMeshResources(this.dispatch);
        this.impacts.dispose();this.textTexture.dispose();
        disposeMeshResources(this.root);this.bullets.dispose();this.chargedBullets.dispose();this.ballGeometry.dispose();this.ballMaterial.dispose();this.chargedMaterial.dispose();
    }
}
