import type { PlayerData, ServerMessage } from '../shared/networkProtocol';
import type { HighlightMarker } from '../shared/highlights';
import type { ReplayClip } from './types';

/** Recording (docs/replay/playback.md, X2): the ring buffer covers this much server time. A kill marker arrives
 * about 2 s after its moment with up to 6 s of lead, so 12 s always holds its window. */
export const RECORDING={windowMs:12_000,localHz:30,keyframeMs:500,clips:8,shelfBytes:16_000_000} as const;

/** The decoded server messages a replay plays back. `ChaosDecoder` builds fresh arrays and objects for every state
 * (an unchanged part is the previous state's own, never mutated), so states are kept as they arrive, uncopied. */
export type RecordedEvent=Extract<ServerMessage,{type:'chaos'|'playerMoved'|'playerCorrected'|'playerShot'|'shotResult'|
    'playerDamaged'|'playerHealed'|'playerDied'|'playerRespawn'|'playerJoined'|'playerLeft'}>;
const RECORDED:Record<RecordedEvent['type'],true>={chaos:true,playerMoved:true,playerCorrected:true,playerShot:true,shotResult:true,
    playerDamaged:true,playerHealed:true,playerDied:true,playerRespawn:true,playerJoined:true,playerLeft:true};
/** Your own rat, which the server's movement frames leave out: its pose (body position, mesh rotation) and aim. */
export interface LocalPose {id:string;x:number;y:number;z:number;qx:number;qy:number;qz:number;qw:number;aim:{x:number;y:number;z:number}}
/** Every rat in the round at a moment: what it looks like, its health and whether it lies dead. */
export interface RosterRat {data:PlayerData;hp:number;dead:boolean}
/** One recorded moment in server ms: a message, your pose, or a roster keyframe (where a clip starts from). */
export type RecordedEntry={at:number;event:RecordedEvent}|{at:number;pose:LocalPose}|{at:number;roster:RosterRat[]};
/** A kept clip: its window's entries from the roster keyframe before `startAt`, in arrival order. */
export interface ClipData {clip:ReplayClip;entries:RecordedEntry[];bytes:number}

/** Rough heap size of an entry (bytes), for the shelf's budget and the dev listing. */
function entryBytes(entry:RecordedEntry):number {
    if('pose' in entry)return 140;
    if('roster' in entry)return 40+entry.roster.length*60;
    const event=entry.event;
    if(event.type!=='chaos')return event.type==='playerDied'?320:180;
    const s=event.state;
    return 600+s.shots.length*150+s.impacts.length*130+s.corpses.length*260+(s.pickups?.length??0)*80+(s.traps?.length??0)*90+(s.beams?.length??0)*200;
}

/** Each client's recording: the last `RECORDING.windowMs` of play, cut into clips as the server marks moments,
 * the round's best kept. One per session; never sends or draws anything. */
export class ReplayRecorder {
    private entries:RecordedEntry[]=[];
    private readonly roster=new Map<string,RosterRat>();
    /** Every rat named this round, kept after it leaves (actors' names). */
    private readonly names=new Map<string,string>();
    private readonly pending=new Map<string,HighlightMarker>();
    private shelf:ClipData[]=[];
    /** The clips the results board shows, frozen when it appears; they outlive the next round's reset. */
    private board?:ClipData[];
    private myId='';
    private lastKeyframe=-Infinity;
    private lastPose=-Infinity;
    constructor(private readonly serverNow:()=>number) {}

    /** A new session state: everything goes, the roster is the welcome's. */
    welcome(message:Extract<ServerMessage,{type:'welcome'}>):void {
        this.entries=[];this.shelf=[];this.board=undefined;this.pending.clear();this.roster.clear();this.names.clear();
        this.myId=message.id;this.lastKeyframe=this.lastPose=-Infinity;
        for(const player of [message.player,...Object.values(message.players)])this.join(player);
        // An observer's camera avatar is no rat.
        if(message.observing)this.roster.delete(message.id);
        this.keyframe(this.serverNow());
    }
    /** The next round: the buffer and this round's shelf go (the board keeps its own clips). */
    reset():void {
        this.entries=[];this.shelf=[];this.pending.clear();this.lastKeyframe=this.lastPose=-Infinity;
        this.names.clear();for(const [id,rat] of this.roster)this.names.set(id,rat.data.name);
    }

    record(message:ServerMessage):void {
        if(message.type==='highlight'){this.mark(message);return;}
        if(!(message.type in RECORDED))return;
        const event=message as RecordedEvent,now=this.serverNow();
        const at=event.type==='chaos'?event.state.time:(event.type==='playerMoved'||event.type==='playerCorrected')&&event.at!==undefined?event.at:now;
        this.entries.push({at,event});
        switch(event.type){
            case 'playerJoined':this.join(event.player);break;
            case 'playerLeft':this.roster.delete(event.id);break;
            case 'playerDamaged':case 'playerHealed':{const rat=this.roster.get(event.id);if(rat&&!rat.dead)rat.hp=event.hp;break;}
            case 'playerDied':{const rat=this.roster.get(event.victimId);if(rat){rat.dead=true;rat.hp=0;}break;}
            case 'playerRespawn':{const rat=this.roster.get(event.id);if(rat){rat.dead=false;rat.hp=event.hp;rat.data={...rat.data,x:event.x,y:event.y,z:event.z};}break;}
        }
        this.advance(now);
    }
    /** Your rat this frame (body position, mesh rotation, aim); kept at `RECORDING.localHz`, none while dead. */
    recordLocal(pose:Omit<LocalPose,'id'>):void {
        const at=this.serverNow();
        if(this.myId&&this.roster.has(this.myId)&&at-this.lastPose>=1000/RECORDING.localHz){this.lastPose=at;this.entries.push({at,pose:{id:this.myId,...pose}});}
        // Each frame also cuts the moments whose trail has just passed.
        this.advance(at);
    }

    /** The results board appears: moments still inside their trail are cut short now, and the shelf is frozen. */
    freeze():void {
        const now=this.serverNow();
        for(const marker of this.pending.values())if(marker.at<=now)this.cut(marker,Math.min(marker.at+marker.trailMs,now));
        this.pending.clear();
        this.board=this.shelf.slice();
    }
    /** The board has gone. */
    release():void {this.board=undefined;}
    /** The board's clips (the round's so far without one), best first. */
    clips():ReplayClip[] {return (this.board??this.shelf).map(data=>data.clip);}
    data(id:string):ClipData|undefined {return (this.board??this.shelf).find(data=>data.clip.id===id);}
    /** Kept clips with their estimated size, and the buffer's (the `?replay=dev` listing). */
    describe():{clips:{id:string;kind:string;score:number;bytes:number;entries:number}[];bufferBytes:number;bufferEntries:number} {
        let bufferBytes=0;for(const entry of this.entries)bufferBytes+=entryBytes(entry);
        return {clips:(this.board??this.shelf).map(({clip,bytes,entries})=>({id:clip.id,kind:clip.kind,score:clip.score,bytes,entries:entries.length})),
            bufferBytes,bufferEntries:this.entries.length};
    }

    private join(player:PlayerData):void {
        this.roster.set(player.id,{data:player,hp:player.hp,dead:player.hp<=0});this.names.set(player.id,player.name);
    }
    private keyframe(at:number):void {
        this.lastKeyframe=at;
        this.entries.push({at,roster:[...this.roster.values()].map(rat=>({...rat}))});
    }
    /** A marker: kept until its trail has passed. A grown one (the same id) replaces the earlier marker and its clip. */
    private mark(marker:HighlightMarker):void {
        this.pending.set(marker.id,marker);
        this.shelf=this.shelf.filter(data=>data.clip.id!==marker.id);
        this.advance(this.serverNow());
    }
    /** Keyframes, ripe markers and the buffer's trim, on each recorded moment. */
    private advance(now:number):void {
        if(now-this.lastKeyframe>=RECORDING.keyframeMs)this.keyframe(now);
        for(const [id,marker] of this.pending)if(now>=marker.at+marker.trailMs){this.pending.delete(id);this.cut(marker,marker.at+marker.trailMs);}
        // Keep from the last keyframe at or before the window's start, so the oldest moment still has its roster.
        const cutoff=now-RECORDING.windowMs;
        let keep=0;
        for(let i=0;i<this.entries.length;i++){const entry=this.entries[i]!;if(entry.at>cutoff)break;if('roster' in entry)keep=i;}
        if(keep>64)this.entries.splice(0,keep);
    }
    private cut(marker:HighlightMarker,endAt:number):void {
        const startAt=marker.at-marker.leadMs;
        let from=-1;
        for(let i=0;i<this.entries.length;i++){const entry=this.entries[i]!;if('roster' in entry&&entry.at<=startAt)from=i;}
        if(from<0)from=this.entries.findIndex(entry=>'roster' in entry);
        if(from<0)return;
        const entries:RecordedEntry[]=[];let bytes=0;
        for(let i=from;i<this.entries.length;i++){const entry=this.entries[i]!;if(entry.at<=endAt){entries.push(entry);bytes+=entryBytes(entry);}}
        const names:Record<string,string>={};
        for(const id of marker.actors){const name=this.names.get(id);if(name!==undefined)names[id]=name;}
        const clip:ReplayClip={id:marker.id,kind:marker.kind,score:marker.score,actors:[...marker.actors],names,
            involvesLocal:!!this.myId&&marker.actors.includes(this.myId),at:marker.at,startAt:Math.max(startAt,entries[0]!.at),endAt,p:{...marker.p}};
        this.shelf=this.shelf.filter(data=>data.clip.id!==clip.id);
        this.shelf.push({clip,entries,bytes});
        this.keepBest();
    }
    /** The `RECORDING.clips` best, plus the best that involves you; the lowest go first past the byte budget. Clips
     * that overlap share their entries, so each entry counts once. */
    private keepBest():void {
        const sorted=this.shelf.sort((a,b)=>b.clip.score-a.clip.score);
        const mine=sorted.find(data=>data.clip.involvesLocal);
        const kept=sorted.slice(0,RECORDING.clips);
        if(mine&&!kept.includes(mine))kept.push(mine);
        const total=()=>{const seen=new Set<RecordedEntry>();let sum=0;for(const data of kept)for(const entry of data.entries)if(!seen.has(entry)){seen.add(entry);sum+=entryBytes(entry);}return sum;};
        for(let i=kept.length-1;i>=0&&kept.length>1&&total()>RECORDING.shelfBytes;i--)if(kept[i]!==mine)kept.splice(i,1);
        this.shelf=kept;
    }
}
