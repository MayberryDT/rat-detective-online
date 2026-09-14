import type { PlayerData, Vec3Data } from './networkProtocol';

export const BOT_COMBAT = {
    reactionMinMs: 200, reactionMaxMs: 450,
    shotMinMs: 200, shotMaxMs: 240,
    pauseMinMs: 120, pauseMaxMs: 300,
    observationMinMs: 160, observationMaxMs: 260,
    trackingMs: 200, correctionMinMs: 250, correctionMaxMs: 500,
    errorMinRadians: 2.8 * Math.PI / 180, errorMaxRadians: 5.6 * Math.PI / 180,
    followThroughMs: 180, followThroughChance: .25,
} as const;

/** A separate random stream prevents combat tuning from consuming navigation RNG. */
export function combatRandom(seed: number): () => number {
    let state = (seed + 0xa341316c) >>> 0;
    return () => {
        state=(state+0x6d2b79f5)>>>0;
        let value=Math.imul(state^(state>>>15),1|state);
        value^=value+Math.imul(value^(value>>>7),61|value);
        return ((value^(value>>>14))>>>0)/4294967296;
    };
}

/** Trigger rhythm and imperfect perception only. Never selects movement goals. */
export class BotCombat {
    private targetId?: string;
    private aimingAtCase=false;
    private observed?: Vec3Data;
    private tracked?: Vec3Data;
    private readyAt = 0;
    private observeAt = 0;
    private correctionAt = 0;
    private nextShot = 0;
    private burstUntil = 0;
    private remaining = 0;
    private pauseUntil = 0;
    private lastSeen = -Infinity;
    private lastStep?: number;
    private yawError = 0;
    private pitchError = 0;
    private canFollow = false;
    constructor(private readonly random: () => number) {}
    private between(min: number, max: number): number { return min + this.random() * (max-min); }
    reset(): void {
        this.targetId=undefined;this.aimingAtCase=false;this.observed=undefined;this.tracked=undefined;
        this.lastStep=undefined;this.lastSeen=-Infinity;
        this.nextShot=0;this.remaining=0;this.burstUntil=0;this.pauseUntil=0;this.canFollow=false;
    }
    step(now: number, self: Vec3Data, target: PlayerData | undefined, visible: boolean, allowFire=true,casePoint?:Vec3Data): {aim?:Vec3Data;shoot?:Vec3Data} {
        if(target&&target.id===this.targetId&&target.hp<=0){this.reset();return {};}
        if(visible&&target&&target.hp>0){
            if(target.id!==this.targetId||!!casePoint!==this.aimingAtCase){
                this.reset();this.targetId=target.id;
                this.aimingAtCase=!!casePoint;
                this.readyAt=now+this.between(BOT_COMBAT.reactionMinMs,BOT_COMBAT.reactionMaxMs);
                this.observeAt=0;this.correctionAt=0;
                this.observed=casePoint?{...casePoint}:{x:target.x,y:target.y+.9,z:target.z};this.tracked={...this.observed};
            }
            this.lastSeen=now;
            if(now>=this.observeAt){
                this.observed=casePoint?{...casePoint}:{x:target.x,y:target.y+.9,z:target.z};
                this.observeAt=now+this.between(BOT_COMBAT.observationMinMs,BOT_COMBAT.observationMaxMs);
            }
        }else if(now-this.lastSeen>BOT_COMBAT.followThroughMs){this.reset();return {};}
        if(!this.tracked||!this.observed)return {};
        const dt=this.lastStep===undefined?0:Math.min(100,Math.max(0,now-this.lastStep));this.lastStep=now;
        const blend=1-Math.exp(-dt/BOT_COMBAT.trackingMs);
        for(const axis of ['x','y','z'] as const)this.tracked[axis]+=(this.observed[axis]-this.tracked[axis])*blend;
        if(now>=this.correctionAt){
            const angle=this.between(BOT_COMBAT.errorMinRadians,BOT_COMBAT.errorMaxRadians),azimuth=this.random()*Math.PI*2;
            this.yawError=Math.cos(azimuth)*angle;this.pitchError=Math.sin(azimuth)*angle;
            this.correctionAt=now+this.between(BOT_COMBAT.correctionMinMs,BOT_COMBAT.correctionMaxMs);
        }
        const dx=this.tracked.x-self.x,dz=this.tracked.z-self.z,dy=this.tracked.y-(self.y+.9);
        const length=Math.max(1,Math.hypot(dx,dy,dz));
        const yaw=Math.atan2(dx,dz)+this.yawError,pitch=Math.atan2(dy,Math.hypot(dx,dz))+this.pitchError;
        const aim={x:self.x+Math.sin(yaw)*Math.cos(pitch)*length,y:self.y+.9+Math.sin(pitch)*length,z:self.z+Math.cos(yaw)*Math.cos(pitch)*length};
        if(!allowFire||now<this.readyAt||now<this.nextShot||now<this.pauseUntil)return {aim};
        const seeing=visible&&!!target&&target.id===this.targetId;
        // Only finish an existing burst at the last observed point. No hidden updates.
        if(!seeing&&(!this.canFollow||now>=this.burstUntil))return {aim};
        if(this.burstUntil&&(now>=this.burstUntil||this.remaining===0)){
            this.burstUntil=0;this.pauseUntil=now+this.between(BOT_COMBAT.pauseMinMs,BOT_COMBAT.pauseMaxMs);return {aim};
        }
        if(!this.burstUntil){
            this.remaining=this.random()<.15?1:3+Math.floor(this.random()*4);
            this.burstUntil=now+3000;
            this.canFollow=this.random()<BOT_COMBAT.followThroughChance;
        }
        this.remaining--;
        this.nextShot=now+this.between(BOT_COMBAT.shotMinMs,BOT_COMBAT.shotMaxMs);
        return {aim,shoot:aim};
    }
}
