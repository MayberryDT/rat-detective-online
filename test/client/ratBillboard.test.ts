import {it,expect,vi} from 'vitest';
import {RatBillboard} from '../../src/ui/RatBillboard';

// Failure mode: a long name spills past the plate or squashes the world size of the health pips.
it('widens the plate for long names while keeping its world height and the text inside it',()=>{
 const original=globalThis.document;
 const fill=vi.fn();
 const noop=()=>{};
 const canvas={width:0,height:0,getContext:()=>({measureText:()=>({width:600}),clearRect:noop,fillRect:noop,fillText:fill,
  beginPath:noop,moveTo:noop,lineTo:noop,closePath:noop,fill:noop,stroke:noop})};
 vi.stubGlobal('document',{createElement:()=>canvas});
 try{
  const billboard=new RatBillboard('Constable Extremely Long Name');
  expect(canvas.width).toBeGreaterThan(600);expect(canvas.width).toBeLessThanOrEqual(1024);
  const [,,,maxWidth]=fill.mock.lastCall!;
  expect(maxWidth).toBeLessThanOrEqual(canvas.width);
  const height=billboard.sprite.scale.y;
  billboard.setHealth(1);billboard.update(.1);
  expect(billboard.sprite.scale.y).toBe(height);
  billboard.dispose();
 }finally{vi.stubGlobal('document',original);}
});
