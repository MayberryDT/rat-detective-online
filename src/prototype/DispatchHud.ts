import type {ChaosState} from '../shared/chaosState';
import {CHAOS_TUNING} from '../shared/chaosState';
import {INCIDENTS,incidentInfo} from '../shared/incidentCatalog';
import './dispatchHud.css';

/** Municipal broadcast graphics: brief interruptions, then a readable running ledger. */
export class DispatchHud {
    private root=document.createElement('div');
    private status:HTMLElement;
    private timer:HTMLElement;
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
    private serial=-1;
    private announceUntil=0;
    private tick=-1;
    private lastSound=0;
    private finalIndex=0;
    constructor(private sound:(frequency:number)=>void){
        this.root.className='dispatch-hud';
        this.root.innerHTML=`<div class="dispatch-ledger"><div class="dispatch-status-row"><strong class="dispatch-status"></strong><span class="dispatch-timer"></span></div><div class="dispatch-time-track"><div></div></div><small class="dispatch-next"></small><div class="case-ledger"><strong></strong><small></small></div></div><div class="case-broadcast" hidden aria-live="polite"><small>HOT CASE</small><strong></strong><span></span></div><div class="dispatch-roulette" hidden><div class="roulette-heading"><span>DISPATCH</span><b>SELECTING INCIDENT</b></div><div class="roulette-window"><div class="roulette-strip"></div><i class="roulette-pointer">▶</i></div><div class="roulette-stamp">INCIDENT AUTHORIZED</div><p class="roulette-description"></p><div class="roulette-footer">CITYWIDE INCIDENT <span>● LIVE</span></div></div>`;
        const get=(q:string)=>this.root.querySelector<HTMLElement>(q)!;
        this.status=get('.dispatch-status');this.timer=get('.dispatch-timer');this.timeBar=get('.dispatch-time-track div');this.nextPhase=get('.dispatch-next');this.caseLine=get('.case-ledger strong');this.caseDetail=get('.case-ledger small');
        this.announcement=get('.case-broadcast');this.announcementTitle=get('.case-broadcast strong');this.announcementDetail=get('.case-broadcast span');
        this.roulette=get('.dispatch-roulette');this.rouletteHeading=get('.roulette-heading b');this.strip=get('.roulette-strip');this.stamp=get('.roulette-stamp');this.description=get('.roulette-description');
        document.body.appendChild(this.root);
    }
    update(state:ChaosState,now:number,ownerName?:string,ownerIsLocal=false){
        const d=state.dispatch,info=incidentInfo(d.incident),remaining=Math.max(0,Math.ceil((d.until-now)/1000));
        this.root.dataset.phase=d.phase;
        this.status.textContent=d.phase==='ready'?'DISPATCH READY':d.phase==='rolling'?'DISPATCH INCOMING':d.phase==='active'?info.title:'LINE BUSY';
        this.timer.textContent=d.phase==='ready'?'READY':`${remaining}s`;
        const total=d.phase==='rolling'?CHAOS_TUNING.rollMs:d.phase==='active'?CHAOS_TUNING.activeMs:CHAOS_TUNING.cooldownMs;
        const fraction=d.phase==='ready'?1:Math.max(0,Math.min(1,(d.until-now)/total));
        this.timeBar.style.transform=`scaleX(${fraction})`;
        this.nextPhase.textContent=d.phase==='ready'?'Shoot a Dispatch machine':d.phase==='rolling'?'Incident starts in':d.phase==='active'?'Incident ends in':'Dispatch ready in';
        const holder=ownerName||'A detective';
        this.caseLine.textContent=state.case.owner?`${ownerIsLocal?'YOU':holder} · ON THE CASE`:'LOOSE CASE';
        this.caseDetail.textContent=state.case.owner?`${ownerIsLocal?'YOUR KILLS COUNT DOUBLE':'KILLS COUNT DOUBLE'} · ${Math.floor(state.possession[state.case.owner]||0)}s`:state.case.returningUntil?'Case returning':'';
        if(state.extraCases?.length){
            if(!ownerIsLocal)this.caseLine.textContent=`${state.extraCases.length+1} HOT CASES IN PLAY`;
            this.caseDetail.textContent=ownerIsLocal?`YOUR KILLS COUNT DOUBLE · ${state.extraCases.length+1} CASES IN PLAY`:'CARRY ANY CASE FOR DOUBLE KILLS';
        }
        this.caseDetail.hidden=!this.caseDetail.textContent;
        if(this.previousOwner!==state.case.owner){
            this.previousOwner=state.case.owner;this.announceUntil=now+2800;
            this.announcementTitle.textContent=state.case.owner?(ownerIsLocal?"YOU’RE ON THE CASE":`${holder} is on the case`):'LOOSE CASE';
            this.announcementDetail.textContent=state.case.owner?(ownerIsLocal?'YOUR KILLS COUNT DOUBLE':'KILLS COUNT DOUBLE'):'CASE DROPPED';
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
        const rolling=d.phase==='rolling',reveal=d.phase==='active'&&now-d.started<2800;
        this.roulette.hidden=!(rolling||reveal);
        this.roulette.classList.toggle('is-settled',reveal);
        this.stamp.hidden=!reveal;this.rouletteHeading.textContent=reveal?'INCIDENT ACTIVE':'SELECTING INCIDENT';
        this.description.textContent=rolling?'SELECTING INCIDENT…':info.description;
        if(rolling){
            const progress=Math.max(0,Math.min(1,(now-d.started)/Math.max(1,d.until-d.started)));
            const position=this.finalIndex*(1-Math.pow(1-progress,3));
            this.strip.style.transform=`translateY(${-position*100}%)`;
            const tick=Math.floor(position);
            if(tick!==this.tick&&now-this.lastSound>65){this.sound(480+(tick%3)*110);this.lastSound=now;this.tick=tick;}
        }else if(reveal)this.strip.style.transform=`translateY(${-this.finalIndex*100}%)`;
        if(this.previousPhase!==d.phase){
            if(this.previousPhase&&d.phase==='active')this.sound(180);
            if(this.previousPhase&&d.phase==='ready')this.sound(740);
            this.previousPhase=d.phase;
        }
    }
    dispose(){this.root.remove();}
}
