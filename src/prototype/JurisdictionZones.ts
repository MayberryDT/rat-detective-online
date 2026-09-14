import * as THREE from 'three';
import type { AssignmentState } from '../shared/assignments';
import { activeZone, nextZone, JURISDICTION_TUNING } from '../shared/jurisdiction';
import { JURISDICTION_ZONES, JURISDICTION_ZONE_IDS, zoneTiles, type JurisdictionZoneId } from '../shared/jurisdictionZones';

/** Two static draws per visible footprint. No lights, polling, colliders or wall outlines. */
export class JurisdictionZones {
    readonly root=new THREE.Group();
    private readonly views=new Map<JurisdictionZoneId,{group:THREE.Group;fill:THREE.MeshBasicMaterial;line:THREE.LineBasicMaterial}>();
    constructor(scene:THREE.Scene){scene.add(this.root);this.root.name='jurisdiction-zones';this.root.visible=false;}
    private view(id:JurisdictionZoneId){
        let view=this.views.get(id);if(view)return view;
        const y=JURISDICTION_ZONES[id].floorY+.045,vertices:number[]=[],edges=new Map<string,number[]>();
        const edge=(x:number,z:number,xx:number,zz:number)=>{
            const key=[`${x},${z}`,`${xx},${zz}`].sort().join('|');
            if(edges.has(key))edges.delete(key);else edges.set(key,[x,y+.01,z,xx,y+.01,zz]);
        };
        for(const r of zoneTiles(id)){
            const {xmin:a,xmax:b,zmin:c,zmax:d}=r;
            vertices.push(a,y,c,a,y,d,b,y,d,a,y,c,b,y,d,b,y,c);
            edge(a,c,a,d);edge(a,d,b,d);edge(b,d,b,c);edge(b,c,a,c);
        }
        const fill=new THREE.MeshBasicMaterial({color:0xd6bc73,transparent:true,opacity:.09,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
        const line=new THREE.LineBasicMaterial({color:0xf4d590,transparent:true,opacity:.85,depthWrite:false});
        const group=new THREE.Group();
        group.add(new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),fill));
        group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([...edges.values()].flat(),3)),line));
        this.root.add(group);view={group,fill,line};this.views.set(id,view);return view;
    }
    update(a?:AssignmentState):void {
        this.root.visible=!!a?.jurisdiction&&a.phase!=='closed';
        if(!this.root.visible||!a?.jurisdiction)return;
        const s=a.jurisdiction,id=activeZone(s),next=s.remainingMs<=JURISDICTION_TUNING.warningMs?nextZone(s):undefined;
        this.view(id);if(next)this.view(next);
        for(const key of JURISDICTION_ZONE_IDS){
            const v=this.views.get(key);if(!v)continue;
            v.group.visible=key===id||key===next;v.fill.opacity=key===id?.09:.025;v.line.opacity=key===id?.85:.25;
        }
    }
    clear():void {this.root.visible=false;}
    dispose():void {
        this.root.removeFromParent();this.root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments)o.geometry.dispose();});
        for(const v of this.views.values()){v.fill.dispose();v.line.dispose();}this.views.clear();this.root.clear();
    }
}
