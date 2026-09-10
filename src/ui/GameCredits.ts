/** Credits use native links only while the cursor is free. Keep the live
 * pointer-lock check as well as removing href/tab stops: lock events can race clicks. */
export function bindGameCredits(signal:AbortSignal,doc:Document=document) {
    const creator=doc.getElementById('creator-credit-link') as HTMLAnchorElement|null;
    const music=doc.getElementById('music-credit-link') as HTMLAnchorElement|null;
    const title=doc.getElementById('title-screen');
    const links=[creator,music].filter((link):link is HTMLAnchorElement=>!!link);
    const destinations=new Map(links.map(link=>[link,link.getAttribute('href')!]));
    const linkAt=(target:EventTarget|null)=>links.find(link=>target===link||!!target&&link.contains(target as Node));
    // Match the responsive visibility rule, including after a window resize.
    const smallScreen=doc.defaultView?.matchMedia('(max-width:900px), (max-height:500px)');
    const available=(link:HTMLAnchorElement)=>{
        if(doc.pointerLockElement)return false;
        const onTitle=!title?.classList.contains('fade-out')&&title?.style.display!=='none';
        return link===music?onTitle:onTitle||(!doc.body.classList.contains('touch-mode')&&!smallScreen?.matches);
    };
    let pressed:HTMLAnchorElement|undefined;
    const sync=()=>{
        pressed=undefined;
        for(const link of links){
            const locked=!!doc.pointerLockElement;
            link.tabIndex=locked?-1:0;
            if(locked){link.removeAttribute('href');link.setAttribute('aria-disabled','true');if(doc.activeElement===link)link.blur();}
            else{link.setAttribute('href',destinations.get(link)!);link.removeAttribute('aria-disabled');}
        }
    };
    const options={signal,capture:true};
    const swallow=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
    doc.addEventListener('pointerlockchange',sync,options);
    doc.addEventListener('pointerdown',event=>{
        const link=linkAt(event.target);pressed=link&&available(link)?link:undefined;
        if(link&&!available(link))swallow(event);
    },options);
    for(const type of ['click','auxclick','contextmenu','keydown','mousedown'] as const){
        doc.addEventListener(type,event=>{
            const link=linkAt(event.target);if(!link)return;
            const activation=type==='click'||type==='auxclick';
            // Require a fresh unlocked press for pointer activation, never the
            // trailing click of a shot that began while the cursor was captured.
            if(!available(link)||(activation&&(event as MouseEvent).detail>0&&pressed!==link))swallow(event);
            if(activation)pressed=undefined;
        },options);
    }
    sync();
    return {
        isLink:(target:EventTarget|null)=>!!linkAt(target),
        allowUnlockedClick:(target:EventTarget|null)=>{const link=linkAt(target);return !!link&&available(link);},
    };
}
