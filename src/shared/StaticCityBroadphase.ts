import * as C from 'cannon-es';

/** SAP's exact pair order and bounds decisions, skipping only pairs that Cannon
 * unconditionally rejects because both bodies are static or sleeping. */
export class StaticCityBroadphase extends C.SAPBroadphase {
    private nextAwake=new Int32Array(0);
    override collisionPairs(_world:C.World,p1:C.Body[],p2:C.Body[]){
        if(this.dirty){this.sortList();this.dirty=false;}
        const bodies=this.axisList,n=bodies.length;
        if(this.nextAwake.length<n+1)this.nextAwake=new Int32Array(n+1);
        const next=this.nextAwake;next[n]=n;
        for(let i=n-1;i>=0;i--){const b=bodies[i];next[i]=(b.type&C.Body.STATIC)!==0||b.sleepState===C.Body.SLEEPING?next[i+1]:i;}
        for(let i=0;i<n;i++){
            const a=bodies[i],inert=(a.type&C.Body.STATIC)!==0||a.sleepState===C.Body.SLEEPING;
            for(let j=inert?next[i+1]:i+1;j<n;j=inert?next[j+1]:j+1){
                const b=bodies[j];
                if(!this.needBroadphaseCollision(a,b))continue;
                if(!C.SAPBroadphase.checkBounds(a,b,this.axisIndex))break;
                this.intersectionTest(a,b,p1,p2);
            }
        }
    }
}
