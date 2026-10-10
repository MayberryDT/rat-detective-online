import * as THREE from 'three';
import './incidentStory.css';
import {reducedMotion,replay,scrawl} from '../ui/motion';
import {headlines} from '../ui/Headlines';
import {DispatchAudio} from '../audio/DispatchAudio';
import {worldSoundGain} from '../audio/worldSoundGain';
import {incidentInfo} from '../shared/incidentCatalog';
import {allUnitsPoint} from '../shared/allUnits';
import {caseLastSeen} from '../shared/caseHeartbeat';
import {pickupArtwork} from '../presentation/pickupArtwork';
import type {ChaosState} from '../shared/chaosState';
import type {Vec3Data} from '../shared/networkProtocol';

/** How long (ms) the WANTED poster, the BOUNTY CLAIMED stamp and the YOU'RE BACKUP card stay up, and how long an
 * arriving backup rat strobes (s). */
export const STORY={posterMs:3600,bountyMs:2800,backupMs:4500,strobe:2.2} as const;

/** Incident storytelling overlays, the same for every player: Most Wanted's WANTED poster slapped on the screen and the
 * BOUNTY CLAIMED stamp; All Units' radio squawk, and your YOU'RE BACKUP card with an arrow to the action. Each card is
 * a lesser headline (`headlines`): when something bigger is up it is told as the compact line. Read from consecutive
 * chaos snapshots, so a join mid-incident sets the baseline silently. DOM built lazily (tests pay nothing). */
export class IncidentStory {
    private root?:HTMLElement;
    private poster?:HTMLElement;private posterName?:HTMLElement;
    private bounty?:HTMLElement;private bountyLine?:HTMLElement;private bountyArt?:HTMLElement;
    private backupCard?:HTMLElement;private arrow?:HTMLElement;
    private readonly audio:DispatchAudio;
    private previous?:ChaosState;
    private myId='';
    private readonly hideAt={poster:0,bounty:0,backup:0};
    /** Where the YOU'RE BACKUP arrow points (the action), while the card is up. */
    private readonly target=new THREE.Vector3();
    private readonly local=new THREE.Vector3();
    private readonly inverse=new THREE.Quaternion();
    private lastAngle=NaN;
    constructor(private readonly doc:Document|undefined=globalThis.document,context?:AudioContext){this.audio=new DispatchAudio(context);}

    /** Each chaos snapshot: `name` resolves a rat's display name. */
    apply(state:ChaosState,myId:string,name:(id:string)=>string|undefined,now=performance.now()):void {
        const before=this.previous;this.previous=state;this.myId=myId;
        const d=state.dispatch,incident=d.phase==='active'?incidentInfo(d.incident).id:undefined;
        if(!before||before.epoch!==state.epoch)return;
        const was=before.dispatch;
        // All Units: the radio squawk as it starts (the incident's title tells it).
        if(incident==='all-units'&&(was.phase!=='active'||was.serial!==d.serial)&&state.time-d.started<2000)this.audio.play('squawk',.6);
        // The takedown: BOUNTY CLAIMED for everyone, with the supply it paid.
        const b=d.bounty;
        if(b&&b.at!==was.bounty?.at&&state.time-b.at<2000&&this.build()){
            const hunter=b.hunter===myId?'YOU':(name(b.hunter)??'SOMEBODY').toUpperCase(),target=b.target===myId?'YOU':(name(b.target)??'THE LEADER').toUpperCase();
            scrawl(this.bountyLine!,`${hunter} TOOK DOWN ${target}`);this.bountyArt!.innerHTML=pickupArtwork(b.pickup);
            this.bounty!.classList.toggle('story-self',b.hunter===myId);
            this.show('bounty',this.bounty!,now,STORY.bountyMs,`BOUNTY CLAIMED · ${hunter} TOOK DOWN ${target}`);
            this.audio.play('strike',.55);
        }
        // Most Wanted: a fresh WANTED poster whenever the light moves to a new rat.
        if(incident==='most-wanted'&&d.wanted&&d.wanted!==was.wanted){
            const who=d.wanted===myId?'YOU':(name(d.wanted)??'UNKNOWN').toUpperCase();
            if(this.build()){
                scrawl(this.posterName!,who);this.poster!.classList.toggle('story-self',d.wanted===myId);
                this.show('poster',this.poster!,now,STORY.posterMs,`WANTED: ${who}`);
            }
            this.audio.play('clank',.5);
        }
    }

    /** All Units: a rat just respawned as backup. Yours gets the YOU'RE BACKUP card; everyone hears the yelp from it. */
    arrived(at:Vec3Data,local:boolean,listener:Vec3Data,now=performance.now()):void {
        const distance=Math.hypot(at.x-listener.x,at.y-listener.y,at.z-listener.z);
        this.audio.play('yelp',local?.55:.55*worldSoundGain(distance,Math.max(0,1-distance/140)));
        if(!local||!this.previous||!this.build())return;
        // Only what this client may know: the active zone, a loose case, or the carrier's latest ping (never its live
        // position). Nothing known yet: the card without an arrow.
        const known=caseLastSeen(this.previous.case,this.myId),aimed=!!known||!!this.previous.assignment?.jurisdiction;
        if(aimed){const p=allUnitsPoint(this.previous.assignment,known??this.previous.case.p);this.target.set(p.x,p.y,p.z);this.lastAngle=NaN;}
        this.arrow!.hidden=!aimed;
        this.show('backup',this.backupCard!,now,STORY.backupMs,'YOU\u2019RE BACKUP · GET TO THE ACTION');
    }

    /** Each frame: hide what has run its time, and turn the backup arrow toward the action. */
    update(camera:THREE.Camera,self:THREE.Vector3|undefined,now=performance.now()):void {
        if(!this.root)return;
        for(const key of ['poster','bounty','backup'] as const){
            if(this.hideAt[key]&&now>=this.hideAt[key]){this.hideAt[key]=0;this.node(key)?.classList.remove('on');headlines.release(`story-${key}`);}
        }
        if(!this.hideAt.backup||!this.arrow)return;
        this.inverse.copy(camera.quaternion).invert();
        this.local.copy(this.target).sub(self??camera.position).applyQuaternion(this.inverse);
        const angle=Math.round(Math.atan2(this.local.x,-this.local.z)*100)/100;
        if(angle!==this.lastAngle){this.lastAngle=angle;this.arrow.style.transform=`rotate(${angle}rad)`;}
    }

    reset():void {
        this.previous=undefined;
        for(const key of ['poster','bounty','backup'] as const){this.hideAt[key]=0;this.node(key)?.classList.remove('on');}
    }
    dispose():void {this.reset();this.audio.dispose();this.root?.remove();this.root=undefined;}

    private node(key:keyof IncidentStory['hideAt']):HTMLElement|undefined {
        return key==='poster'?this.poster:key==='bounty'?this.bounty:this.backupCard;
    }
    /** Up for `ms` when nothing bigger holds the screen; otherwise `line` is told as the compact line. */
    private show(key:keyof IncidentStory['hideAt'],node:HTMLElement,now:number,ms:number,line:string):void {
        if(!headlines.claim(`story-${key}`,'news',line,ms,()=>{this.hideAt[key]=0;node.classList.remove('on');}))return;
        node.classList.toggle('still',reducedMotion());replay(node,'on');this.hideAt[key]=now+ms;
    }
    private build():boolean {
        if(this.root)return true;
        const doc=this.doc;
        if(!doc?.body||typeof doc.createElement!=='function')return false;
        const make=(parent:HTMLElement,className:string,text?:string)=>{const el=doc.createElement('div');el.className=className;if(text)el.textContent=text;parent.appendChild(el);return el;};
        this.root=doc.createElement('div');this.root.className='incident-story';this.root.setAttribute('aria-live','polite');
        this.poster=make(this.root,'story-poster');
        make(this.poster,'story-poster-head','WANTED');
        make(this.poster,'story-poster-mug');
        this.posterName=make(this.poster,'story-poster-name');
        make(this.poster,'story-poster-reward','REWARD: ONE SUPPLY\nDEAD OR ALIVE');
        this.bounty=make(this.root,'story-bounty');
        this.bountyArt=make(this.bounty,'story-bounty-art');
        make(this.bounty,'story-bounty-stamp','BOUNTY CLAIMED');
        this.bountyLine=make(this.bounty,'story-bounty-line');
        this.backupCard=make(this.root,'story-backup');
        make(this.backupCard,'story-backup-title',"YOU'RE BACKUP");
        this.arrow=make(this.backupCard,'story-backup-arrow');
        make(this.backupCard,'story-backup-line','GET TO THE ACTION');
        doc.body.appendChild(this.root);
        return true;
    }
}
