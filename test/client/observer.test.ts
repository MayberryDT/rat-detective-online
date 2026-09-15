import {expect,it,vi} from 'vitest';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer,playingRound} from '../../src/worker/gameState';
import {createWorldSpec} from '../../src/shared/worldSpec';
import {PROTOCOL_VERSION} from '../../src/shared/networkProtocol';
import {GameSession} from '../../src/session/GameSession';
const player=createPlayer('observer','Camera',{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},{x:0,y:2,z:0});
const welcome={type:'welcome',id:player.id,player,players:{},world:createWorldSpec(),round:playingRound(),protocolVersion:PROTOCOL_VERSION,serverTime:123};
it('accepts an explicit nonparticipant welcome, preserving ordinary validation',()=>{
 expect(parseServerMessage({...welcome,observing:true})).toMatchObject({observing:true,players:{}});
 expect(parseServerMessage(welcome)).toBeNull();
 expect(parseServerMessage({...welcome,observing:false})).toBeNull();
 expect(parseServerMessage({...welcome,observing:true,players:{observer:player}})).toBeNull();
 expect(parseServerMessage({...welcome,observing:true,resumeToken:crypto.randomUUID()})).toBeNull();
 expect(parseServerMessage({...welcome,players:{observer:player}})).toMatchObject({type:'welcome'});
});
it('does not start local shots, pickup anticipation or movement sends',()=>{
 const send=vi.fn(),shoot=vi.fn(),interaction=vi.fn();
 const session=Object.assign(Object.create(GameSession.prototype),{observing:true,transport:{state:'playing',send},gun:{shoot},chaos:{interaction}});
 session.shoot();session.sendMovement(1000);session.checkInteractions(1000);
 expect(send).not.toHaveBeenCalled();expect(shoot).not.toHaveBeenCalled();expect(interaction).not.toHaveBeenCalled();
});
