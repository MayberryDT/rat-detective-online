import {afterEach,expect,it,vi} from 'vitest';
import {TitleScreen} from '../../src/ui/TitleScreen';

class Node extends EventTarget {
    textContent='';disabled=true;style={};offsetWidth=1;focus=vi.fn();
    hidden=false;toggleAttribute=vi.fn((name:string,force?:boolean)=>{if(name==='hidden')this.hidden=force??!this.hidden;});
    private classes=new Set<string>();
    classList={add:(name:string)=>this.classes.add(name),remove:(name:string)=>this.classes.delete(name),contains:(name:string)=>this.classes.has(name)};
    click(){this.dispatchEvent(new Event('click'));}
}
const titles:TitleScreen[]=[];
afterEach(()=>{titles.splice(0).forEach(t=>t.dispose());vi.restoreAllMocks();vi.useRealTimers();});
function setup(search='',extra:Record<string,unknown>={}){
    vi.useFakeTimers();let draw=0;vi.spyOn(Math,'random').mockImplementation(()=>((draw++*13)%97)/97);
    const nodes=new Map<string,unknown>(['enter-city-btn','reroll-name-btn','player-name','title-screen','invitation-status'].map(id=>[id,new Node()]));
    for(const [id,node] of Object.entries(extra))nodes.set(id,node);
    const doc=Object.assign(new EventTarget(),{hidden:false,pointerLockElement:null,body:new Node(),getElementById:(id:string)=>nodes.get(id)??null});
    const target=Object.assign(new EventTarget(),{matchMedia:()=>({matches:false}),location:{search}});
    const title=new TitleScreen(doc as unknown as Document,target as unknown as Window);titles.push(title);
    const node=(id:string)=>nodes.get(id) as Node;
    return {title,doc,target,enter:node('enter-city-btn'),reroll:node('reroll-name-btn'),name:node('player-name'),invitation:node('invitation-status')};
}
it('enables name generation and entry without constructing or waiting for the game',()=>{
    const f=setup();expect(f.enter.disabled).toBe(false);expect(f.name.textContent).not.toBe('');
    const first=f.title.name;f.reroll.click();expect(f.title.name).not.toBe(first);expect(f.name.textContent).not.toBe('');
    vi.advanceTimersByTime(500);expect(f.name.textContent).toBe(f.title.name);
    const enter=vi.fn();f.title.onEnter=enter;f.enter.click();expect(enter).toHaveBeenCalledWith(f.title.name);
});
it('enters with the selected name even during a shuffle and preserves it when callbacks attach',()=>{
    const f=setup();f.reroll.click();const selected=f.title.name;
    const enter=vi.fn();f.title.onEnter=enter;f.enter.click();
    expect(f.name.textContent).toBe(selected);expect(enter).toHaveBeenCalledWith(selected);
    vi.advanceTimersByTime(1000);expect(f.title.name).toBe(selected);expect(f.name.textContent).toBe(selected);
});
it('blocks repeated entry while busy and releases title listeners and timers on disposal',()=>{
    const f=setup(),enter=vi.fn();f.title.onEnter=enter;f.title.available=()=>false;
    const name=f.title.name;f.enter.click();f.reroll.click();expect(enter).not.toHaveBeenCalled();expect(f.title.name).toBe(name);
    f.title.available=()=>true;f.reroll.click();f.title.dispose();expect(vi.getTimerCount()).toBe(0);
    f.enter.click();expect(enter).not.toHaveBeenCalled();
});
it('shows valid and rejected public invitation intent before entry',()=>{
    const room='public-live-v2-12345678-1234-4123-8123-123456789abc';
    const invited=setup(`?preferred=${room}`);expect(invited.invitation.textContent).toBe('INVITED DISPATCH — ENTER TO JOIN');expect(invited.invitation.hidden).toBe(false);
    const invalid=setup('?preferred=graybox-practice-secret');expect(invalid.invitation.textContent).toBe('INVITATION UNAVAILABLE — OPEN MATCHMAKING');expect(invalid.invitation.hidden).toBe(false);
});
it('runs red string between pin centres, follows layout changes and drops strings to scraps off the wall',()=>{
    const box=(r:{x:number;y:number;width:number})=>({getBoundingClientRect:()=>({...r,height:r.width})});
    const line=(a:string,b:string)=>{const attrs=new Map([['data-a',a],['data-b',b]]);
        return {style:{display:''},getAttribute:(name:string)=>attrs.get(name)??null,setAttribute:(name:string,value:string)=>attrs.set(name,value),attrs};};
    const shown=line('pin-a','pin-b'),offWall=line('pin-a','pin-hidden'),moving={x:410,y:260,width:10};
    const f=setup('',{'title-strings':{...box({x:100,y:50,width:800}),children:[shown,offWall]},
        'pin-a':box({x:110,y:60,width:10}),'pin-b':box(moving),'pin-hidden':box({x:0,y:0,width:0})});
    expect(['x1','y1','x2','y2'].map(k=>shown.attrs.get(k))).toEqual(['15','15','315','215']);
    expect(shown.style.display).toBe('');expect(offWall.style.display).toBe('none');
    Object.assign(moving,{x:210,y:160});f.target.dispatchEvent(new Event('resize'));
    expect(['x2','y2'].map(k=>shown.attrs.get(k))).toEqual(['115','115']);
});
