import type {Vec3Data} from '../../networkProtocol';
import type {BotWaypoint} from '../../BotLaunchRoutes';
import type {MotorNavigation} from '../motor';

/** Route following, the way a hand on the keys and mouse runs it: look ahead along the route to the furthest
 * point the rat can walk to in a straight line and run at that (cutting corners the geometry allows),
 * swing the running direction round at a hand's pace, and ease off for sharp turns. Each rat has its own
 * pace, which drifts a little over time. */
export const STEER={
    /** Running pace per rat, units a second (humans run 18; the base tier stays slower). */
    pace:[12.8,14.4] as readonly [number,number],
    /** How far ahead along the route the rat looks for a straight line, units, plus per unit of speed. */
    lookahead:4.5,lookaheadPerSpeed:.2,
    /** Re-choose the point to run at this often, ms. */
    carrotMs:120,
    /** How fast the running direction swings round, rad/s. */
    turnRate:8,
    /** Waypoints within this of the rat, ahead of it on the route, count as passed. */
    passRadius:1.8,
    /** A route point further above or below than this is a stair or a ledge: aim at it exactly. */
    level:.6,
} as const;

/** Pure-pursuit steering along a route, with a per-rat pace. Allocation-free per tick. */
export class BotSteer {
    /** Where to run this tick; valid after `pursue`. */
    readonly carrot={x:0,y:0,z:0};
    /** The route index the carrot sits on. */
    carrotIndex=-1;
    private carrotAt=0;
    private heading?:number;
    private lastAt?:number;
    private readonly pace:number;
    private readonly phase:number;
    constructor(random:()=>number){
        this.pace=STEER.pace[0]+random()*(STEER.pace[1]-STEER.pace[0]);this.phase=random()*100;
    }
    reset():void{this.carrotIndex=-1;this.carrotAt=0;this.heading=undefined;this.lastAt=undefined;}

    /** The index of the route point the rat is passing: the nearest of the next few on its level, when that
     * is close enough. Everything before it counts as passed. */
    passed(self:Vec3Data,route:readonly BotWaypoint[],index:number):number {
        let best=index,bestDistance=Infinity;
        for(let i=index;i<route.length&&i<index+10;i++){
            const w=route[i];
            if(w.launch||w.drop)break;
            if(Math.abs(w.y-self.y)>1.5)continue;
            const d=Math.hypot(w.x-self.x,w.z-self.z);
            if(d<bestDistance){bestDistance=d;best=i;}
        }
        return bestDistance<STEER.passRadius+1.2?best:index;
    }

    /** Choose the point to run at: the furthest route point within the lookahead that is on the rat's level,
     * reachable in a straight walk, and not past a launch, a drop or a level change. Without a walk check,
     * the current waypoint. */
    pursue(now:number,self:Vec3Data,route:readonly BotWaypoint[],index:number,speed:number,nav:MotorNavigation):void {
        if(now<this.carrotAt&&this.carrotIndex>=index&&this.carrotIndex<route.length)return;
        this.carrotAt=now+STEER.carrotMs;
        let pick=index;
        if(nav.walkable){
            const reach=STEER.lookahead+speed*STEER.lookaheadPerSpeed;
            let length=Math.hypot(route[index].x-self.x,route[index].z-self.z),last=index;
            for(let i=index+1;i<route.length;i++){
                const w=route[i],before=route[i-1];
                if(Math.abs(w.y-self.y)>STEER.level||before.launch||before.drop)break;
                length+=Math.hypot(w.x-before.x,w.z-before.z);
                if(length>reach)break;
                last=i;
                if(w.launch||w.drop)break;
            }
            // Furthest first; at most three sweeps a choice.
            for(let i=last,tries=0;i>index&&tries<3;i=Math.max(index,Math.floor((i+index)/2)),tries++){
                if(nav.walkable(self,route[i])){pick=i;break;}
                if(i===index+1)break;
            }
        }
        const w=route[pick];
        this.carrot.x=w.x;this.carrot.y=w.y;this.carrot.z=w.z;this.carrotIndex=pick;
    }

    /** This rat's running pace now: its own speed, drifting a few percent over seconds. */
    cruise(now:number):number {
        const t=now/1000+this.phase;
        return this.pace*(1+.045*Math.sin(t*.83)+.03*Math.sin(t*2.1+1.3));
    }

    /** Swing the running direction toward (dx, dz) at a hand's pace; `sharp` turns at once (stairs, pads,
     * jumps, fights). Writes the unit direction into `out`. */
    turn(now:number,dx:number,dz:number,sharp:boolean,out:{x:number;z:number}):void {
        const dt=this.lastAt===undefined?0:Math.min(.1,Math.max(0,(now-this.lastAt)/1000));this.lastAt=now;
        const want=Math.atan2(dx,dz);
        if(sharp||this.heading===undefined)this.heading=want;
        else {
            const gap=Math.atan2(Math.sin(want-this.heading),Math.cos(want-this.heading)),limit=STEER.turnRate*dt;
            this.heading+=Math.max(-limit,Math.min(limit,gap));
        }
        out.x=Math.sin(this.heading);out.z=Math.cos(this.heading);
    }
    /** How far the running direction still has to swing to face (dx, dz), radians. */
    behind(dx:number,dz:number):number {
        if(this.heading===undefined)return 0;
        const gap=Math.atan2(dx,dz)-this.heading;
        return Math.abs(Math.atan2(Math.sin(gap),Math.cos(gap)));
    }
}
