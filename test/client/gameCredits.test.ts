import {expect,it,vi} from 'vitest';
import {bindGameCredits} from '../../src/ui/GameCredits';
import {bindGamePointerLock} from '../../src/session/GamePointerLock';

function fixture(){
    const classes=new Set<string>(),titleClasses=new Set<string>();
    const link=(href:string)=>{
        const attributes=new Map([['href',href]]),child={};
        return {tagName:'A',tabIndex:0,child,blur:vi.fn(),contains:(node:unknown)=>node===child,
            getAttribute:(key:string)=>attributes.get(key)??null,hasAttribute:(key:string)=>attributes.has(key),
            setAttribute:(key:string,value:string)=>attributes.set(key,value),removeAttribute:(key:string)=>attributes.delete(key)};
    };
    const creator=link('https://tylermayberry.dev'),music=link('https://www.youtube.com/watch?v=k4hjX6ZsplU');
    const title={style:{display:'flex'},classList:{contains:(name:string)=>titleClasses.has(name)}};
    const elements=new Map<string,unknown>([['creator-credit-link',creator],['music-credit-link',music],['title-screen',title]]);
    const smallScreen={matches:false};
    const doc=Object.assign(new EventTarget(),{pointerLockElement:null as unknown,activeElement:creator,hidden:false,hasFocus:()=>true,
        defaultView:{matchMedia:()=>smallScreen},
        body:{classList:{contains:(name:string)=>classes.has(name)}},getElementById:(id:string)=>elements.get(id)??null});
    creator.blur.mockImplementation(()=>{Object.assign(doc,{activeElement:null});});
    const abort=new AbortController(),request=vi.fn(),canvas={requestPointerLock:request},target=new EventTarget();
    const credits=bindGameCredits(abort.signal,doc as unknown as Document);
    bindGamePointerLock({canvas:canvas as unknown as HTMLElement,doc:doc as unknown as Document,target:target as Window,
        playing:()=>titleClasses.has('fade-out'),enabled:()=>!classes.has('touch-mode'),signal:abort.signal,
        allowUnlockedClick:credits.allowUnlockedClick,now:()=>1000});
    const event=(type:string,target:unknown=creator,extra:object={})=>{
        const e=new Event(type,{cancelable:true});
        for(const [key,value] of Object.entries({target,button:0,detail:1,...extra}))Object.defineProperty(e,key,{value});
        doc.dispatchEvent(e);return e;
    };
    const lock=(value:unknown=canvas)=>{doc.pointerLockElement=value;event('pointerlockchange',doc);};
    const click=(where:unknown=creator)=>{event('pointerdown',where);return event('click',where);};
    return {creator,music,classes,titleClasses,doc,canvas,credits,request,abort,event,lock,click,smallScreen};
}
it('permits both native title links, including a child target and keyboard activation',()=>{
    const f=fixture();expect(f.click().defaultPrevented).toBe(false);expect(f.click(f.music.child).defaultPrevented).toBe(false);
    expect(f.event('keydown',f.creator,{code:'Enter'}).defaultPrevented).toBe(false);
    expect(f.event('click',f.creator,{detail:0}).defaultPrevented).toBe(false);
    expect(f.request).not.toHaveBeenCalled();f.abort.abort();
});
it('blocks all credit activation while captured and removes href and focusability',()=>{
    const f=fixture();f.lock();
    expect(f.creator.blur).toHaveBeenCalledOnce();
    for(const link of [f.creator,f.music]){
        expect(link.getAttribute('href')).toBeNull();expect(link.tabIndex).toBe(-1);expect(link.getAttribute('aria-disabled')).toBe('true');
        for(const type of ['pointerdown','mousedown','click','auxclick','contextmenu','keydown'])
            expect(f.event(type,link,{code:'Enter',detail:0}).defaultPrevented,type).toBe(true);
    }
    expect(f.event('mousedown',f.canvas).defaultPrevented).toBe(false);f.abort.abort();
});
it('checks current capture state even before pointerlockchange or with another locked element',()=>{
    const f=fixture();f.doc.pointerLockElement={};
    expect(f.creator.getAttribute('href')).toBe('https://tylermayberry.dev');
    expect(f.event('click',f.creator,{detail:0}).defaultPrevented).toBe(true);
    expect(f.event('auxclick',f.music).defaultPrevented).toBe(true);f.abort.abort();
});
it('allows a fresh desktop credit click after Escape without recapturing or allowing trailing shots',()=>{
    const f=fixture();f.titleClasses.add('fade-out');f.lock();f.event('pointerdown',f.canvas);f.lock(null);
    expect(f.creator.getAttribute('href')).toBe('https://tylermayberry.dev');expect(f.creator.tabIndex).toBe(0);
    expect(f.event('click').defaultPrevented).toBe(true);
    expect(f.click().defaultPrevented).toBe(false);expect(f.request).not.toHaveBeenCalled();
    expect(f.event('click',{}).defaultPrevented).toBe(true);f.abort.abort();
});
it('permits middle-click only after a fresh unlocked press',()=>{
    const f=fixture();f.titleClasses.add('fade-out');
    f.event('pointerdown',f.creator,{button:1});expect(f.event('auxclick',f.creator,{button:1}).defaultPrevented).toBe(false);
    f.lock();expect(f.event('auxclick',f.creator,{button:1}).defaultPrevented).toBe(true);f.abort.abort();
});
it('permits small-screen and mobile title credits but blocks gameplay credits, including after resize',()=>{
    for(const mobile of [false,true]){
        const f=fixture();if(mobile)f.classes.add('touch-mode');else f.smallScreen.matches=true;
        expect(f.click().defaultPrevented).toBe(false);expect(f.click(f.music).defaultPrevented).toBe(false);
        f.titleClasses.add('fade-out');
        expect(f.click().defaultPrevented).toBe(true);expect(f.click(f.music).defaultPrevented).toBe(true);
        f.smallScreen.matches=false;expect(f.click().defaultPrevented).toBe(mobile);
        f.smallScreen.matches=true;expect(f.click().defaultPrevented).toBe(true);
        f.titleClasses.delete('fade-out');expect(f.click().defaultPrevented).toBe(false);f.abort.abort();
    }
});
it('blocks hidden title music during desktop play and removes event listeners on disposal',()=>{
    const f=fixture();f.titleClasses.add('fade-out');expect(f.click(f.music).defaultPrevented).toBe(true);
    f.abort.abort();f.doc.pointerLockElement=f.canvas;
    expect(f.event('click',f.creator,{detail:0}).defaultPrevented).toBe(false);
});
