import { activeZone, JURISDICTION_TUNING } from '../shared/jurisdiction';
import {feelState} from '../feel/feelState';
import { JURISDICTION_ZONES } from '../shared/jurisdictionZones';
import type {ScoreEntry,Vec3Data} from '../shared/networkProtocol';
import type {ChaosState} from '../shared/chaosState';
import {CHAOS_TUNING} from '../shared/chaosState';
import {INCIDENTS,incidentInfo} from '../shared/incidentCatalog';
import './dispatchHud.css';
import {setText} from '../ui/setText';
import {arrange, fly, replay, scrawl, uiMotion} from '../ui/motion';
import {MunicipalQuips} from '../ui/municipalQuips';
import {headlines} from '../ui/Headlines';
import type {FeedbackCue} from '../audio/FeedbackAudio';
import {incidentArtwork} from './incidentArtwork';
import {activeDestination, ASSIGNMENTS, ASSIGNMENT_DESTINATIONS, ASSIGNMENT_TUNING} from '../shared/assignments';

/** How long (ms) an incident's title (its picture and one-line rule) stays up once it starts; then only the small tag. */
export const INCIDENT_TITLE_MS=2200;
/** Municipal broadcast graphics: brief interruptions, then a readable running ledger. Every big one goes through the
 * headline queue (`headlines`): the roll and the incident's title hold it as an incident, case news and filing credit
 * as news, your own take of the case above all. */
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
    private rouletteCaller:HTMLElement;
    private strip:HTMLElement;
    private stamp:HTMLElement;
    private description:HTMLElement;
    private rouletteArt:HTMLElement;
    private previousOwner:string|null|undefined=undefined;
    private previousPhase='';
    private previousLocal=false;
    private rouletteVisible=false;
    private serial=-1;
    private announceUntil=0;
    private tick=-1;
    private lastSound=0;
    private finalIndex=0;
    /** The Dispatch serial whose roll and title have asked for the screen, and whether they have it. */
    private titleSerial=-1;
    private titled=false;
    /** The round whose briefing has asked for the screen, and whether it has it. */
    private briefedRound='';
    private briefed=false;
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
    private previousDeliverySerial=0;
    private myId='';
    observing=false;
    private scores:readonly ScoreEntry[]=[];
    private previousPoints=0;
    private confirmationUntil=0;
    private confirmation:HTMLElement;
    private stats:HTMLElement;
    private leader:HTMLElement;
    private rankings:HTMLElement;
    private counter:HTMLElement;
    private destinationLabel:HTMLElement;
    private rankingSignature='';
    /** U4: one ranking row per rat, reused so rank changes slide instead of snapping. */
    private readonly rankRows=new Map<string,HTMLElement>();
    private zoneSecond=-1;
    /** Room roster; the retired evidence incident is absent from the strip. */
    private roster:readonly {id:string;title:string}[]=INCIDENTS;
    setRoster(incidents:readonly {id:string;title:string}[]|undefined):void {if(incidents?.length)this.roster=incidents;}
    setScores(scores:readonly ScoreEntry[], myId:string):void {this.scores=scores;this.myId=myId;}
    constructor(private sound:(frequency:number)=>void,private feedback?:(cue:FeedbackCue,origin?:Vec3Data)=>void){
        this.root.className='dispatch-hud';
        this.root.innerHTML=`<div class="dispatch-ledger"><div class="dispatch-alert-label"></div><div class="dispatch-status-row"><div class="dispatch-artwork" aria-hidden="true"></div><strong class="dispatch-status"></strong></div><p class="dispatch-brief"></p><div class="dispatch-clock"><small class="dispatch-next"></small><span class="dispatch-timer"></span></div><div class="dispatch-time-track"><div></div></div><div class="case-ledger"><strong></strong><small></small></div></div><div class="case-broadcast" hidden aria-live="polite"><small>HOT CASE</small><strong></strong><span></span></div><div class="dispatch-roulette" hidden><div class="roulette-heading"><span>! DISPATCH !</span><b>SELECTING INCIDENT</b></div><div class="roulette-caller" hidden></div><div class="roulette-window"><div class="roulette-strip"></div><i class="roulette-pointer">▶</i><div class="roulette-art" aria-hidden="true"></div></div><div class="roulette-stamp">CITYWIDE EMERGENCY!</div><p class="roulette-description"></p><div class="roulette-footer"><span>● LIVE</span></div></div>`;
        this.root.innerHTML+=`<section class="assignment-ledger" hidden aria-label="Current assignment"><small class="assignment-counter"></small><strong class="assignment-title"></strong><p class="assignment-rule"></p><b class="assignment-progress"></b><span class="assignment-detail"></span><div class="assignment-track"><i></i></div><strong class="assignment-target"></strong><ol class="assignment-rankings" aria-label="Top five investigators"></ol><span class="assignment-leader"></span><small class="assignment-stats"></small></section><div class="jurisdiction-timer" hidden role="timer" aria-label="Zone relocation countdown"><small class="jurisdiction-timer-label">ZONE MOVES IN</small><strong class="assignment-zone-clock"></strong></div><div class="assignment-confirmation" hidden role="status" aria-live="polite"></div><div class="assignment-reveal" hidden><small>NEW CASE ASSIGNED</small><strong></strong><p></p><span></span></div>`;
        const get=(q:string)=>this.root.querySelector<HTMLElement>(q)!;
        this.rankings=get('.assignment-rankings');this.counter=get('.assignment-counter');this.destinationLabel=get('.assignment-target');this.zoneTimer=get('.jurisdiction-timer');this.zoneTimerLabel=get('.jurisdiction-timer-label');this.zoneClock=get('.assignment-zone-clock');
        this.confirmation=get('.assignment-confirmation');this.stats=get('.assignment-stats');this.leader=get('.assignment-leader');
        this.assignmentPanel=get('.assignment-ledger');this.assignmentTitle=get('.assignment-title');this.assignmentRule=get('.assignment-rule');
        this.assignmentProgress=get('.assignment-progress');this.assignmentDetail=get('.assignment-detail');this.assignmentBar=get('.assignment-track i');
        this.assignmentReveal=get('.assignment-reveal');this.assignmentRevealTitle=get('.assignment-reveal strong');this.assignmentRevealRule=get('.assignment-reveal p');this.assignmentFlavor=get('.assignment-reveal span');
        this.status=get('.dispatch-status');this.timer=get('.dispatch-timer');this.timeBar=get('.dispatch-time-track div');this.nextPhase=get('.dispatch-next');this.caseLine=get('.case-ledger strong');this.caseDetail=get('.case-ledger small');
        this.alertLabel=get('.dispatch-alert-label');this.artwork=get('.dispatch-artwork');this.brief=get('.dispatch-brief');
        this.announcement=get('.case-broadcast');this.announcementTitle=get('.case-broadcast strong');this.announcementDetail=get('.case-broadcast span');
        this.roulette=get('.dispatch-roulette');this.rouletteHeading=get('.roulette-heading b');this.rouletteCaller=get('.roulette-caller');this.strip=get('.roulette-strip');this.stamp=get('.roulette-stamp');this.description=get('.roulette-description');this.rouletteArt=get('.roulette-art');
        document.body.appendChild(this.root);
    }
    /** `callerName`: the rat whose shot started this roll (`YOU` for yours), when known. */
    update(state:ChaosState,now:number,ownerName?:string,ownerIsLocal=false,callerName?:string){
        const d=state.dispatch,info=incidentInfo(d.incident),remaining=Math.max(0,Math.ceil((d.until-now)/1000));
        if(this.root.dataset.phase!==d.phase)this.root.dataset.phase=d.phase;
        const artwork=d.phase==='active'?info.id:'dispatch';
        if(this.artwork.dataset.incident!==artwork){this.artwork.dataset.incident=artwork;this.artwork.innerHTML=incidentArtwork(artwork);}
        setText(this.alertLabel,d.phase==='active'?'CITYWIDE EMERGENCY':d.phase==='rolling'?'BRACE YOURSELF!':d.phase==='cooldown'?'PLEASE STAND BY':'DISPATCH READY');
        setText(this.brief,d.phase==='active'?'':d.phase==='rolling'?'Something extremely unwise is on its way.':d.phase==='cooldown'?'Cleaning up the paperwork.':'One little bell. Citywide consequences.');
        scrawl(this.status,d.phase==='ready'?'DISPATCH READY':d.phase==='rolling'?'DISPATCH INCOMING':d.phase==='active'?info.title:'LINE BUSY');
        setText(this.timer,d.phase==='ready'?'READY':`${remaining}s`);
        const total=d.phase==='rolling'?CHAOS_TUNING.rollMs:d.phase==='active'?CHAOS_TUNING.activeMs:CHAOS_TUNING.cooldownMs;
        const fraction=d.phase==='ready'?1:Math.max(0,Math.min(1,(d.until-now)/total));
        this.timeBar.style.transform=`scaleX(${fraction})`;
        setText(this.nextPhase,d.phase==='ready'?'':d.phase==='rolling'?'Incident starts in':d.phase==='active'?'Incident ends in':'Dispatch ready in');
        this.nextPhase.hidden=d.phase==='ready';
        const holder=ownerName||'A detective';
        let caseTitle=state.case.owner?`${ownerIsLocal?'YOU':holder} · ON THE CASE`:'LOOSE CASE';
        let caseDetail=state.case.returningUntil?'CASE RETURNING':'';
        if(info.id==='evidence-tampering'&&d.phase==='active'){
            caseTitle=`${(state.extraCases?.length??0)+1} CASES ARE MISSILES`;
            caseDetail='PICKUP SUSPENDED';
        }else if(state.extraCases?.length){
            const missiles=state.extraCases.length;
            if(!ownerIsLocal)caseTitle=`${missiles+1} HOT CASES IN PLAY`;
            caseDetail=`${missiles+1} CASES IN PLAY`;
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
            this.previousOwner=state.case.owner;
            const lost=wasLocal&&!ownerIsLocal;
            const title=lost?'YOU LOST THE CASE':state.case.owner?(ownerIsLocal?'YOU’RE ON THE CASE':`${holder} is on the case`):'LOOSE CASE';
            const detail=this.quips.next(lost?'caseLost':ownerIsLocal?'casePickup':state.case.owner?'caseTaken':'caseLoose');
            scrawl(this.announcementTitle,title);setText(this.announcementDetail,detail);
            this.announcement.dataset.tone=lost?'lost':ownerIsLocal?'gained':'neutral';
            // Your take is the top headline, but the ON THE CASE stamp (K1) already says it: this one stays down unless that
            // is off. Everything else about the case is news. A join announces nothing; a delivery's filing credit says
            // CASE RELOCATED itself.
            if(initialized&&ownerIsLocal)headlines.explain('carrier');
            const told=initialized&&!deliveryRespawn&&!(ownerIsLocal&&feelState().on('caseClaim'))&&headlines.claim(ownerIsLocal?'case':'case-news',ownerIsLocal?'case':'news',
                `${title.toUpperCase()} · ${detail}`,2800,()=>{this.announceUntil=0;this.announcement.hidden=true;});
            this.announceUntil=told?now+2800:0;
            if(told)replay(this.announcement,'broadcast-enter');
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
        const rolling=d.phase==='rolling',reveal=d.phase==='active'&&now-d.started<INCIDENT_TITLE_MS+180;
        const leaving=reveal&&now-d.started>=INCIDENT_TITLE_MS;
        // The roll and the incident's title (its picture and one-line rule) hold the screen as an incident; when something
        // bigger is up, or takes the screen from them, the incident is told as the compact line instead.
        if((rolling||reveal&&!leaving)&&this.titleSerial!==d.serial){
            this.titleSerial=d.serial;
            const line=`INCIDENT · ${info.title.toUpperCase()} · ${info.description}`;
            this.titled=headlines.claim('incident','incident',line,rolling?d.until-now+INCIDENT_TITLE_MS:INCIDENT_TITLE_MS-(now-d.started),
                ()=>{this.titled=false;headlines.shrink(line);});
        }
        const titled=this.titled&&this.titleSerial===d.serial,showRoulette=titled&&(rolling||(reveal&&!leaving));
        const a=state.assignment;
        // A new round's briefing is news too.
        if(a&&a.roundId!==this.briefedRound){
            this.briefedRound=a.roundId;const brief=ASSIGNMENTS[a.id];
            this.briefed=now<a.liveAt&&a.phase!=='closed'&&headlines.claim('briefing','news',`${brief.title} · ${brief.rule}`,a.liveAt-now,()=>{this.briefed=false;});
        }
        this.zoneTimer.hidden=!a?.jurisdiction||a.phase==='closed';
        this.assignmentPanel.hidden=!a;this.assignmentReveal.hidden=!a||now>=a.liveAt||a.phase==='closed'||!this.briefed;
        if(a){
            const info=ASSIGNMENTS[a.id],destination=activeDestination(a);
            const newAssignment=a.roundId!==this.previousAssignment;
            const j=a.jurisdiction,chain=a.id==='chain-of-custody';
            const target=j?JURISDICTION_TUNING.targetMs/1000:chain?ASSIGNMENT_TUNING.deliveryTarget:ASSIGNMENT_TUNING.caseKillTarget;
            const table=j?Object.fromEntries(Object.entries(j.heldMs).map(([id,ms])=>[id,ms/1000])):chain?a.deliveries:a.caseKills,rawPoints=table[this.myId]??0,points=Math.floor(rawPoints);
            if(newAssignment){
                this.zoneSerial=j?.serial??-1;this.zoneWarning=j&&j.remainingMs<=JURISDICTION_TUNING.warningMs?j.serial:-1;
                this.previousAssignment=a.roundId;this.previousDeliverySerial=a.deliverySerial;this.previousPoints=points;this.confirmationUntil=0;
                if(now<a.liveAt)this.feedback?.('dispatch');
                this.assignmentReveal.classList.remove('assignment-arrival');void this.assignmentReveal.offsetWidth;this.assignmentReveal.classList.add('assignment-arrival');
                this.assignmentPanel.classList.toggle('ui-ease',uiMotion('scoreMotion'));
            }else if(chain&&a.deliverySerial>this.previousDeliverySerial){
                this.previousDeliverySerial=a.deliverySerial;this.feedback?.('verified');
                const delivery=a.lastDelivery,local=delivery?.playerId===this.myId;
                const credit=local?`PAPERWORK DELIVERED! +1 · ${points}/${target}`:`${delivery?.playerName??'A DETECTIVE'} DELIVERED · ${delivery?a.deliveries[delivery.playerId]??0:0}/${target}`;
                this.confirm(a.result?credit:`${credit} · CASE RELOCATED`,local,now,2800);
            }
            if(!newAssignment&&a.id==='excessive-force'&&points>this.previousPoints){
                this.feedback?.('case-point');this.confirm(`CASE KILL +${points-this.previousPoints} · ${points}/${target}`,true,now,2400);
            }
            const gained=newAssignment?0:points-this.previousPoints;
            this.previousPoints=points;
            const score=this.scores.find(s=>s.id===this.myId);
            setText(this.stats,score?`TOTAL KILLS ${score.kills} · DEATHS ${score.deaths}`:'');
            this.destinationLabel.hidden=!chain&&!j;
            setText(this.destinationLabel,j?`${JURISDICTION_ZONES[activeZone(j)].label} · ${JURISDICTION_ZONES[activeZone(j)].floor}`:destination?`DELIVER TO: ${ASSIGNMENT_DESTINATIONS[destination].label}`:'');
            // A zone's points drain only while the case is held in it; it moves once they run out.
            const draining=!!j&&a.phase==='active'&&!!j.scorerId,emptying=draining&&j!.remainingMs<=JURISDICTION_TUNING.warningMs;
            if(j){
                setText(this.zoneClock,`${Math.ceil(j.remainingMs/1000)}`);
                setText(this.zoneTimerLabel,a.phase==='suspended'?'ZONE PAUSED':draining?'ZONE PAYING OUT':'POINTS IN ZONE');
                const second=Math.ceil(j.remainingMs/1000);
                this.zoneTimer.dataset.urgent=String(emptying);this.zoneTimer.dataset.final=String(emptying&&j.remainingMs<=3000);
                // U4: the last points tick, louder for the final three, while the clock shakes (CSS).
                if(emptying&&!newAssignment&&second!==this.zoneSecond&&second<Math.ceil(JURISDICTION_TUNING.warningMs/1000)){
                    this.feedback?.(second<=3?'countdown-final':'tick');
                }
                this.zoneSecond=second;
                if(!newAssignment&&this.zoneSerial!==j.serial){this.feedback?.('dispatch');this.zoneSerial=j.serial;}
                if(!newAssignment&&emptying&&this.zoneWarning!==j.serial){this.feedback?.('countdown');this.zoneWarning=j.serial;}
            }
            this.stats.hidden=chain||!score;
            const leaders=this.scores.map(s=>({...s,points:table[s.id]??0})).sort((x,y)=>y.points-x.points||x.name.localeCompare(y.name)||x.id.localeCompare(y.id));
            const rank=leaders.findIndex(s=>s.id===this.myId)+1;
            setText(this.leader,rank>5?`YOU’RE #${rank} · ${points}/${target}`:'');
            this.leader.hidden=!this.leader.textContent;
            const rankingSignature=JSON.stringify([a.id,this.myId,leaders.slice(0,5).map(s=>[s.id,s.name,Math.floor(s.points)])]);
            if(rankingSignature!==this.rankingSignature){
                this.rankingSignature=rankingSignature;
                const top=leaders.slice(0,5);
                const rows=top.map((s,index)=>{
                    let row=this.rankRows.get(s.id);
                    if(!row){row=document.createElement('li');for(const tag of ['i','span','b'])row.appendChild(document.createElement(tag));this.rankRows.set(s.id,row);}
                    row.dataset.local=String(s.id===this.myId);
                    const [place,name,score]=Array.from(row.children) as HTMLElement[];
                    setText(place!,String(index+1));scrawl(name!,s.name);setText(score!,`${Math.floor(s.points)}/${target}`);
                    return row;
                });
                for(const id of this.rankRows.keys())if(!top.some(s=>s.id===id))this.rankRows.delete(id);
                arrange(this.rankings,rows,'scoreMotion');
            }
            setText(this.counter,(this.observing?'OBSERVING · ':'')+`TOP FIVE · FIRST TO ${target}`);
            scrawl(this.assignmentTitle,info.title);setText(this.assignmentRule,info.rule);
            scrawl(this.assignmentRevealTitle,info.title);setText(this.assignmentRevealRule,info.rule);setText(this.assignmentFlavor,info.flavor);
            let progress='',detail='',fraction=0;
            if(j){
                progress=`YOU: ${points} / ${target}`;fraction=rawPoints/target;
                detail=j.scorerId===this.myId?'SCORING':ownerIsLocal?'TAKE THE CASE TO THE ZONE':j.scorerId?'DISARM THE CARRIER':'GET THE CASE';
            }else if(chain){
                progress=`YOU: ${points} / ${target}`;
                detail=ownerIsLocal?'TAKE THE CASE INSIDE':'GET THE CASE TO DELIVER';fraction=points/target;
            }else{
                progress=`YOU: ${points} / ${ASSIGNMENT_TUNING.caseKillTarget}`;
                detail=ownerIsLocal?'KILLS COUNT':'GET THE CASE TO SCORE';fraction=points/ASSIGNMENT_TUNING.caseKillTarget;
            }
            if(this.observing){
                const leader=leaders[0];progress=leader?`LEAD: ${Math.floor(leader.points)} / ${target}`:`FIRST TO ${target}`;fraction=(leader?.points??0)/target;
                detail=j?.scorerId?`${this.scores.find(s=>s.id===j.scorerId)?.name??'CARRIER'} SCORING`:state.case.owner?`${holder} HOLDING`:'CASE LOOSE';
            }
            if(a.phase==='suspended')detail='TAMPERING! PROGRESS PAUSED';
            else if(a.phase==='briefing')detail='GET READY!';
            else if(a.result){progress='CASE CLOSED';detail=`${a.result.winnerName} · ASSIGNMENT COMPLETE`;fraction=1;}
            this.assignmentPanel.dataset.mode=a.id;this.root.dataset.mode=a.id;
            setText(this.assignmentProgress,progress);setText(this.assignmentDetail,detail);
            this.assignmentPanel.dataset.phase=a.phase;
            this.assignmentBar.style.transform=`scaleX(${fraction})`;
            // Polish 19 and U4: your row punches, the score rolls, and the points fly in from the scoring moment.
            if(gained>0){
                const row=this.rankRows.get(this.myId),view=document.defaultView;
                if(row&&feelState().on('rewards'))replay(row,'feel-pop',true);
                if(uiMotion('scoreMotion'))replay(this.assignmentProgress,'ui-roll',true);
                if(view&&!j)fly(document,`+${gained}`,{x:view.innerWidth/2,y:view.innerHeight/2-110},row??this.assignmentProgress,'scoreMotion');
            }
        }
        this.confirmation.hidden=now>=this.confirmationUntil||!a||a.phase==='suspended';
        if(showRoulette!==this.rouletteVisible){
            this.feedback?.(showRoulette?'menu-open':'menu-close');this.rouletteVisible=showRoulette;
        }
        this.roulette.hidden=!(rolling||reveal)||!titled;
        this.roulette.classList.toggle('roulette-leaving',leaving);
        this.roulette.classList.toggle('is-settled',reveal);
        this.stamp.hidden=!reveal;setText(this.rouletteHeading,reveal?'INCIDENT ACTIVE':'SELECTING INCIDENT');
        this.rouletteCaller.hidden=!callerName;if(callerName)setText(this.rouletteCaller,`DISPATCHED BY ${callerName.toUpperCase()}`);
        // The title: the incident's picture beside its name, and its one-line rule.
        if(reveal&&this.rouletteArt.dataset.incident!==info.id){this.rouletteArt.dataset.incident=info.id;this.rouletteArt.innerHTML=incidentArtwork(info.id);}
        setText(this.description,rolling?'SELECTING INCIDENT…':info.description);
        if(rolling&&titled){
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
    /** Filing credit (a delivery, a case kill): yours ranks with your case, anyone else's is news. */
    private confirm(text:string,yours:boolean,now:number,ms:number):void {
        setText(this.confirmation,text);
        if(!headlines.claim('credit',yours?'case':'news',text,ms,()=>{this.confirmationUntil=0;this.confirmation.hidden=true;})){this.confirmationUntil=0;return;}
        replay(this.confirmation,'stamp-pop');this.confirmationUntil=now+ms;
    }
    dispose(){this.root.remove();}
}
