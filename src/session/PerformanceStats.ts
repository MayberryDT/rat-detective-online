import type * as THREE from 'three';

export interface FramePhases { simulationMs:number; botsMs:number; presentationMs:number; renderMs:number }
/** Bounded local diagnostics. No per-frame console output or network telemetry. */
export class PerformanceStats {
    private readonly panel: HTMLPreElement | null;
    private readonly frames:number[]=[];
    private readonly reports:unknown[]=[];
    private readonly events:unknown[]=[];
    private lastPublish=0;
    private stalls=0;
    private longest=0;
    private phases:FramePhases={simulationMs:0,botsMs:0,presentationMs:0,renderMs:0};
    private readonly startedAt=new Date().toISOString();
    private readonly abort=new AbortController();
    private readonly api={snapshot:()=>this.snapshot(),download:()=>this.download()};
    constructor(private readonly renderer:THREE.WebGLRenderer, showPanel=true,private readonly publish?:(report:Record<string,unknown>)=>void) {
        this.panel=showPanel?document.createElement('pre'):null;
        if(this.panel){
            this.panel.id='performance-stats';this.panel.setAttribute('aria-label','Performance measurements');
            Object.assign(this.panel.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:'100',background:'#000d',color:'#fff',padding:'10px',fontSize:'11px',pointerEvents:'none'});
            document.body.appendChild(this.panel);
        }
        Object.assign(window,{ratDiagnostics:this.api});
        const options={signal:this.abort.signal};
        window.addEventListener('keydown',e=>{if(e.code==='F8'){e.preventDefault();this.download();}},options);
        window.addEventListener('error',e=>this.event('error',{message:e.message.slice(0,400)}),options);
        window.addEventListener('unhandledrejection',e=>this.event('unhandledrejection',{message:String(e.reason).slice(0,400)}),options);
        renderer.domElement?.addEventListener('webglcontextlost',()=>this.event('webglcontextlost'),options);
        window.addEventListener('pagehide',()=>this.persist(),options);
    }
    event(type:string,detail:unknown=null):void {
        this.events.push({at:Date.now(),type,detail});if(this.events.length>100)this.events.shift();
    }
    snapshot():unknown{return {version:1,startedAt:this.startedAt,capturedAt:new Date().toISOString(),reports:this.reports,events:this.events};}
    private persist():void{try{localStorage.setItem('rat-detective-last-diagnostics',JSON.stringify(this.snapshot()));}catch{/* Diagnostics must never interrupt play. */}}
    download():void {
        const url=URL.createObjectURL(new Blob([JSON.stringify(this.snapshot(),null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download=`rat-diagnostics-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    record(frameMs:number,now:number,world:{seed:number;version:number},phases?:FramePhases,details?:unknown):void {
        // Keep genuine long stalls; the old panel discarded every freeze >=1s.
        if(Number.isFinite(frameMs)&&frameMs>0){this.frames.push(frameMs);if(this.frames.length>600)this.frames.shift();this.longest=Math.max(this.longest,frameMs);if(frameMs>100)this.stalls++;}
        if(phases)for(const key of Object.keys(this.phases) as (keyof FramePhases)[])this.phases[key]=Math.max(this.phases[key],phases[key]);
        if(now-this.lastPublish<5000)return;this.lastPublish=now;
        const sorted=[...this.frames].sort((a,b)=>a-b),{render,memory}=this.renderer.info;
        const report={at:Date.now(),world,hidden:document.hidden,samples:sorted.length,frameMedianMs:sorted[Math.floor(sorted.length*.5)]??0,frameP95Ms:sorted[Math.floor(sorted.length*.95)]??0,longestFrameMs:this.longest,stallsOver100Ms:this.stalls,phaseMaxMs:{...this.phases},calls:render.calls,triangles:render.triangles,geometries:memory.geometries,textures:memory.textures,details};
        this.reports.push(report);if(this.reports.length>120)this.reports.shift();
        this.persist();console.info('[rat-diagnostics]',report);
        this.publish?.(report);
        if(this.panel)this.panel.textContent=`F8: save diagnostic report\n${JSON.stringify(report,null,2)}`;
        this.longest=0;this.stalls=0;for(const key of Object.keys(this.phases) as (keyof FramePhases)[])this.phases[key]=0;
    }
    dispose():void{this.persist();this.abort.abort();this.panel?.remove();if((window as any).ratDiagnostics===this.api)delete (window as any).ratDiagnostics;}
}
