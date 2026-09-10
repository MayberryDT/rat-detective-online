import type { Vec3Data } from './networkProtocol';

export const BOT_OPPORTUNISTIC_FIRE = {
    pauseMinMs: 450/1.2, pauseMaxMs: 1500/1.2,
    quietMinMs: 3000, quietMaxMs: 7000,
    activeMinMs: 6000, activeMaxMs: 10000,
    shotMinMs: 280/1.2, shotMaxMs: 450/1.2,
    rangeMin: 18, rangeMax: 42,
    wallShotChance: .35,
} as const;

/** Speculative cheese down the current route and toward its side walls.
 * Inputs contain only the bot's pose and navigation waypoint, never opponents.
 * The real projectile simulation supplies bounces; no perfect bank-shot solver.
 */
export class BotOpportunisticFire {
    private nextShot?: number;
    private remaining = 0;
    private activeUntil = 0;
    private yaw = 0;
    private pitch = 0;
    private range = 0;
    private aimUntil = 0;
    private aimedYaw = 0;
    constructor(private readonly random: () => number) {}
    reset(): void { this.nextShot=undefined;this.remaining=0;this.aimUntil=0;this.activeUntil=0; }
    facing(now:number):number|undefined { return now<this.aimUntil?this.aimedYaw:undefined; }
    private between(min: number,max: number): number { return min+this.random()*(max-min); }
    step(now:number,self:Vec3Data,heading:number,waypoint:Vec3Data|undefined,enabled:boolean,allowFire:boolean):Vec3Data|undefined {
        if(!enabled){this.reset();return;}
        if(this.nextShot===undefined){
            this.nextShot=now+this.between(800,1800);return;
        }
        if(this.activeUntil && now>=this.activeUntil){
            this.activeUntil=0;this.remaining=0;this.aimUntil=0;
            this.nextShot=now+this.between(BOT_OPPORTUNISTIC_FIRE.quietMinMs,BOT_OPPORTUNISTIC_FIRE.quietMaxMs);
        }
        if(!allowFire||now<this.nextShot)return;
        if(!this.activeUntil)this.activeUntil=now+this.between(BOT_OPPORTUNISTIC_FIRE.activeMinMs,BOT_OPPORTUNISTIC_FIRE.activeMaxMs);
        if(!this.remaining){
            this.remaining=this.random()<.4?1:2+Math.floor(this.random()*4);
            // Forward shots travel down alleys/doorways. Oblique shots meet their
            // walls at an angle and let ordinary restitution create ricochets.
            const side=this.random()<.5?-1:1;
            const offset=this.random()<BOT_OPPORTUNISTIC_FIRE.wallShotChance
                ?side*this.between(.35,.85):this.between(-.16,.16);
            this.yaw=heading+offset;
            const slope=waypoint?Math.atan2(waypoint.y-self.y,Math.max(2,Math.hypot(waypoint.x-self.x,waypoint.z-self.z))):0;
            // A descending route sends shots into stairs/sewers rather than sky.
            this.pitch=Math.max(-.38,Math.min(.22,slope))+this.between(-.035,.035);
            this.range=this.between(BOT_OPPORTUNISTIC_FIRE.rangeMin,BOT_OPPORTUNISTIC_FIRE.rangeMax);
        }
        const yaw=this.yaw+this.between(-.04,.04);
        const aim={x:self.x+Math.sin(yaw)*Math.cos(this.pitch)*this.range,
            y:self.y+.9+Math.sin(this.pitch)*this.range,
            z:self.z+Math.cos(yaw)*Math.cos(this.pitch)*this.range};
        this.remaining--;
        this.aimedYaw=yaw;this.aimUntil=now+(this.remaining?500:350);
        this.nextShot=now+(this.remaining
            ?this.between(BOT_OPPORTUNISTIC_FIRE.shotMinMs,BOT_OPPORTUNISTIC_FIRE.shotMaxMs)
            :this.between(BOT_OPPORTUNISTIC_FIRE.pauseMinMs,BOT_OPPORTUNISTIC_FIRE.pauseMaxMs));
        return aim;
    }
}
