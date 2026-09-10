import type {Vec3Data} from '../shared/networkProtocol';
import type {FoleyPlay} from './foleyCatalog';
/** Only the local rat's unmistakable heavy landing. Walking and idle are silent. */
export class MotionFoley {
    private previous?:{p:Vec3Data;fall:number;air:boolean};
    constructor(private readonly play:FoleyPlay){}
    update(p:Vec3Data,dt:number,grounded:boolean):void {
        const old=this.previous;
        if(!old||!Number.isFinite(dt)||dt<=0||dt>.1){this.previous={p:{...p},fall:0,air:false};return;}
        const distance=Math.hypot(p.x-old.p.x,p.y-old.p.y,p.z-old.p.z),vy=(p.y-old.p.y)/dt;
        if(!Number.isFinite(vy)||distance>Math.max(2,dt*100)){this.previous={p:{...p},fall:0,air:false};return;}
        if(!grounded&&vy< -5){old.air=true;old.fall=Math.min(old.fall,vy);}
        if(grounded){if(old.air&&old.fall< -17)this.play('land-heavy',p,{key:'local-land'});old.air=false;old.fall=0;}
        old.p={...p};
    }
    clear():void{this.previous=undefined;}
}
