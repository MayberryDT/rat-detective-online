/** A short mechanical whoop from the nearest ready kiosk. One reusable buffer,
 * at most one voice, no autoplay/resume, no missed-cue backlog or citywide chorus. */
export class DispatchSirenAudio {
    private buffer?:AudioBuffer;
    private voice?:{source:AudioBufferSourceNode;gain:GainNode};
    private nextAt=0;
    private disposed=false;
    constructor(private readonly context?:AudioContext){}
    update(ready:boolean,distance:number):void {
        const ctx=this.context;
        if(this.disposed||!ctx)return;
        if(!ready){this.nextAt=0;this.stop();return;}
        if(ctx.state!=='running'||!Number.isFinite(distance)||distance>=40){this.stop();return;}
        if(this.voice||ctx.currentTime<this.nextAt)return;
        if(!this.buffer){
            const duration=.72;this.buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
            const pcm=this.buffer.getChannelData(0);let phase=0;
            for(let i=0;i<pcm.length;i++){
                const t=i/ctx.sampleRate,u=t/duration;
                const frequency=520+200*Math.sin(Math.PI*u);
                phase+=2*Math.PI*frequency/ctx.sampleRate;
                const envelope=Math.min(1,t/.045)*Math.min(1,(duration-t)/.11);
                pcm[i]=(Math.sin(phase)+.18*Math.sin(phase*3))*.45*envelope*(.92+.08*Math.sin(t*2*Math.PI*24));
            }
        }
        const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.buffer;
        gain.gain.value=.12*Math.pow(1-Math.max(0,distance)/40,2);
        source.connect(gain);gain.connect(ctx.destination);
        const voice={source,gain};this.voice=voice;this.nextAt=ctx.currentTime+7;
        source.onended=()=>{source.disconnect();gain.disconnect();if(this.voice===voice)this.voice=undefined;};
        try{source.start();}catch{this.stop();}
    }
    private stop():void {
        const voice=this.voice;if(!voice)return;this.voice=undefined;
        voice.source.onended=null;
        try{voice.source.stop();}catch{/* A failed start has no running source. */}finally{voice.source.disconnect();voice.gain.disconnect();}
    }
    dispose():void {this.disposed=true;this.stop();this.buffer=undefined;}
}
