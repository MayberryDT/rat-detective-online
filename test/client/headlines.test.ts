import {describe,expect,it,vi} from 'vitest';
import {Headlines} from '../../src/ui/Headlines';
import {deathRecap} from '../../src/ui/deathRecap';

function queue(){
    let now=0;
    const headlines=new Headlines(()=>now),shrink=vi.spyOn(headlines,'shrink').mockImplementation(()=>{});
    return {headlines,shrink,at:(ms:number)=>{now=ms;}};
}

describe('one headline at a time',()=>{
    it('lets the bigger message take the screen and shrinks the lesser one to the compact line',()=>{
        const {headlines,shrink,at}=queue(),hidePoster=vi.fn();
        expect(headlines.claim('poster','news','WANTED: CAM',3600,hidePoster)).toBe(true);
        at(500);expect(headlines.claim('incident','incident','INCIDENT · BLACKOUT',2200)).toBe(true);
        expect(hidePoster).toHaveBeenCalledOnce();
        at(600);expect(headlines.claim('bounty','news','BOUNTY CLAIMED',2800)).toBe(false);
        expect(shrink).toHaveBeenLastCalledWith('BOUNTY CLAIMED');
        // An equal rank never interrupts what is up.
        expect(headlines.claim('incident-2','incident','INCIDENT · CROSSFIRE',2200)).toBe(false);
        // Once the holder's time runs out anything may go big again.
        at(2700);expect(headlines.claim('bounty','news','BOUNTY CLAIMED',2800)).toBe(true);
    });
    it('ranks your case over an incident over the rest',()=>{
        const {headlines,at}=queue();
        headlines.claim('news','news','RAT DOWN',2400);
        expect(headlines.claim('incident','incident','INCIDENT',2200)).toBe(true);
        at(10);expect(headlines.claim('case','case','ON THE CASE',1500)).toBe(true);
        at(20);expect(headlines.claim('incident','incident','INCIDENT',2200)).toBe(false);
    });
    it('keeps the death screen up until it is released, whatever held the screen before',()=>{
        const {headlines,at}=queue(),hideStamp=vi.fn();
        headlines.claim('case','case','ON THE CASE',1500,hideStamp);
        at(100);headlines.take('death','death',Infinity);
        expect(hideStamp).toHaveBeenCalledOnce();
        at(60_000);expect(headlines.claim('incident','incident','INCIDENT',2200)).toBe(false);
        headlines.release('death');
        expect(headlines.claim('incident','incident','INCIDENT',2200)).toBe(true);
    });
    it('lets a holder renew its own message without hiding it',()=>{
        const {headlines,at}=queue(),hide=vi.fn();
        headlines.claim('kill','news','RAT DOWN · A',2400,hide);
        at(500);expect(headlines.claim('kill','news','RAT DOWN · B',2400,hide)).toBe(true);
        expect(hide).not.toHaveBeenCalled();
        // A release by anyone else does nothing.
        headlines.release('poster');
        at(1000);expect(headlines.claim('poster','news','WANTED',3600)).toBe(false);
    });
    it('explains a word once per browser, remembered in localStorage',()=>{
        const store=new Map<string,string>();
        vi.stubGlobal('localStorage',{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);}});
        try{
            const first=new Headlines(()=>0);
            expect(first.firstTime('made')).toBe(true);
            expect(first.firstTime('made')).toBe(false);
            expect(first.firstTime('held')).toBe(true);
            // A later visit (a fresh page) reads what this browser has met.
            const later=new Headlines(()=>0);
            expect(later.firstTime('made')).toBe(false);
            expect(later.firstTime('dud-laser')).toBe(true);
        }finally{vi.unstubAllGlobals();}
    });
});

describe('the death recap',()=>{
    const death={type:'playerDied' as const,victimId:'me',killerId:'v',killerName:'Inspector Vermin',victimName:'Cheddar',respawnAt:1};
    it('names the killer and the weapon, with a headshot',()=>{
        expect(deathRecap(death,'me')).toEqual({killer:'INSPECTOR VERMIN',how:'CHEESE GUN'});
        expect(deathRecap({...death,weapon:'tommy-gun',headshot:true},'me')).toEqual({killer:'INSPECTOR VERMIN',how:'TOMMY GUN · HEADSHOT'});
        expect(deathRecap({...death,weapon:'laser'},'me','big-cheese').how).toBe('LASER');
    });
    it('says an incident changed the cheese gun, an explosion, or the city',()=>{
        expect(deathRecap(death,'me','big-cheese').how).toBe('BIG CHEESE');
        expect(deathRecap(death,'me','blackout').how).toBe('CHEESE GUN');
        expect(deathRecap({...death,blast:true},'me','improper-disposal').how).toBe('AN EXPLOSION');
        expect(deathRecap({...death,killerId:'me',killerName:'Cheddar',blast:true},'me').killer).toBe('YOURSELF');
        expect(deathRecap({...death,killerId:null,killerName:null,cause:'drowned'},'me')).toEqual({killer:'THE CITY',how:'DROWNED IN THE HARBOUR'});
    });
});
