import {it,expect,vi} from 'vitest';
import {RatBillboard} from '../../src/ui/RatBillboard';
it('fits long names without changing text or health-bar world scale',()=>{
 const original=globalThis.document;
 const fill=vi.fn(),stroke=vi.fn();
 const canvas={width:0,height:0,getContext:()=>({measureText:()=>({width:600}),clearRect(){},fillRect(){},fillText:fill,strokeText:stroke})};
 vi.stubGlobal('document',{createElement:()=>canvas});
 try{
  const name='Constable Extremely Long Name',billboard=new RatBillboard(name);
  expect(canvas.width).toBe(632);
  expect(fill).toHaveBeenCalledWith(name,316,40,600);
  expect(stroke).toHaveBeenCalledWith(name,316,40,600);
  expect(billboard.sprite.scale.x/canvas.width).toBeCloseTo(.75/128);
  billboard.setHealth(1);expect(fill).toHaveBeenLastCalledWith(name,316,40,600);billboard.dispose();
 }finally{vi.stubGlobal('document',original);}
});
