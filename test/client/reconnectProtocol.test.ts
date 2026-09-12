import {expect,it} from 'vitest';
import {parseClientMessage,parseServerMessage} from '../../src/shared/messageValidation';
import {PROTOCOL_VERSION} from '../../src/shared/networkProtocol';
import {createPlayer} from '../../src/worker/gameState';
const appearance={hatType:'fedora' as const,hatColor:1,furColor:2,coatColor:3};
const token='12345678-1234-4123-8123-123456789abc';
const player=createPlayer('one','Rat',appearance,{x:0,y:0,z:0});
const join={type:'join',protocolVersion:PROTOCOL_VERSION,name:'Rat',appearance};
const welcome={type:'welcome',protocolVersion:PROTOCOL_VERSION,id:player.id,player,players:{one:player},
    world:{seed:1,version:2},round:{phase:'playing'},serverTime:1000};
it('round-trips private resume credentials and rejects malformed or oversized values',()=>{
    expect(parseClientMessage(JSON.stringify({...join,resumeToken:token}))).toMatchObject({resumeToken:token});
    expect(parseServerMessage(JSON.stringify({...welcome,resumeToken:token}))).toMatchObject({resumeToken:token});
    for(const resumeToken of ['',null,4,{},'someone-elses-name','a'.repeat(1000)]){
        expect(parseClientMessage(JSON.stringify({...join,resumeToken}))).toBeNull();
        expect(parseServerMessage(JSON.stringify({...welcome,resumeToken}))).toBeNull();
    }
});
it('validates the explicit expired-resume response used to release an old reservation',()=>{
    expect(parseServerMessage(JSON.stringify({type:'error',message:'Expired',code:'resume-unavailable'})))
        .toEqual({type:'error',message:'Expired',code:'resume-unavailable'});
    expect(parseServerMessage(JSON.stringify({type:'error',message:'Expired',code:'unknown'}))).toBeNull();
});
