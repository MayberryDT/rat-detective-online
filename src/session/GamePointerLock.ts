/** One pending request, and a fresh canvas click for each re-entry after a loss.
 * Never re-lock from timers, focus events, or the trailing click of locked fire. */
export function bindGamePointerLock(options: {
    canvas: HTMLElement; playing: () => boolean; signal: AbortSignal;
    enabled?: () => boolean;
    allowUnlockedClick?: (target:EventTarget|null) => boolean;
    record?: (type: string, detail: unknown) => void;
    doc?: Document; target?: Window; now?: () => number;
}): { request(): void } {
    const doc=options.doc??document, target=options.target??window, now=options.now??(()=>performance.now());
    const listeners={signal:options.signal,capture:true};
    let pending=false, generation=0, freshDown=false, unlockedAt=-Infinity, escapeAt=-Infinity;
    const locked=()=>doc.pointerLockElement===options.canvas;
    const record=(type:string,detail:unknown={})=>options.record?.(type,detail);
    const cancel=()=>{pending=false;freshDown=false;generation++;};
    const swallow=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
    const request=()=>{
        if(options.enabled?.()===false||options.signal.aborted||locked()||pending||doc.hidden||!doc.hasFocus())return;
        pending=true;const current=++generation;
        record('pointer-lock-request');
        const failed=(error:unknown)=>{
            if(current!==generation||options.signal.aborted)return;
            cancel();record('pointer-lock-request-failed',{name:error instanceof Error?error.name:'unknown'});
        };
        try { options.canvas.requestPointerLock()?.catch(failed); } catch(error) { failed(error); }
    };
    doc.addEventListener('pointerlockchange',()=>{
        cancel();
        if(locked()){
            // Clear any title/control focus without changing the locked element.
            (doc.activeElement as HTMLElement|null)?.blur?.();
        }else unlockedAt=now();
        record('pointer-lock',{locked:locked(),hidden:doc.hidden,focused:doc.hasFocus(),
            recentEscape:now()-escapeAt<1000,canvasConnected:options.canvas.isConnected});
    },listeners);
    doc.addEventListener('pointerlockerror',()=>{cancel();record('pointer-lock-error');},listeners);
    target.addEventListener('blur',cancel,listeners);
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();},listeners);
    doc.addEventListener('keydown',event=>{
        if(event.code==='Escape'){escapeAt=now();freshDown=false;return;}
        if(locked()&&(event.code==='Tab'||event.code==='Space'))event.preventDefault();
    },listeners);
    doc.addEventListener('pointerdown',event=>{
        freshDown=false;
        if(options.enabled?.()===false||event.pointerType==='touch')return;
        if(locked()){if(event.button!==0)swallow(event);return;}
        if(options.playing() && event.button===0 && event.target===options.canvas &&
            !doc.hidden && doc.hasFocus() && now()-unlockedAt>=100)freshDown=true;
    },listeners);
    doc.addEventListener('mousedown',event=>{if(locked()&&event.button!==0)swallow(event);},listeners);
    doc.addEventListener('click',event=>{
        if(options.enabled?.()===false)return;
        const link=event.target as HTMLAnchorElement|null;
        // F8 diagnostics intentionally initiates a programmatic download.
        if(!event.isTrusted && link?.tagName==='A' && link.hasAttribute('download'))return;
        if(locked()){swallow(event);return;}
        if(options.allowUnlockedClick?.(event.target)){freshDown=false;return;}
        if(!options.playing())return;
        const resume=freshDown&&event.button===0&&event.target===options.canvas;
        freshDown=false;swallow(event);
        if(resume)request();else record('pointer-lock-ignored-click');
    },listeners);
    for(const type of ['auxclick','contextmenu'] as const)
        doc.addEventListener(type,event=>{if(locked())swallow(event);},listeners);
    return {request};
}
