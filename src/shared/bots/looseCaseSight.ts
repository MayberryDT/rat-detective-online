import type {ChaosState} from '../chaosState';
import type {Vec3Data} from '../networkProtocol';
import {botSight} from './sight';
/** Keep the last directly seen point for ten seconds; invisible movement never updates memory. */
export class LooseCaseSight {
    private readonly seen=new Map<string,{p:Vec3Data;at:number}>();
    reset():void {this.seen.clear();}
    forget(key:string):void {this.seen.delete(key);}
    observe(key:string,p:Vec3Data,self:Vec3Data,now:number,state:ChaosState|undefined,clear:(p:Vec3Data)=>boolean):Vec3Data|undefined {
        if(Math.hypot(self.x-p.x,self.y-p.y,self.z-p.z)<botSight(state).looseCase&&clear(p)){
            this.seen.set(key,{p:{...p},at:now});return p;
        }
        const seen=this.seen.get(key);
        return seen&&now-seen.at<10_000?seen.p:undefined;
    }
}
