import './motion.css';
import {playerPreferences} from '../settings/PlayerPreferences';
import {feelState} from '../feel/feelState';
import type {FeelItem} from '../feel/feelTuning';

/** U1 motion kit: every interface animation goes through these, so Reduced interface
 * motion, the OS preference and each item's `?feel=dev` switch are honoured in one place.
 * Headless documents (no `animate`, no layout) simply get the end state. */
let reduceQuery:MediaQueryList|null|undefined;
export function reducedMotion():boolean {
    if(reduceQuery===undefined)reduceQuery=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
    return playerPreferences().current.reducedMotion||!!reduceQuery?.matches;
}
export function uiMotion(item:FeelItem):boolean {return feelState().on(item)&&!reducedMotion();}

/** Restart a CSS animation class. With `once` the class drops off when its animation ends, so moving or
 * re-inserting the element later does not replay it. */
export function replay(el:HTMLElement,className:string,once=false):void {
    el.classList.remove(className);void el.offsetWidth;el.classList.add(className);
    if(!once||typeof el.addEventListener!=='function')return;
    const end=(event:AnimationEvent)=>{if(event.target!==el||event.pseudoElement)return;el.classList.remove(className);el.removeEventListener('animationend',end);};
    el.addEventListener('animationend',end);
}

const scrawled=new WeakMap<HTMLElement,string>();
/** Carbon scrawl: write `text` as crooked letters (`rd-l` in `rd-w` words; motion.css jitters them) with
 * plain spaces, so words still wrap and `textContent` reads as `text`. Rebuilds only when the text changes;
 * safe to call every frame. */
export function scrawl(el:HTMLElement,text:string):void {
    if(scrawled.get(el)===text)return;
    scrawled.set(el,text);
    const doc=el.ownerDocument;
    if(!feelState().on('scrawl')||typeof doc?.createTextNode!=='function'){el.textContent=text;return;}
    el.textContent='';
    let word:HTMLElement|undefined;
    for(const char of text){
        if(char===' '){word=undefined;el.appendChild(doc.createTextNode(' '));continue;}
        if(!word){word=doc.createElement('rd-w');el.appendChild(word);}
        const letter=doc.createElement('rd-l');letter.textContent=char;word.appendChild(letter);
    }
}

/** FLIP, first half: each child's current top. */
export function measure(parent:HTMLElement):Map<Element,number>|undefined {
    if(typeof parent.getBoundingClientRect!=='function')return undefined;
    const tops=new Map<Element,number>();
    for(const child of Array.from(parent.children))tops.set(child,child.getBoundingClientRect().top);
    return tops;
}
/** FLIP, second half: moved children slide from their old place; newcomers fade in when `enter`. */
export function slide(parent:HTMLElement,before:Map<Element,number>|undefined,item:FeelItem,ms=340,enter=true):void {
    if(!before||!uiMotion(item))return;
    for(const child of Array.from(parent.children)){
        if(typeof child.animate!=='function')continue;
        const top=before.get(child);
        if(top===undefined){if(enter)child.animate([{opacity:0,transform:'translateX(-14px)'},{opacity:1,transform:'none'}],{duration:ms,easing:'ease-out'});continue;}
        const dy=top-child.getBoundingClientRect().top;
        if(Math.abs(dy)>.5)child.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:ms,easing:'cubic-bezier(.2,.9,.3,1.12)'});
    }
}
/** Put `nodes` into `parent` in this order, moving only the ones out of place (re-inserting an element
 * restarts its CSS animations); moved children FLIP-slide. An unchanged order touches nothing. */
export function arrange(parent:HTMLElement,nodes:readonly Element[],item:FeelItem,ms=340,enter=true):void {
    const current=parent.children;
    if(current.length===nodes.length&&nodes.every((node,i)=>current[i]===node))return;
    const before=measure(parent);
    if(typeof parent.insertBefore==='function'){
        nodes.forEach((node,i)=>{if(current[i]!==node)parent.insertBefore(node,current[i]??null);});
        while(current.length>nodes.length)current[nodes.length]!.remove();
    }else{parent.replaceChildren();for(const node of nodes)parent.appendChild(node);}
    slide(parent,before,item,ms,enter);
}

const EXIT:Keyframe[]=[{opacity:1,transform:'none'},{opacity:0,transform:'translateX(28px) rotate(3deg) scale(.96)'}];
/** Remove `el` after an exit animation; its siblings then slide into the gap. */
export function leave(el:HTMLElement,item:FeelItem,frames:Keyframe[]=EXIT,ms=260):void {
    if(!uiMotion(item)||typeof el.animate!=='function'||!el.parentElement){el.remove();return;}
    el.classList.add('ui-leaving');
    el.animate(frames,{duration:ms,easing:'cubic-bezier(.5,0,.75,.3)',fill:'forwards'}).onfinish=()=>{
        const parent=el.parentElement;if(!parent)return;
        const before=measure(parent);el.remove();slide(parent,before,item,220);
    };
}

const counting=new WeakMap<HTMLElement,number>();
/** Roll a number up from `from` to `to` in `el`, written through `format`. */
export function countUp(el:HTMLElement,to:number,format:(value:number)=>string,item:FeelItem,ms=700,from=0):void {
    const running=counting.get(el);if(running!==undefined){cancelAnimationFrame(running);counting.delete(el);}
    if(!uiMotion(item)||typeof requestAnimationFrame!=='function'||to===from){el.textContent=format(to);return;}
    const start=performance.now();
    const step=(now:number)=>{
        const t=Math.min(1,Math.max(0,(now-start)/ms));
        el.textContent=format(t<1?Math.round(from+(to-from)*(1-(1-t)**3)):to);
        if(t<1)counting.set(el,requestAnimationFrame(step));else counting.delete(el);
    };
    el.textContent=format(from);counting.set(el,requestAnimationFrame(step));
}

/** Points fly on an arc from a screen point to `target`, which bumps as they land. `chip` is the text, or a caller-owned
 * element (pooled: it is detached after landing and skipped while still in flight). */
export function fly(doc:Document,chip:string|HTMLElement,from:{x:number;y:number},target:HTMLElement,item:FeelItem,ms=780):void {
    if(!uiMotion(item)||!doc.body||typeof target.getBoundingClientRect!=='function')return;
    if(typeof chip!=='string'&&chip.isConnected)return;
    const to=target.getBoundingClientRect();if(!to.width)return;
    if(typeof chip==='string'){const text=chip;chip=doc.createElement('div');chip.className='ui-fly';chip.textContent=text;chip.setAttribute('aria-hidden','true');}
    chip.style.left=`${from.x}px`;chip.style.top=`${from.y}px`;doc.body.appendChild(chip);
    if(typeof chip.animate!=='function'){chip.remove();return;}
    const dx=to.left+to.width*.5-from.x,dy=to.top+to.height*.5-from.y,landed=chip;
    chip.animate([
        {transform:'translate(-50%,-50%) scale(.3)',opacity:0},
        {transform:'translate(-50%,-50%) scale(1.5) rotate(-6deg)',opacity:1,offset:.16},
        {transform:`translate(calc(-50% + ${dx*.4}px),calc(-50% + ${dy*.4-70}px)) scale(1.1) rotate(4deg)`,opacity:1,offset:.5},
        {transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.5)`,opacity:.8},
    ],{duration:ms,easing:'cubic-bezier(.45,0,.55,1)'}).onfinish=()=>{landed.remove();replay(target,'ui-bump',true);};
}

/** A paper ghost of `panel` slides away, so the real panel can close at once. */
export function ghost(doc:Document,panel:HTMLElement,item:FeelItem):void {
    if(!uiMotion(item)||!doc.body||typeof panel.getBoundingClientRect!=='function')return;
    const rect=panel.getBoundingClientRect();if(!rect.width)return;
    const paper=doc.createElement('div');paper.className='ui-ghost';paper.setAttribute('aria-hidden','true');
    Object.assign(paper.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
    doc.body.appendChild(paper);
    if(typeof paper.animate!=='function'){paper.remove();return;}
    paper.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(46px) rotate(4deg) scale(.94)'}],{duration:230,easing:'cubic-bezier(.5,0,.75,.3)'}).onfinish=()=>paper.remove();
}
