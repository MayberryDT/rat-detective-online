import type * as THREE from 'three';
import type {ClientMessage,ServerMessage} from '../shared/networkProtocol';
import {READING_CAP_MS} from '../shared/networkProtocol';
import type {RatEntity} from '../entities/RatEntity';
import type {GameHud} from '../ui/GameHud';
import type {MatchScoreboard} from '../ui/MatchScoreboard';
import type {ReplayRecorder} from '../replay/ReplayRecorder';
import type {ReplayStage} from '../replay/ReplayStage';
import type {FeelDirector} from '../feel/FeelDirector';
import type {PoliceLineup,LineupEntry} from '../feel/PoliceLineup';
import {Exhibits} from '../ui/Exhibits';
import {frontPage} from '../ui/eveningEdition';
import {ASSIGNMENTS} from '../shared/assignments';
import {feelState} from '../feel/feelState';
const ROUND_END={card:1,results:5};
/** Owns the round-end reading lifecycle, delayed presentation and replay freeze/release. */
export class ResultsCoordinator {
    private exhibits?:Exhibits;
    private pendingLineup?:{entries:LineupEntry[];at:number};
    /** Round end, last beat: when the Case File and final standings take over. */
    private pendingResults?:number;
    private resultsShown=false;
    /** Results (protocol 28): this human still owes the round a CONTINUE (set by `gameWon`; observers never do), has
     * continued before the next round started, or is held out of the round already under way until they continue. */
    private awaitingContinue=false;
    private continued=false;
    private held=false;
    private heldUntil=0;
    /** When the next round starts (local clock), and when the results board appeared. */
    private nextRoundAt=0;
    private resultsShownAt=0;
    private pendingVictory?:{message:Extract<ServerMessage,{type:'gameWon'}>;at:number};
    /** The round just won, for the Evening Edition on the results board. */
    private lastWin?:Extract<ServerMessage,{type:'gameWon'}>;
    constructor(private readonly hud:GameHud,private readonly scoreboard:MatchScoreboard,
        private readonly recorder:ReplayRecorder,private readonly replay:ReplayStage,
        private readonly feel:FeelDirector,private readonly lineup:PoliceLineup|undefined,
        private readonly identity:()=>string,private readonly observing:()=>boolean,
        private readonly offset:()=>number,private readonly resolveRat:(id:string)=>RatEntity|undefined,
        private readonly send:(message:ClientMessage)=>void,private readonly pointerLock:()=>void){}
    private get myId():string{return this.identity();}
    get shown():boolean{return this.resultsShown;}
    get shownAt():number{return this.resultsShownAt;}
    get holding():boolean{return this.held;}
    get lineupPending():boolean{return !!this.pendingLineup;}
    win(message:Extract<ServerMessage,{type:'gameWon'}>):void {
        this.lastWin=message;
        this.awaitingContinue=!this.observing();this.continued=false;this.held=false;this.nextRoundAt=message.resetAt-this.offset();
        // Polish 19: let the winning moment play in slow motion before the card slams in.
        const hold=this.feel.victory();
        if(hold>0)this.pendingVictory={message,at:performance.now()+hold*1000};
        else this.hud.showVictory(message.winnerName,message.kills,{assignment:message.assignment,awards:message.awards,report:message.report,localId:this.myId,winnerId:message.winnerId});
        // Round end: the CASE CLOSED card holds the screen, then the police lineup,
        // then the Case File and final standings for the rest of the 30 seconds.
        const won=performance.now(),entries=feelState().on('lineup')?this.lineupEntries(message):[];
        if(entries.length)this.pendingLineup={entries,at:won+(hold+ROUND_END.card)*1000};
        this.pendingResults=won+ROUND_END.results*1000;
    }
    reset():boolean {
        const keep=this.awaitingContinue&&!this.continued,pending=this.pendingVictory;
        this.pendingVictory=undefined;this.pendingLineup=undefined;this.lineup?.end();
        if(keep){
            if(pending)this.hud.showVictory(pending.message.winnerName,pending.message.kills,{assignment:pending.message.assignment,awards:pending.message.awards,report:pending.message.report,localId:this.myId,winnerId:pending.message.winnerId});
            this.held=true;this.heldUntil=Date.now()+READING_CAP_MS;
            if(this.resultsShown)this.hud.setContinue({kind:'held',until:this.heldUntil});else this.showResultsBoard();
        }else this.endResults();
        return keep;
    }
    presentVictory(now:number,roundWon:boolean):void {
        if(this.pendingVictory&&now>=this.pendingVictory.at){
            const won=this.pendingVictory.message;this.pendingVictory=undefined;
            if(roundWon)this.hud.showVictory(won.winnerName,won.kills,{assignment:won.assignment,awards:won.awards,report:won.report,localId:this.myId,winnerId:won.winnerId});
        }
    }
    presentResults(now:number,roundWon:boolean,camera:THREE.Camera):void {
        if(this.pendingResults!==undefined&&now>=this.pendingResults&&roundWon)this.showResultsBoard();
        if(this.pendingLineup&&now>=this.pendingLineup.at){this.lineup?.start(this.pendingLineup.entries);this.feel.endDeathCamera(camera);this.pendingLineup=undefined;}
    }
    cancel():void {this.pendingVictory=undefined;this.pendingLineup=undefined;this.lineup?.end();this.endResults(false);}
    disconnect():void {this.pendingLineup=undefined;this.lineup?.end();this.endResults();}
    dispose():void {this.exhibits?.dispose();}
    private showResultsBoard():void {
        this.pendingResults=undefined;this.resultsShown=true;this.resultsShownAt=performance.now();
        if(this.awaitingContinue&&!this.continued)this.hud.setContinue(this.held?{kind:'held',until:this.heldUntil}:{kind:'reading'});
        this.hud.showResults(true);this.scoreboard.setVisible(true);
        this.recorder.freeze();
        const host=document.getElementById('victory-overlay');
        if(host)this.exhibits??=new Exhibits({player:this.replay,myId:()=>this.myId,send:message=>this.send(message),host});
        this.exhibits?.show();
        // The Evening Edition: Exhibit A (the round's best moment, the same on every client) makes the headline.
        const win=this.lastWin;
        if(win){
            const lead=this.recorder.shared().map(id=>this.recorder.data(id)?.clip).find(clip=>!!clip);
            this.hud.frontPage(frontPage({lead,report:win.report,winnerName:win.winnerName,roundId:win.assignment?.roundId,assignment:win.assignment?ASSIGNMENTS[win.assignment.id].title:undefined}));
        }
        if(this.reading&&document.pointerLockElement)document.exitPointerLock();
    }
    /** A reader on the results board, still to CONTINUE. */
    get reading():boolean { return this.resultsShown&&this.awaitingContinue&&!this.continued; }
    /** CONTINUE (button or key): tell the room, and take the mouse back for play. Before the next round starts the board
     * waits for it with everyone; once it is under way without you, the board goes and the room brings your rat in. */
    continueFromResults():void {
        if(!this.reading)return;
        this.send({type:'ready'});
        if(this.held){this.endResults();this.hud.hideVictory();}
        else{this.continued=true;this.hud.setContinue({kind:'ready',until:this.nextRoundAt});this.exhibits?.hide();}
        this.pointerLock();
    }
    /** Leave the round-end results board (reset, reconnect, leaving play, CONTINUE); `closeBoard` returns the standings to the live round. */
    endResults(closeBoard=true):void {
        const shown=this.resultsShown;this.pendingResults=undefined;this.resultsShown=false;
        this.awaitingContinue=false;this.continued=false;this.held=false;
        if(closeBoard)this.scoreboard.closeResults();
        if(shown){this.hud.showResults(false);this.scoreboard.setVisible(false);this.exhibits?.hide();this.recorder.release();}
    }

    /** Juice T5: the lineup's rats, winner first, rebuilt from the rats this client knows. */
    private lineupEntries(message:Extract<ServerMessage,{type:'gameWon'}>):LineupEntry[] {
        const entries:LineupEntry[]=[];
        for(const id of message.lineup??[]){
            const entity=this.resolveRat(id);
            if(!entity)continue;
            entries.push({id,name:entity.name,appearance:entity.appearance,award:message.awards?.find(award=>award.playerId===id),winner:id===message.winnerId});
        }
        return entries;
    }

}
