import {expect,it,vi} from 'vitest';
import {TouchInput} from '../../src/session/TouchInput';
import {TOUCH_SHOT_INTERVAL_MS,SHOOT_RATE} from '../../src/shared/shotTiming';

it('supports moving, drag-aim firing and jumping with independently owned fingers',()=>{
 const look=vi.fn(),shoot=vi.fn(),input=new TouchInput(look);
 expect(input.start(1,'move',80,300)).toBe(true);input.move(1,104,300);
 expect(input.movement.x).toBeCloseTo(.4);
 input.start(2,'fire',600,300);input.move(2,620,280);input.start(3,'jump',600,200);
 input.tick(0,shoot);expect(look).toHaveBeenCalledWith(20,-20);expect(shoot).toHaveBeenCalledOnce();expect(input.movement.jump).toBe(true);
 input.end(2);input.tick(1000,shoot);expect(shoot).toHaveBeenCalledOnce();expect(input.movement.x).toBeCloseTo(.4);
 input.end(1);expect(input.movement.x).toBe(0);expect(input.movement.jump).toBe(true);input.end(3);expect(input.movement.jump).toBe(false);
});
it('has a dead zone and preserves analog strength while clamping diagonal speed',()=>{
 const input=new TouchInput(()=>{});input.start(1,'move',100,100);input.move(1,104,104);expect(input.movement.x).toBe(0);
 input.move(1,100,72);expect(input.movement.y).toBe(.5);
 input.move(1,500,-300);expect(Math.hypot(input.movement.x,input.movement.y)).toBeCloseTo(1);
});
it('keeps a joystick anchored and a look drag relative to its own finger',()=>{
 const look=vi.fn(),input=new TouchInput(look);input.start(1,'move',80,100);input.move(1,104,100);input.move(1,104,100);expect(input.movement.x).toBeCloseTo(.4);
 input.start(2,'look',400,100);input.move(2,420,110);input.move(2,425,100);expect(look.mock.calls).toEqual([[20,10],[5,-10]]);
});
it('does not let a second finger steal aim or the movement stick',()=>{
 const input=new TouchInput(()=>{});input.start(1,'look',0,0);expect(input.start(2,'fire',0,0)).toBe(false);expect(input.start(1,'move',0,0)).toBe(false);
 input.start(3,'move',0,0);expect(input.start(4,'move',0,0)).toBe(false);input.end(1);expect(input.start(2,'fire',0,0)).toBe(true);
});
it('ignores unknown fingers and invalid coordinates',()=>{
 const look=vi.fn(),input=new TouchInput(look);expect(input.start(1,'look',NaN,0)).toBe(false);
 input.move(5,10,10);input.end(5);input.start(2,'move',0,0);input.move(2,Infinity,10);expect(input.movement.x).toBe(0);expect(look).not.toHaveBeenCalled();
});
it('paces held fire below the existing server ceiling, without catch-up bursts or rapid-retap bypass',()=>{
 const shoot=vi.fn(),input=new TouchInput(()=>{});input.start(1,'fire',0,0);
 for(let t=0;t<1000;t++)input.tick(t,shoot);expect(shoot.mock.calls.length).toBe(SHOOT_RATE.limit);
 input.tick(5000,shoot);expect(shoot).toHaveBeenCalledTimes(SHOOT_RATE.limit+1);
 input.end(1);input.start(2,'fire',0,0);input.tick(5001,shoot);expect(shoot).toHaveBeenCalledTimes(SHOOT_RATE.limit+1);
 input.tick(5000+TOUCH_SHOT_INTERVAL_MS,shoot);expect(shoot).toHaveBeenCalledTimes(SHOOT_RATE.limit+2);
});
it('clear cancels every held action and old pointers cannot resume them',()=>{
 const shoot=vi.fn(),look=vi.fn(),input=new TouchInput(look);input.start(1,'move',0,0);input.move(1,50,0);input.start(2,'fire',0,0);input.start(3,'jump',0,0);
 input.clear();input.move(1,10,0);input.move(2,10,0);input.tick(99999,shoot);
 expect(input.movement).toEqual({x:0,y:0,jump:false});expect(shoot).not.toHaveBeenCalled();expect(look).not.toHaveBeenCalled();expect(input.fingers.size).toBe(0);
});
