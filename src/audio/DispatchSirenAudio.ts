import {worldSoundGain} from './worldSoundGain';

/** A short mechanical whoop from the nearest ready kiosk. One reusable buffer,
 * at most one voice, no autoplay/resume, no missed-cue backlog or citywide chorus. */
export class DispatchSirenAudio {
    private buffer?:AudioBuffer;
    private voice?:{source:AudioBufferSourceNode;gain:GainNode;volume:number};
    private nextAt=0;
    private disposed=false;
    constructor(private readonly context?:AudioContext){}
    update(ready:boolean,distance:number):void {
        const ctx=this.context;
        if(this.disposed||!ctx)return;
        if(!ready){this.nextAt=0;this.stop();return;}
        if(ctx.state!=='running'||!Number.isFinite(distance)||distance>=85){this.stop();return;}
        const volume=.38*worldSoundGain(distance,Math.max(0,1-Math.max(0,distance-12)/73));
        if(this.voice){
            if(Math.abs(this.voice.volume-volume)>.0001){
                this.voice.gain.gain.setTargetAtTime(volume,ctx.currentTime,.04);this.voice.volume=volume;
            }
            return;
        }
        if(ctx.currentTime<this.nextAt)return;
        if(!this.buffer){
            const duration=1.6;this.buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
            const pcm=this.buffer.getChannelData(0);let phase=0;
            for(let i=0;i<pcm.length;i++){
                const t=i/ctx.sampleRate;
                const frequency=540+460*(.5-.5*Math.cos(t*2*Math.PI*2.5));
                phase+=2*Math.PI*frequency/ctx.sampleRate;
                const envelope=Math.min(1,t/.045)*Math.min(1,(duration-t)/.11);
                pcm[i]=(Math.sin(phase)+.3*Math.sin(phase*3)+.12*Math.sin(phase*5))*.48*envelope;
            }
        }
        const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.buffer;
        gain.gain.value=volume;
        source.connect(gain);gain.connect(ctx.destination);
        const voice={source,gain,volume};this.voice=voice;this.nextAt=ctx.currentTime+4;
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
