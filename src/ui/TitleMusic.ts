import { playerPreferences } from '../settings/PlayerPreferences';
import { previewMuted } from '../audio/previewMuted';

/** Streaming background music needs no 3D engine or decoded whole-song buffer. */
export class TitleMusic {
    private readonly audio = new Audio('/music/main-theme.mp3');
    private disposed = false;
    private readonly unsubscribe:()=>void;
    constructor() { this.audio.loop = true; this.audio.volume = .4; this.audio.muted = previewMuted(); this.audio.preload = 'none'; this.unsubscribe=playerPreferences().subscribe(p=>{this.master=p.masterVolume;this.apply();}); }
    private master=1;private lull=0;
    /** The lull (FeelDirector.lull, 0…1): the boogie drops back to half while the city breathes. */
    setLull(level:number):void {const next=Math.round(level*50)/50;if(next===this.lull)return;this.lull=next;this.apply();}
    private apply():void {this.audio.volume=.4*this.master*(1-.5*this.lull);}
    start(): void { void this.unlock(); }
    async unlock(): Promise<void> {
        if (this.disposed || !this.audio.paused) return;
        try { await this.audio.play(); } catch { /* First permitted gesture retries autoplay. */ }
    }
    dispose(): void {
        this.disposed = true; this.unsubscribe(); this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
    }
}
