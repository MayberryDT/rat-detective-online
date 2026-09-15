import { activeZone, nextZone, JURISDICTION_TUNING } from '../shared/jurisdiction';
import { JURISDICTION_ZONES } from '../shared/jurisdictionZones';
import type {ScoreEntry,Vec3Data} from '../shared/networkProtocol';
import type {ChaosState} from '../shared/chaosState';
import {CHAOS_TUNING} from '../shared/chaosState';
import {INCIDENTS,incidentInfo} from '../shared/incidentCatalog';
import './dispatchHud.css';
import {setText} from '../ui/setText';
import {MunicipalQuips,INCIDENT_QUIPS} from '../ui/municipalQuips';
import type {FeedbackCue} from '../audio/FeedbackAudio';
import {incidentArtwork} from './incidentArtwork';
import {activeDestination, ASSIGNMENTS, ASSIGNMENT_DESTINATIONS, ASSIGNMENT_TUNING} from '../shared/assignments';

/** Municipal broadcast graphics: brief interruptions, then a readable running ledger. */
export class DispatchHud {
    private root=document.createElement('div');
    private readonly quips=new MunicipalQuips();
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
    private assignmentPanel:HTMLElement;
    private assignmentTitle:HTMLElement;
    private assignmentRule:HTMLElement;
    private assignmentProgress:HTMLElement;
    private assignmentDetail:HTMLElement;
    private assignmentBar:HTMLElement;
    private assignmentReveal:HTMLElement;
    private assignmentRevealTitle:HTMLElement;
    private assignmentRevealRule:HTMLElement;
    private assignmentFlavor:HTMLElement;
    private previousAssignment='';
    private zoneSerial=-1;
    private zoneWarning=-1;
    private zoneTimer:HTMLElement;
    private zoneTimerLabel:HTMLElement;
    private zoneClock:HTMLElement;
    private zoneNext:HTMLElement;
    private previousDeliverySerial=0;
    private myId='';
    observing=false;
    private scores:readonly ScoreEntry[]=[];
    private previousPoints=0;
    private previousCountdown=-1;
    private confirmationUntil=0;
    private confirmation:HTMLElement;
    private stats:HTMLElement;
    private leader:HTMLElement;
    private rankings:HTMLElement;
    private counter:HTMLElement;
    private destinationLabel:HTMLElement;
    private rankingSignature='';
    /** Room roster; the retired evidence incident is absent from the strip. */
    private roster:readonly {id:string;title:string}[]=INCIDENTS;
    setRoster(incidents:readonly {id:string;title:string}[]|undefined):void {if(incidents?.length)this.roster=incidents;}
    setScores(scores:readonly ScoreEntry[], myId:string):void {this.scores=scores;this.myId=myId;}
    constructor(private sound:(frequency:number)=>void,private feedback?:(cue:FeedbackCue,origin?:Vec3Data)=>void){
        this.root.className='dispatch-hud';
        this.root.innerHTML=`<div class="dispatch-ledger"><div class="dispatch-alert-label"></div><div class="dispatch-status-row"><div class="dispatch-artwork" aria-hidden="true"></div><strong class="dispatch-status"></strong></div><p class="dispatch-brief"></p><div class="dispatch-clock"><small class="dispatch-next"></small><span class="dispatch-timer"></span></div><div class="dispatch-time-track"><div></div></div><div class="case-ledger"><strong></strong><small></small></div></div><div class="case-broadcast" hidden aria-live="polite"><small>HOT CASE</small><strong></strong><span></span></div><div class="dispatch-roulette" hidden><div class="roulette-heading"><span>! DISPATCH !</span><b>SELECTING INCIDENT</b></div><div class="roulette-window"><div class="roulette-strip"></div><i class="roulette-pointer">▶</i></div><div class="roulette-stamp">CITYWIDE EMERGENCY!</div><p class="roulette-description"></p><div class="roulette-footer">DEPARTMENT OF BAD IDEAS <span>● LIVE</span></div></div>`;
        this.root.innerHTML+=`<section class="assignment-ledger" hidden aria-label="Current assignment"><small class="assignment-counter"></small><strong class="assignment-title"></strong><p class="assignment-rule"></p><b class="assignment-progress"></b><span class="assignment-detail"></span><div class="assignment-track"><i></i></div><strong class="assignment-target"></strong><span class="assignment-zone-next" hidden></span><ol class="assignment-rankings" aria-label="Top five investigators"></ol><span class="assignment-leader"></span><small class="assignment-stats"></small></section><div class="jurisdiction-timer" hidden role="timer" aria-label="Zone relocation countdown"><small class="jurisdiction-timer-label">ZONE MOVES IN</small><strong class="assignment-zone-clock"></strong></div><div class="assignment-confirmation" hidden role="status" aria-live="polite"></div><div class="assignment-reveal" hidden><small>NEW CASE ASSIGNED</small><strong></strong><p></p><span></span></div>`;
        const get=(q:string)=>this.root.querySelector<HTMLElement>(q)!;
        this.rankings=get('.assignment-rankings');this.counter=get('.assignment-counter');this.destinationLabel=get('.assignment-target');this.zoneTimer=get('.jurisdiction-timer');this.zoneTimerLabel=get('.jurisdiction-timer-label');this.zoneClock=get('.assignment-zone-clock');this.zoneNext=get('.assignment-zone-next');
        this.confirmation=get('.assignment-confirmation');this.stats=get('.assignment-stats');this.leader=get('.assignment-leader');
        this.assignmentPanel=get('.assignment-ledger');this.assignmentTitle=get('.assignment-title');this.assignmentRule=get('.assignment-rule');
        this.assignmentProgress=get('.assignment-progress');this.assignmentDetail=get('.assignment-detail');this.assignmentBar=get('.assignment-track i');
        this.assignmentReveal=get('.assignment-reveal');this.assignmentRevealTitle=get('.assignment-reveal strong');this.assignmentRevealRule=get('.assignment-reveal p');this.assignmentFlavor=get('.assignment-reveal span');
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
        setText(this.brief,d.phase==='active'?INCIDENT_QUIPS[info.id]:d.phase==='rolling'?'Something extremely unwise is on its way.':d.phase==='cooldown'?'Cleaning up the paperwork.':'One little button. Citywide consequences.');
        setText(this.status,d.phase==='ready'?'DISPATCH READY':d.phase==='rolling'?'DISPATCH INCOMING':d.phase==='active'?info.title:'LINE BUSY');
        setText(this.timer,d.phase==='ready'?'READY':`${remaining}s`);
        const total=d.phase==='rolling'?CHAOS_TUNING.rollMs:d.phase==='active'?CHAOS_TUNING.activeMs:CHAOS_TUNING.cooldownMs;
        const fraction=d.phase==='ready'?1:Math.max(0,Math.min(1,(d.until-now)/total));
        this.timeBar.style.transform=`scaleX(${fraction})`;
        setText(this.nextPhase,d.phase==='ready'?'':d.phase==='rolling'?'Incident starts in':d.phase==='active'?'Incident ends in':'Dispatch ready in');
        this.nextPhase.hidden=d.phase==='ready';
        const holder=ownerName||'A detective';
        let caseTitle=state.case.owner?`${ownerIsLocal?'YOU':holder} · ON THE CASE`:'LOOSE CASE';
        let caseDetail=state.case.returningUntil?'CASE RETURNING':'';
        const counterfeits=(state.extraCases??[]).filter(c=>c.fake).length;
        if(info.id==='planted-evidence'&&d.phase==='active'){
            // The real case keeps its normal identity; only the fakes change the ledger.
            caseTitle='FAKE CASES · SHOOT, DO NOT COLLECT';
            caseDetail=counterfeits?`${counterfeits} COUNTERFEITS PLANTED`:'';
        }else if(info.id==='evidence-tampering'&&d.phase==='active'){
            caseTitle=`${(state.extraCases?.length??0)+1} CASES ARE MISSILES`;
            caseDetail='PICKUP SUSPENDED';
        }else if(state.extraCases?.length){
            const missiles=state.extraCases.filter(c=>!c.fake).length;
            if(missiles&&!ownerIsLocal)caseTitle=`${missiles+1} HOT CASES IN PLAY`;
            caseDetail=missiles?`${missiles+1} CASES IN PLAY`:'';
        }
        setText(this.caseLine,caseTitle);setText(this.caseDetail,caseDetail);
        this.caseDetail.hidden=!this.caseDetail.textContent;
        const deliveryRespawn=state.assignment?.id==='chain-of-custody'&&state.assignment.roundId===this.previousAssignment&&state.assignment.deliverySerial>this.previousDeliverySerial&&!state.assignment.result;
        if(this.previousOwner!==state.case.owner||this.previousLocal!==ownerIsLocal||deliveryRespawn){
            const wasLocal=this.previousLocal,initialized=this.previousOwner!==undefined;
            if(initialized&&!deliveryRespawn){
                if(wasLocal&&!ownerIsLocal)this.feedback?.('case-lost');
                else if(ownerIsLocal)this.feedback?.('case-pickup');
                else this.feedback?.(state.case.owner?'case-taken':'case-drop',state.case.p);
            }
            this.previousLocal=ownerIsLocal;
            this.previousOwner=state.case.owner;this.announceUntil=now+2800;
            setText(this.announcementTitle,wasLocal&&!ownerIsLocal?'YOU LOST THE CASE':state.case.owner?(ownerIsLocal?"YOU’RE ON THE CASE":`${holder} is on the case`):'LOOSE CASE');
            const kind=wasLocal&&!ownerIsLocal?'caseLost':ownerIsLocal?'casePickup':state.case.owner?'caseTaken':'caseLoose';
            setText(this.announcementDetail,this.quips.next(kind));
            this.announcement.dataset.tone=wasLocal&&!ownerIsLocal?'lost':ownerIsLocal?'gained':'neutral';
            if(deliveryRespawn){setText(this.announcementTitle,'CASE RELOCATED');setText(this.announcementDetail,'FORWARDED TO THE WRONG DEPARTMENT.');this.announcement.dataset.tone='neutral';}
            this.announcement.classList.remove('broadcast-enter');void this.announcement.offsetWidth;this.announcement.classList.add('broadcast-enter');
        }
        this.announcement.hidden=now>=this.announceUntil;
        if(d.serial!==this.serial){
            this.serial=d.serial;this.tick=-1;
            const roster=this.roster;
            const winner=Math.max(0,roster.findIndex(i=>i.id===info.id));
            this.finalIndex=roster.length*8+winner;
            this.strip.replaceChildren();
            for(let i=0;i<=this.finalIndex+1;i++){
                const row=document.createElement('div');row.className='incident-card';
                const number=document.createElement('small');number.textContent=`ORDER ${String(i%roster.length+1).padStart(2,'0')}`;
                const label=document.createElement('strong');label.textContent=roster[i%roster.length].title;
                row.appendChild(number);row.appendChild(label);this.strip.appendChild(row);
            }
        }
        const rolling=d.phase==='rolling',reveal=d.phase==='active'&&now-d.started<2980;
        const leaving=reveal&&now-d.started>=2800;
        const showRoulette=rolling||(reveal&&!leaving);
        const a=state.assignment;
        this.zoneTimer.hidden=!a?.jurisdiction||a.phase==='closed';
        this.assignmentPanel.hidden=!a;this.assignmentReveal.hidden=!a||now>=a.liveAt||a.phase==='closed'||showRoulette;
        if(a){
            const info=ASSIGNMENTS[a.id],destination=activeDestination(a);
            const newAssignment=a.roundId!==this.previousAssignment;
            const j=a.jurisdiction,chain=a.id==='chain-of-custody',race=a.id==='excessive-force'||chain||!!j;
            const target=j?JURISDICTION_TUNING.targetMs/1000:chain?ASSIGNMENT_TUNING.deliveryTarget:ASSIGNMENT_TUNING.caseKillTarget;
            const table=j?Object.fromEntries(Object.entries(j.heldMs).map(([id,ms])=>[id,ms/1000])):chain?a.deliveries:a.caseKills,rawPoints=table[this.myId]??0,points=Math.floor(rawPoints);
            if(newAssignment){
                this.zoneSerial=j?.serial??-1;this.zoneWarning=j&&j.remainingMs<=JURISDICTION_TUNING.warningMs?j.serial:-1;
                this.previousAssignment=a.roundId;this.previousDeliverySerial=a.deliverySerial;this.previousPoints=points;this.previousCountdown=-1;this.confirmationUntil=0;
                if(now<a.liveAt)this.feedback?.('dispatch');
                this.assignmentReveal.classList.remove('assignment-arrival');void this.assignmentReveal.offsetWidth;this.assignmentReveal.classList.add('assignment-arrival');
            }else if(chain&&a.deliverySerial>this.previousDeliverySerial){
                this.previousDeliverySerial=a.deliverySerial;this.feedback?.('verified');
                const delivery=a.lastDelivery,local=delivery?.playerId===this.myId;
                setText(this.confirmation,local?`PAPERWORK DELIVERED! +1 · ${points}/3`:`${delivery?.playerName??'A DETECTIVE'} DELIVERED · ${delivery?a.deliveries[delivery.playerId]??0:0}/3`);
                if(!a.result)setText(this.confirmation,`${this.confirmation.textContent} · CASE RELOCATED`);
                this.confirmation.classList.remove('stamp-pop');void this.confirmation.offsetWidth;this.confirmation.classList.add('stamp-pop');
                this.confirmationUntil=now+2800;
            }
            if(!newAssignment&&a.id==='excessive-force'&&points>this.previousPoints){
                this.confirmation.classList.remove('stamp-pop');void this.confirmation.offsetWidth;this.confirmation.classList.add('stamp-pop');
                this.feedback?.('case-point');setText(this.confirmation,`CASE KILL +${points-this.previousPoints} · ${points}/${target}`);this.confirmationUntil=now+2400;
            }
            this.previousPoints=points;
            const score=this.scores.find(s=>s.id===this.myId);
            setText(this.stats,score?`TOTAL KILLS ${score.kills} · DEATHS ${score.deaths}`:'');
            this.rankings.hidden=!race;this.destinationLabel.hidden=!chain&&!j;
            setText(this.destinationLabel,j?`${JURISDICTION_ZONES[activeZone(j)].label} · ${JURISDICTION_ZONES[activeZone(j)].floor}`:destination?`DELIVER TO: ${ASSIGNMENT_DESTINATIONS[destination].label}`:'');
            this.zoneNext.hidden=!j||j.remainingMs>JURISDICTION_TUNING.warningMs;
            if(j){
                setText(this.zoneClock,`${Math.ceil(j.remainingMs/1000)}s`);
                setText(this.zoneTimerLabel,a.phase==='active'?'ZONE MOVES IN':a.phase==='suspended'?'ZONE TIMER PAUSED':'ZONE DURATION');
                this.zoneTimer.dataset.urgent=String(a.phase==='active'&&j.remainingMs<=JURISDICTION_TUNING.warningMs);
                setText(this.zoneNext,`NEXT: ${JURISDICTION_ZONES[nextZone(j)].label} · ${JURISDICTION_ZONES[nextZone(j)].floor}`);
                if(!newAssignment&&this.zoneSerial!==j.serial){this.feedback?.('dispatch');this.zoneSerial=j.serial;}
                if(!newAssignment&&a.phase==='active'&&j.remainingMs<=JURISDICTION_TUNING.warningMs&&this.zoneWarning!==j.serial){this.feedback?.('countdown');this.zoneWarning=j.serial;}
            }
            this.stats.hidden=chain||!race||!score;
            const leaders=this.scores.map(s=>({...s,points:table[s.id]??0})).sort((x,y)=>y.points-x.points||x.name.localeCompare(y.name)||x.id.localeCompare(y.id));
            const rank=leaders.findIndex(s=>s.id===this.myId)+1;
            setText(this.leader,race&&rank>5?`YOU’RE #${rank} · ${points}/${target}`:'');
            this.leader.hidden=!this.leader.textContent;
            const rankingSignature=JSON.stringify([a.id,this.myId,leaders.slice(0,5).map(s=>[s.id,s.name,Math.floor(s.points)])]);
            if(rankingSignature!==this.rankingSignature){
                this.rankingSignature=rankingSignature;this.rankings.replaceChildren();
                for(const [index,s] of leaders.slice(0,5).entries()){
                    const row=document.createElement('li');row.dataset.local=String(s.id===this.myId);
                    for(const [tag,value] of [['i',String(index+1)],['span',s.name],['b',`${Math.floor(s.points)}/${target}`]]){
                        const part=document.createElement(tag);part.textContent=value;row.appendChild(part);
                    }
                    this.rankings.appendChild(row);
                }
            }
            setText(this.counter,(this.observing?'OBSERVING · ':'')+(race?`TOP FIVE · FIRST TO ${target}`:'HOLD IT AT ZERO!'));
            setText(this.assignmentTitle,info.title);setText(this.assignmentRule,info.rule);
            setText(this.assignmentRevealTitle,info.title);setText(this.assignmentRevealRule,info.rule);setText(this.assignmentFlavor,info.flavor);
            let progress='',detail='',fraction=0;
            if(j){
                progress=`YOU: ${points} / ${target}`;fraction=rawPoints/target;
                detail=j.scorerId===this.myId?'SCORING':ownerIsLocal?'TAKE THE CASE TO THE ZONE':j.scorerId?'DISARM THE CARRIER':'GET THE CASE';
            }else if(a.id==='closing-time'){
                const seconds=Math.ceil(a.remainingMs/1000);
                progress=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
                detail=state.case.owner?`RUNNING · ${ownerIsLocal?'YOU':holder} HOLDING`:'PAUSED · CASE LOOSE';
                fraction=1-a.remainingMs/ASSIGNMENT_TUNING.processingMs;
            }else if(a.id==='chain-of-custody'){
                progress=`YOU: ${points} / ${target}`;
                detail=ownerIsLocal?'TAKE THE CASE INSIDE':'GET THE CASE TO DELIVER';fraction=points/target;
            }else{
                progress=`YOU: ${points} / ${ASSIGNMENT_TUNING.caseKillTarget}`;
                detail=ownerIsLocal?'KILLS COUNT':'GET THE CASE TO SCORE';fraction=points/ASSIGNMENT_TUNING.caseKillTarget;
            }
            if(this.observing){
                if(race){const leader=leaders[0];progress=leader?`LEAD: ${Math.floor(leader.points)} / ${target}`:`FIRST TO ${target}`;fraction=(leader?.points??0)/target;}
                detail=j?.scorerId?`${this.scores.find(s=>s.id===j.scorerId)?.name??'CARRIER'} SCORING`:state.case.owner?`${holder} HOLDING`:'CASE LOOSE';
            }
            if(a.phase==='suspended')detail='TAMPERING! PROGRESS PAUSED';
            else if(a.phase==='briefing')detail='GET READY!';
            else if(a.result){progress='CASE CLOSED';detail=`${a.result.winnerName} · ASSIGNMENT COMPLETE`;fraction=1;}
            const running=a.id==='closing-time'&&a.phase==='active'&&!!state.case.owner;
            const countdown=Math.ceil(a.remainingMs/(a.remainingMs<=5000?500:1000));
            if(running&&a.remainingMs<=20_000&&this.previousCountdown>=0&&countdown!==this.previousCountdown)this.feedback?.(a.remainingMs<=5000?'countdown-final':'countdown');
            this.previousCountdown=running?countdown:-1;
            this.assignmentPanel.dataset.mode=a.id;this.root.dataset.mode=a.id;
            this.assignmentPanel.dataset.running=String(running);
            setText(this.assignmentProgress,progress);setText(this.assignmentDetail,detail);
            this.assignmentPanel.dataset.phase=a.phase;
            this.assignmentPanel.dataset.urgent=String(a.id==='closing-time'&&a.remainingMs<=20_000&&running);
            this.assignmentBar.style.transform=`scaleX(${fraction})`;
        }
        this.confirmation.hidden=now>=this.confirmationUntil||!a||a.phase==='suspended';
        if(!this.confirmation.hidden)this.announcement.hidden=true;
        if(showRoulette!==this.rouletteVisible){
            this.feedback?.(showRoulette?'menu-open':'menu-close');this.rouletteVisible=showRoulette;
        }
        this.roulette.hidden=!(rolling||reveal);
        this.roulette.classList.toggle('roulette-leaving',leaving);
        this.roulette.classList.toggle('is-settled',reveal);
        this.stamp.hidden=!reveal;setText(this.rouletteHeading,reveal?'INCIDENT ACTIVE':'SELECTING INCIDENT');
        setText(this.description,rolling?'SELECTING INCIDENT…':INCIDENT_QUIPS[info.id]);
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
