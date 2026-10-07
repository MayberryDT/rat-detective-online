import {describe,expect,it} from 'vitest';
import {RatBot} from '../../src/shared/bots/ratBot';
import type {MotorNavigation} from '../../src/shared/bots/motor';
import type {ChaosState,TrapState} from '../../src/shared/chaosState';
import {WEAPON_TUNING,type WeaponKind} from '../../src/shared/pickups';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import type {PlayerData} from '../../src/shared/networkProtocol';
import {worldIntent} from './botControls';

const player=(id:string,x:number,z:number):PlayerData=>createPlayer(id,id,DEFAULT_APPEARANCE,{x,y:0,z});
const nav:MotorNavigation={route:(_from,to)=>[{...to}],localStep:(_from,to)=>to,explorationTargets:()=>[{x:0,y:0,z:40}]};
/** A quiet city with the case lying north; `weapon` held by `me`; `trapOwner`'s Mousetrap on the way, 15 units ahead. */
function state(weapon?:WeaponKind,trapOwner?:string):ChaosState {
    const pose={q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}};
    const traps:TrapState[]|undefined=trapOwner?[{id:'trap',owner:trapOwner,x:0,y:0,z:15,yaw:0,hp:WEAPON_TUNING.trapHp,at:0}]:undefined;
    return {time:0,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:0,y:0,z:40},...pose},
        dispatch:{phase:'cooldown',started:0,until:1e9,serial:0},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''},
        ...(weapon?{buffs:{me:{weapon,...(weapon==='mousetrap'?{}:{weaponUntil:1e9})}}}:{}),...(traps?{traps}:{})};
}
/** The times a rat that stands still fires over `ms`, and the moments its trigger is pressed. */
function fired(s:ChaosState,others:PlayerData[],ms:number,navigation=nav):number[] {
    const self=player('me',0,0),bot=new RatBot(navigation,0,()=>.5),out:number[]=[];
    for(let now=0;now<ms;now+=1000/60){
        const intent=worldIntent(bot.step(now,self,[self,...others],s,()=>true,false,true),self);
        self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
        if(intent.shoot)out.push(now);
    }
    return out;
}
const gaps=(times:readonly number[])=>times.slice(1).map((t,i)=>t-times[i]!);

describe('bots with the arsenal',()=>{
    it('holds the Tommy Gun trigger on a rival at about twenty a second, never faster than the gun',()=>{
        const shots=fired(state('tommy-gun'),[player('rival',0,20)],4000);
        const held=shots.filter(t=>t>=shots[0]!+500);
        // Tapping, the same rat manages under eight a second.
        expect(held.length/((4000-shots[0]!-500)/1000)).toBeGreaterThan(18);
        expect(Math.min(...gaps(shots))).toBeGreaterThanOrEqual(WEAPON_TUNING.tommyIntervalMs-1);
    });

    it('fires the Laser like the cheese gun: clicks faster than once a second, and sprays round corners',()=>{
        const shots=fired(state('laser'),[player('rival',0,20)],6000);
        expect(shots.length).toBeGreaterThan(6);
        expect(Math.min(...gaps(shots))).toBeLessThan(1000);
        expect(fired(state('laser'),[],10000).length).toBeGreaterThan(0);
    });

    it('sets a Mousetrap down within a few seconds, and retries a refused spot without spamming',()=>{
        const presses=fired(state('mousetrap'),[],8000);
        expect(presses[0]).toBeLessThan(5000);
        // The authority refuses unseen (the trap stays in paw here): presses stay spaced.
        expect(Math.min(...gaps(presses))).toBeGreaterThanOrEqual(1200);
        // In a doorway (walls close on both sides of the spot) it goes down at once.
        const door=fired(state('mousetrap'),[],2000,{...nav,ray:(from,to)=>from.y>.7?{point:to,normal:{x:1,y:0,z:0}}:undefined});
        expect(door[0]).toBeLessThan(1000);
    });

    it('ignores a legacy Mousetrap arming deadline under protocol 33',()=>{
        // A doorway: without the lockout it goes down within the first second.
        const doorway:MotorNavigation={...nav,ray:(from,to)=>from.y>.7?{point:to,normal:{x:1,y:0,z:0}}:undefined};
        const s=state('mousetrap'),ready=WEAPON_TUNING.trapLockMs+500;s.buffs!.me!.weaponReadyAt=ready;
        const self=player('me',0,0),bot=new RatBot(doorway,0,()=>.5),presses:number[]=[];
        for(let now=0;now<ready+2000;now+=1000/60){
            s.time=now;
            if(worldIntent(bot.step(now,self,[self],s,()=>true,false,true),self).shoot)presses.push(now);
        }
        expect(presses[0]).toBeLessThan(ready);
        expect(presses[0]).toBeLessThan(ready+1000);
    });

    it('never walks onto another rat\'s trap it can see, but runs straight over its own',()=>{
        const closest=(owner:string)=>{
            const self=player('me',0,0),s=state(undefined,owner),bot=new RatBot(nav,0,()=>.5),dt=1000/60;
            let nearest=Infinity;
            for(let now=0;now<4000;now+=dt){
                const intent=worldIntent(bot.step(now,self,[self],s,()=>true,false,true),self);
                self.x+=intent.x*dt/1000;self.z+=intent.z*dt/1000;
                nearest=Math.min(nearest,Math.hypot(self.x,self.z-15));
            }
            expect(self.z).toBeGreaterThan(25);
            return nearest;
        };
        expect(closest('rival')).toBeGreaterThan(WEAPON_TUNING.trapRadius+WEAPON_TUNING.trapFoot);
        expect(closest('me')).toBeLessThan(1);
    });

    it('shoots another rat\'s trap in its way, never its own',()=>{
        // Shots aimed down onto the trap's floor, not level fire along the way that passes over it.
        const at=(owner:string)=>{
            const self=player('me',0,0),s=state(undefined,owner),bot=new RatBot(nav,0,()=>.5);
            let hits=0;
            for(let now=0;now<3000;now+=1000/60){
                const controls=bot.step(now,self,[self],s,()=>true,false,true),intent=worldIntent(controls,self,15);
                self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
                if(intent.shoot&&Math.hypot(intent.shoot.x,intent.shoot.z-15)<1.5&&intent.shoot.y<.8)hits++;
            }
            return hits;
        };
        expect(at('rival')).toBeGreaterThan(3);
        expect(at('me')).toBe(0);
    });
});
