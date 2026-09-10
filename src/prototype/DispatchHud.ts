import type {ScoreEntry} from '../shared/networkProtocol';
import type {ChaosState} from '../shared/chaosState';
import {CHAOS_TUNING} from '../shared/chaosState';
import {INCIDENTS,incidentInfo} from '../shared/incidentCatalog';
import './dispatchHud.css';
import {setText} from '../ui/setText';
import type {FeedbackCue} from '../audio/FeedbackAudio';
import {incidentArtwork} from './incidentArtwork';
import {activeDestination, ASSIGNMENTS, ASSIGNMENT_DESTINATIONS, ASSIGNMENT_TUNING} from '../shared/assignments';

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
    private previousStamps=0;
    private myId='';
    private scores:readonly ScoreEntry[]=[];
    private previousPoints=0;
    private previousCountdown=-1;
    private confirmationUntil=0;
    private confirmation:HTMLElement;
    private stats:HTMLElement;
    private leader:HTMLElement;
    private rankings:HTMLElement;
    private counter:HTMLElement;
    private stops:HTMLElement;
    private rankingSignature='';
    private stopSignature='';
    setScores(scores:readonly ScoreEntry[], myId:string):void {this.scores=scores;this.myId=myId;}
    constructor(private sound:(frequency:number)=>void,private feedback?:(cue:FeedbackCue)=>void){
        this.root.className='dispatch-hud';
        this.root.innerHTML=`<div class="dispatch-ledger"><div class="dispatch-alert-label"></div><div class="dispatch-status-row"><div class="dispatch-artwork" aria-hidden="true"></div><strong class="dispatch-status"></strong></div><p class="dispatch-brief"></p><div class="dispatch-clock"><small class="dispatch-next"></small><span class="dispatch-timer"></span></div><div class="dispatch-time-track"><div></div></div><div class="case-ledger"><strong></strong><small></small></div></div><div class="case-broadcast" hidden aria-live="polite"><small>HOT CASE</small><strong></strong><span></span></div><div class="dispatch-roulette" hidden><div class="roulette-heading"><span>! DISPATCH !</span><b>SELECTING INCIDENT</b></div><div class="roulette-window"><div class="roulette-strip"></div><i class="roulette-pointer">▶</i></div><div class="roulette-stamp">CITYWIDE EMERGENCY!</div><p class="roulette-description"></p><div class="roulette-footer">DEPARTMENT OF BAD IDEAS <span>● LIVE</span></div></div>`;
        this.root.innerHTML+=`<section class="assignment-ledger" hidden aria-label="Current assignment"><small class="assignment-counter"></small><strong class="assignment-title"></strong><p class="assignment-rule"></p><b class="assignment-progress"></b><span class="assignment-detail"></span><div class="assignment-track"><i></i></div><div class="assignment-stops"></div><ol class="assignment-rankings" aria-label="Top five case killers"></ol><span class="assignment-leader"></span><small class="assignment-stats"></small></section><div class="assignment-confirmation" hidden role="status" aria-live="polite"></div><div class="assignment-reveal" hidden><small>NEW CASE ASSIGNED</small><strong></strong><p></p><span></span></div>`;
        const get=(q:string)=>this.root.querySelector<HTMLElement>(q)!;
        this.rankings=get('.assignment-rankings');this.counter=get('.assignment-counter');this.stops=get('.assignment-stops');
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
        setText(this.brief,d.phase==='active'?info.description:d.phase==='rolling'?'Something extremely unwise is on its way.':d.phase==='cooldown'?'Cleaning up the paperwork.':'One little button. Citywide consequences.');
        setText(this.status,d.phase==='ready'?'DISPATCH READY':d.phase==='rolling'?'DISPATCH INCOMING':d.phase==='active'?info.title:'LINE BUSY');
        setText(this.timer,d.phase==='ready'?'READY':`${remaining}s`);
        const total=d.phase==='rolling'?CHAOS_TUNING.rollMs:d.phase==='active'?CHAOS_TUNING.activeMs:CHAOS_TUNING.cooldownMs;
        const fraction=d.phase==='ready'?1:Math.max(0,Math.min(1,(d.until-now)/total));
        this.timeBar.style.transform=`scaleX(${fraction})`;
        setText(this.nextPhase,d.phase==='ready'?'Shoot a Dispatch machine':d.phase==='rolling'?'Incident starts in':d.phase==='active'?'Incident ends in':'Dispatch ready in');
        const holder=ownerName||'A detective';
        let caseTitle=state.case.owner?`${ownerIsLocal?'YOU':holder} · ON THE CASE`:'LOOSE CASE';
        let caseDetail=state.case.owner?'KEEP THE CASE CLOSE':state.case.returningUntil?'Case returning':'';
        if(state.assignment)caseDetail=state.case.owner?(state.assignment.id==='excessive-force'?'HOLDER’S KILLS SCORE · FIRST TO 10':'SHARED PROGRESS · KEEP IT CLOSE'):state.case.returningUntil?'Case returning':'RECOVER THE EVIDENCE';
        if(info.id==='evidence-tampering'&&d.phase==='active'){
            caseTitle=`${(state.extraCases?.length??0)+1} CASES ARE MISSILES`;
            caseDetail='PICKUP PROHIBITED · SHOOT THE EVIDENCE';
        }else if(state.extraCases?.length){
            if(!ownerIsLocal)caseTitle=`${state.extraCases.length+1} HOT CASES IN PLAY`;
            caseDetail=`${state.extraCases.length+1} CASES IN PLAY`;
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
            setText(this.announcementDetail,wasLocal&&!ownerIsLocal?'GET IT BACK':state.case.owner?(ownerIsLocal?'KEEP IT CLOSE':'TAKE THE CASE'):'CASE DROPPED');
            if(state.assignment)setText(this.announcementDetail,wasLocal&&!ownerIsLocal?'YOUR CASE IS UP FOR GRABS · GET IT BACK':state.assignment.id==='excessive-force'?'YOUR CASE KILLS ARE KEPT':state.case.owner?'THE WORK STAYS WITH THE CASE':'SHARED PROGRESS PRESERVED');
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
        const a=state.assignment;
        this.assignmentPanel.hidden=!a;this.assignmentReveal.hidden=!a||now>=a.liveAt||a.phase==='closed'||showRoulette;
        if(a){
            const info=ASSIGNMENTS[a.id],destination=activeDestination(a);
            const newAssignment=a.roundId!==this.previousAssignment;
            if(newAssignment){
                this.previousAssignment=a.roundId;this.previousStamps=a.stamps;this.previousPoints=a.caseKills[this.myId]??0;this.previousCountdown=-1;this.confirmationUntil=0;
                if(now<a.liveAt)this.feedback?.('dispatch');
                this.assignmentReveal.classList.remove('assignment-arrival');void this.assignmentReveal.offsetWidth;this.assignmentReveal.classList.add('assignment-arrival');
            }else if(a.stamps>this.previousStamps){
                this.previousStamps=a.stamps;this.feedback?.('verified');
                setText(this.confirmation,`STAMPED! ${a.stamps}/${a.destinations.length} ✓${destination?` · NEXT: ${ASSIGNMENT_DESTINATIONS[destination].short}`:' · CASE CLOSED!'}`);
                this.confirmation.classList.remove('stamp-pop');void this.confirmation.offsetWidth;this.confirmation.classList.add('stamp-pop');
                this.confirmationUntil=now+3200;
            }
            const points=a.caseKills[this.myId]??0;
            if(!newAssignment&&points>this.previousPoints){
                this.confirmation.classList.remove('stamp-pop');void this.confirmation.offsetWidth;this.confirmation.classList.add('stamp-pop');
                this.feedback?.('case-point');setText(this.confirmation,`CASE KILL +${points-this.previousPoints} · ${points}/${ASSIGNMENT_TUNING.caseKillTarget}`);this.confirmationUntil=now+2400;
            }
            this.previousPoints=points;
            const score=this.scores.find(s=>s.id===this.myId);
            setText(this.stats,score?`TOTAL KILLS ${score.kills} · DEATHS ${score.deaths}`:'');
            this.rankings.hidden=a.id!=='excessive-force';
            this.stops.hidden=a.id!=='chain-of-custody';
            this.stats.hidden=a.id!=='excessive-force'||!score;
            const leaders=this.scores.map(s=>({...s,points:a.caseKills[s.id]??0})).sort((x,y)=>y.points-x.points||x.name.localeCompare(y.name)||x.id.localeCompare(y.id));
            const rank=leaders.findIndex(s=>s.id===this.myId)+1;
            setText(this.leader,a.id==='excessive-force'&&rank>5?`YOU’RE #${rank} · ${points}/10`:'');
            this.leader.hidden=!this.leader.textContent;
            const rankingSignature=JSON.stringify([a.id,this.myId,leaders.slice(0,5).map(s=>[s.id,s.name,s.points])]);
            if(rankingSignature!==this.rankingSignature){
                this.rankingSignature=rankingSignature;this.rankings.replaceChildren();
                for(const [index,s] of leaders.slice(0,5).entries()){
                    const row=document.createElement('li');row.dataset.local=String(s.id===this.myId);
                    for(const [tag,value] of [['i',String(index+1)],['span',s.name],['b',`${s.points}/10`]]){
                        const part=document.createElement(tag);part.textContent=value;row.appendChild(part);
                    }
                    this.rankings.appendChild(row);
                }
            }
            const stopSignature=JSON.stringify([a.destinations,a.stamps]);
            if(stopSignature!==this.stopSignature){
                this.stopSignature=stopSignature;this.stops.replaceChildren();
                a.destinations.forEach((id,index)=>{
                    const stamp=document.createElement('span');stamp.textContent=index<a.stamps?'✓':String(index+1);
                    stamp.dataset.state=index<a.stamps?'done':index===a.stamps?'current':'next';
                    stamp.title=ASSIGNMENT_DESTINATIONS[id].label;this.stops.appendChild(stamp);
                });
            }
            setText(this.counter,a.id==='chain-of-custody'?`STOP ${Math.min(a.stamps+1,a.destinations.length)} / ${a.destinations.length}`:a.id==='excessive-force'?'TOP FIVE · FIRST TO 10':'HOLD IT AT ZERO!');
            setText(this.assignmentTitle,info.title);setText(this.assignmentRule,info.rule);
            setText(this.assignmentRevealTitle,info.title);setText(this.assignmentRevealRule,info.rule);setText(this.assignmentFlavor,info.flavor);
            let progress='',detail='',fraction=0;
            if(a.id==='closing-time'){
                const seconds=Math.ceil(a.remainingMs/1000);
                progress=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
                detail=state.case.owner?`RUNNING · ${ownerIsLocal?'YOU':holder} HOLDING`:'PAUSED · CASE LOOSE';
                fraction=1-a.remainingMs/ASSIGNMENT_TUNING.processingMs;
            }else if(a.id==='chain-of-custody'){
                progress=destination?ASSIGNMENT_DESTINATIONS[destination].label:'CASE CLOSED!';
                detail=a.stamps===a.destinations.length-1?'TAKE CASE INSIDE → WIN!':'TAKE CASE INSIDE THE YELLOW BUILDING';fraction=a.stamps/a.destinations.length;
            }else{
                progress=`YOU: ${points} / ${ASSIGNMENT_TUNING.caseKillTarget}`;
                detail=ownerIsLocal?'KILLS COUNT':'GET THE CASE TO SCORE';fraction=points/ASSIGNMENT_TUNING.caseKillTarget;
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
