import {expect,it} from 'vitest';
import {placeHudLabel,type HudRect} from '../../src/ui/hudLabelPlacement';
it.each([[1280,720,230,140],[900,500,165,110],[700,370,165,100]])('keeps direction guidance visible beside roulette at %sx%s',(w,h,lw,lh)=>{
 const blocks:HudRect[]=[{left:10,top:10,right:w*.22,bottom:h*.52},{left:w*.3,top:10,right:w*.7,bottom:h*.3},{left:w*.8,top:10,right:w-10,bottom:150}];
 const p=placeHudLabel(w/2,100,lw,lh,w,h,blocks);
 expect(p.x-lw/2).toBeGreaterThanOrEqual(8);expect(p.x+lw/2).toBeLessThanOrEqual(w-8);
 expect(p.y-lh/2).toBeGreaterThanOrEqual(8);expect(p.y+lh/2).toBeLessThanOrEqual(h-8);
 for(const b of [...blocks,{left:w/2-95,right:w/2+95,top:h/2-75,bottom:h/2+75}]){
  expect(p.x+lw/2<=b.left||p.x-lw/2>=b.right||p.y+lh/2<=b.top||p.y-lh/2>=b.bottom).toBe(true);
 }
});
