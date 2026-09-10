import type {ChaosState} from '../shared/chaosState';
import {CHAOS_TUNING} from '../shared/chaosState';
import {INCIDENTS,incidentInfo} from '../shared/incidentCatalog';
import './dispatchHud.css';
import {setText} from '../ui/setText';
import type {FeedbackCue} from '../audio/FeedbackAudio';
import {incidentArtwork} from './incidentArtwork';

/** Municipal broadcast graphics: brief interruptions, then a readable running ledger. */
export class DispatchHud {
    private root=document.createElement('div');
    private status:HTMLElement;
    private timer:HTMLElement;
    private alertLabel:HTMLElement;
    private artwork:HTMLElement;
    private brief:HTMLElement;
    private timeBar:HTMLElement;
    private nextPhase:HTMLElement;
    private caseLine:HTMLElement;
    private caseDetail:HTMLElement;
    private announcement:HTMLElement;
    private announcementTitle:HTMLElement;
    private announcementDetail:HTMLElement;
    private roulette:HTMLElement;
    private rouletteHeading:HTMLElement;
    private strip:HTMLElement;
    private stamp:HTMLElement;
    private description:HTMLElement;
    private previousOwner:string|null|undefined=undefined;
    private previousPhase='';
    private previousLocal=false;
    private rouletteVisible=false;
    private serial=-1;
    private announceUntil=0;
    private tick=-1;
    private lastSound=0;
    private finalIndex=0;
    constructor(private sound:(frequency:number)=>void,private feedback?:(cue:FeedbackCue)=>void){
        this.root.className='dispatch-hud';
        this.root.innerHTML=`<div class="dispatch-ledger"><div class="dispatch-alert-label"></div><div class="dispatch-status-row"><div class="dispatch-artwork" aria-hidden="true"></div><strong class="dispatch-status"></strong></div><p class="dispatch-brief"></p><div class="dispatch-clock"><small class="dispatch-next"></small><span class="dispatch-timer"></span></div><div class="dispatch-time-track"><div></div></div><div class="case-ledger"><strong></strong><small></small></div></div><div class="case-broadcast" hidden aria-live="polite"><small>HOT CASE</small><strong></strong><span></span></div><div class="dispatch-roulette" hidden><div class="roulette-heading"><span>! DISPATCH !</span><b>SELECTING INCIDENT</b></div><div class="roulette-window"><div class="roulette-strip"></div><i class="roulette-pointer">▶</i></div><div class="roulette-stamp">CITYWIDE EMERGENCY!</div><p class="roulette-description"></p><div class="roulette-footer">DEPARTMENT OF BAD IDEAS <span>● LIVE</span></div></div>`;
        const get=(q:string)=>this.root.querySelector<HTMLElement>(q)!;
        this.status=get('.dispatch-status');this.timer=get('.dispatch-timer');this.timeBar=get('.dispatch-time-track div');this.nextPhase=get('.dispatch-next');this.caseLine=get('.case-ledger strong');this.caseDetail=get('.case-ledger small');
        this.alertLabel=get('.dispatch-alert-label');this.artwork=get('.dispatch-artwork');this.brief=get('.dispatch-brief');
        this.announcement=get('.case-broadcast');this.announcementTitle=get('.case-broadcast strong');this.announcementDetail=get('.case-broadcast span');
        this.roulette=get('.dispatch-roulette');this.rouletteHeading=get('.roulette-heading b');this.strip=get('.roulette-strip');this.stamp=get('.roulette-stamp');this.description=get('.roulette-description');
        document.body.appendChild(this.root);
    }
    update(state:ChaosState,now:number,ownerName?:string,ownerIsLocal=false){
        const d=state.dispatch,info=incidentInfo(d.incident),remaining=Math.max(0,Math.ceil((d.until-now)/1000));
        if(this.root.dataset.phase!==d.phase)this.root.dataset.phase=d.phase;
        const artwork=d.phase==='active'?info.id:'dispatch';
        if(this.artwork.dataset.incident!==artwork){this.artwork.dataset.incident=artwork;this.artwork.innerHTML=incidentArtwork(artwork);}
        setText(this.alertLabel,d.phase==='active'?'CITYWIDE EMERGENCY':d.phase==='rolling'?'BRACE YOURSELF!':d.phase==='cooldown'?'PLEASE STAND BY':'DEPARTMENT OF BAD IDEAS');
        setText(this.brief,d.phase==='active'?info.description:d.phase==='rolling'?'Something extremely unwise is on its way.':d.phase==='cooldown'?'Cleaning up the paperwork.':'One little button. Citywide consequences.');
        setText(this.status,d.phase==='ready'?'DISPATCH READY':d.phase==='rolling'?'DISPATCH INCOMING':d.phase==='active'?info.title:'LINE BUSY');
        setText(this.timer,d.phase==='ready'?'READY':`${remaining}s`);
        const total=d.phase==='rolling'?CHAOS_TUNING.rollMs:d.phase==='active'?CHAOS_TUNING.activeMs:CHAOS_TUNING.cooldownMs;
        const fraction=d.phase==='ready'?1:Math.max(0,Math.min(1,(d.until-now)/total));
        this.timeBar.style.transform=`scaleX(${fraction})`;
        setText(this.nextPhase,d.phase==='ready'?'Shoot a Dispatch machine':d.phase==='rolling'?'Incident starts in':d.phase==='active'?'Incident ends in':'Dispatch ready in');
        const holder=ownerName||'A detective';
        let caseTitle=state.case.owner?`${ownerIsLocal?'YOU':holder} · ON THE CASE`:'LOOSE CASE';
        let caseDetail=state.case.owner?`${ownerIsLocal?'YOUR KILLS COUNT DOUBLE':'KILLS COUNT DOUBLE'} · ${Math.floor(state.possession[state.case.owner]||0)}s`:state.case.returningUntil?'Case returning':'';
        if(info.id==='evidence-tampering'&&d.phase==='active'){
            caseTitle=`${(state.extraCases?.length??0)+1} CASES ARE MISSILES`;
            caseDetail='PICKUP PROHIBITED · SHOOT THE EVIDENCE';
        }else if(state.extraCases?.length){
            if(!ownerIsLocal)caseTitle=`${state.extraCases.length+1} HOT CASES IN PLAY`;
            caseDetail=ownerIsLocal?`YOUR KILLS COUNT DOUBLE · ${state.extraCases.length+1} CASES IN PLAY`:'CARRY ANY CASE FOR DOUBLE KILLS';
        }
        setText(this.caseLine,caseTitle);setText(this.caseDetail,caseDetail);
        this.caseDetail.hidden=!this.caseDetail.textContent;
        if(this.previousOwner!==state.case.owner||this.previousLocal!==ownerIsLocal){
            const wasLocal=this.previousLocal,initialized=this.previousOwner!==undefined;
            if(initialized){
                if(wasLocal&&!ownerIsLocal)this.feedback?.('case-lost');
                else if(ownerIsLocal)this.feedback?.('case-pickup');
                else this.feedback?.(state.case.owner?'case-taken':'case-drop');
            }
            this.previousLocal=ownerIsLocal;
            this.previousOwner=state.case.owner;this.announceUntil=now+2800;
            setText(this.announcementTitle,wasLocal&&!ownerIsLocal?'YOU LOST THE CASE':state.case.owner?(ownerIsLocal?"YOU’RE ON THE CASE":`${holder} is on the case`):'LOOSE CASE');
            setText(this.announcementDetail,wasLocal&&!ownerIsLocal?'DOUBLE KILL CREDIT LOST · GET IT BACK':state.case.owner?(ownerIsLocal?'YOUR KILLS COUNT DOUBLE':'KILLS COUNT DOUBLE'):'CASE DROPPED');
            this.announcement.dataset.tone=wasLocal&&!ownerIsLocal?'lost':ownerIsLocal?'gained':'neutral';
            this.announcement.classList.remove('broadcast-enter');void this.announcement.offsetWidth;this.announcement.classList.add('broadcast-enter');
        }
        this.announcement.hidden=now>=this.announceUntil;
        if(d.serial!==this.serial){
            this.serial=d.serial;this.tick=-1;
            const winner=Math.max(0,INCIDENTS.findIndex(i=>i.id===info.id));
            this.finalIndex=INCIDENTS.length*8+winner;
            this.strip.replaceChildren();
            for(let i=0;i<=this.finalIndex+1;i++){
                const row=document.createElement('div');row.className='incident-card';
                const number=document.createElement('small');number.textContent=`ORDER ${String(i%INCIDENTS.length+1).padStart(2,'0')}`;
                const label=document.createElement('strong');label.textContent=INCIDENTS[i%INCIDENTS.length].title;
                row.appendChild(number);row.appendChild(label);this.strip.appendChild(row);
            }
        }
        const rolling=d.phase==='rolling',reveal=d.phase==='active'&&now-d.started<2980;
        const leaving=reveal&&now-d.started>=2800;
        const showRoulette=rolling||(reveal&&!leaving);
        if(showRoulette!==this.rouletteVisible){
            this.feedback?.(showRoulette?'menu-open':'menu-close');this.rouletteVisible=showRoulette;
        }
        this.roulette.hidden=!(rolling||reveal);
        this.roulette.classList.toggle('roulette-leaving',leaving);
        this.roulette.classList.toggle('is-settled',reveal);
        this.stamp.hidden=!reveal;setText(this.rouletteHeading,reveal?'INCIDENT ACTIVE':'SELECTING INCIDENT');
        setText(this.description,rolling?'SELECTING INCIDENT…':info.description);
        if(rolling){
            const progress=Math.max(0,Math.min(1,(now-d.started)/Math.max(1,d.until-d.started)));
            const position=this.finalIndex*(1-Math.pow(1-progress,3));
            this.strip.style.transform=`translateY(${-position*100}%)`;
            const tick=Math.floor(position);
            if(tick!==this.tick&&now-this.lastSound>65){this.sound(480+(tick%3)*110);this.lastSound=now;this.tick=tick;}
        }else if(reveal)this.strip.style.transform=`translateY(${-this.finalIndex*100}%)`;
        if(this.previousPhase!==d.phase){
            if(this.previousPhase&&d.phase==='active'){if(this.feedback)this.feedback('dispatch');else this.sound(180);}
            if(this.previousPhase&&d.phase==='ready'){if(this.feedback)this.feedback('ready');else this.sound(740);}
            this.previousPhase=d.phase;
        }
    }
    dispose(){this.root.remove();}
}
