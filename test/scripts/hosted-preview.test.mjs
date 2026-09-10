import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once,EventEmitter} from 'node:events';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import WebSocket,{WebSocketServer} from 'ws';
import {createHostedPreview} from '../../scripts/hosted-preview.mjs';

async function files(t){
  const directory=await mkdtemp(join(tmpdir(),'rat-hosted-relay-')),dist=join(directory,'dist');
  await mkdir(dist);await writeFile(join(dist,'index.html'),'<p>Local rat build</p>');
  await writeFile(join(directory,'private.txt'),'outside static root');await symlink(join(directory,'private.txt'),join(dist,'escape.txt'));
  t.after(()=>rm(directory,{recursive:true,force:true}));return dist;
}
async function open(address,path='/ws?room=graybox-practice-relay&receive=welcome-only'){
  const socket=new WebSocket(address.replace('http:','ws:')+path,{origin:address});
  await once(socket,'open');return socket;
}
test('serves the local build, forwards authenticated play, captures diagnostics and shuts down cleanly',{timeout:5000},async t=>{
  const dist=await files(t),upstream=new WebSocketServer({host:'127.0.0.1',port:0});await once(upstream,'listening');
  t.after(()=>new Promise(resolve=>upstream.close(resolve)));
  const reports=[],received=[];let request;
  upstream.on('connection',(socket,req)=>{request=req;socket.on('message',data=>{received.push(JSON.parse(data));socket.send(data,{binary:false});});});
  const preview=createHostedPreview({distDir:dist,upstreamOrigin:'https://private-worker.invalid',token:'test-private-token',
    onDiagnostic:report=>reports.push(report),createUpstream:(url,options)=>{
      const local=new URL(url);local.protocol='ws:';local.hostname='127.0.0.1';local.port=String(upstream.address().port);
      return new WebSocket(local,options);
    }});
  t.after(()=>preview.close());const address=await preview.listen(0);
  assert.match(await(await fetch(address)).text(),/Local rat build/);
  assert.equal((await fetch(address+'/escape.txt')).status,404);
  assert.equal((await fetch(address+'/%2e%2e%2fprivate.txt')).status,404);
  assert.equal((await(await fetch(address+'/health')).json()).mode,'private-hosted-relay');
  const client=await open(address);
  let reply=once(client,'message');client.send(JSON.stringify({type:'join',name:'Rat'}));await reply;
  assert.equal(request.headers.authorization,'Bearer test-private-token');
  assert.equal(request.url,'/ws?room=graybox-practice-relay&receive=welcome-only');
  client.send(JSON.stringify({type:'diagnostics',report:{frameP95Ms:33,token:'must never appear',details:{network:{bufferedAmount:4,secret:'no'}}}}));
  client.send(JSON.stringify({type:'diagnostics',report:{frameP95Ms:44}}));
  reply=once(client,'message');client.send(JSON.stringify({type:'ping',nonce:1}));await reply;
  assert.equal(reports.length,1);assert.equal(reports[0].frameP95Ms,33);assert.equal(reports[0].details.network.bufferedAmount,4);
  assert.equal(JSON.stringify(reports).includes('must never appear'),false);assert.equal(JSON.stringify(reports).includes('secret'),false);
  assert.deepEqual(received.map(message=>message.type),['join','ping']);
  const closed=once(client,'close');await preview.close();assert.equal((await closed)[0],1001);
});
test('requires exact local Origin before opening an upstream connection',{timeout:5000},async t=>{
  const dist=await files(t);let attempts=0;
  const preview=createHostedPreview({distDir:dist,upstreamOrigin:'https://private-worker.invalid',token:'test-private-token',
    createUpstream:()=>{attempts++;throw new Error('Must not connect');}});
  t.after(()=>preview.close());const address=await preview.listen(0);
  for(const origin of ['https://another-site.invalid',undefined]){
    const socket=new WebSocket(address.replace('http:','ws:')+'/ws',origin?{origin}:{});
    socket.on('error',()=>{});
    const status=await new Promise(resolve=>socket.on('unexpected-response',(request,response)=>{resolve(response.statusCode);request.destroy();}));
    assert.equal(status,403);
  }
  assert.equal(attempts,0);
  assert.throws(()=>createHostedPreview({distDir:dist,upstreamOrigin:'http://not-https.invalid',token:'test'}),/HTTPS/);
});
test('bounds messages queued while upstream is connecting',{timeout:5000},async t=>{
  class Pending extends EventEmitter {
    readyState=WebSocket.CONNECTING;bufferedAmount=0;terminated=false;
    terminate(){this.terminated=true;this.readyState=WebSocket.CLOSED;this.emit('close');}
    close(){this.terminate();}
  }
  const dist=await files(t),pending=new Pending();
  const preview=createHostedPreview({distDir:dist,upstreamOrigin:'https://private-worker.invalid',token:'test-private-token',createUpstream:()=>pending});
  t.after(()=>preview.close());const address=await preview.listen(0),client=await open(address),closed=once(client,'close');
  for(let i=0;i<33;i++)client.send(JSON.stringify({type:'ping',nonce:i}));
  assert.equal((await closed)[0],1013);assert.equal(pending.terminated,true);
});

test('private HTTPS preview accepts only the configured phone origin and stays loopback-bound',{timeout:5000},async t=>{
  const dist=await files(t),upstream=new WebSocketServer({host:'127.0.0.1',port:0});await once(upstream,'listening');
  t.after(()=>new Promise(resolve=>upstream.close(resolve)));
  upstream.on('connection',socket=>socket.on('message',data=>socket.send(data,{binary:false})));
  const browserOrigin='https://phone.tail-example.ts.net:8443';let attempts=0;
  const preview=createHostedPreview({distDir:dist,upstreamOrigin:'https://private-worker.invalid',token:'test-token',browserOrigin,
    createUpstream:(url,options)=>{attempts++;const local=new URL(url);local.protocol='ws:';local.hostname='127.0.0.1';local.port=String(upstream.address().port);return new WebSocket(local,options);}});
  t.after(()=>preview.close());const address=await preview.listen(0);assert.equal(preview.server.address().address,'127.0.0.1');
  for(const host of [new URL(browserOrigin).host,new URL(address).host]){
    const socket=new WebSocket(address.replace('http:','ws:')+'/ws',{origin:browserOrigin,headers:{Host:host}});
    await once(socket,'open');const reply=once(socket,'message');socket.send('phone');assert.equal(String((await reply)[0]),'phone');socket.close();await once(socket,'close');
  }
  const validAttempts=attempts;
  for(const [host,origin] of [[new URL(browserOrigin).host,'https://another-site.invalid'],['evil.invalid',browserOrigin],[new URL(browserOrigin).host,'http://phone.tail-example.ts.net:8443'],[new URL(browserOrigin).host,undefined]]){
    const socket=new WebSocket(address.replace('http:','ws:')+'/ws',{headers:{Host:host},...(origin?{origin}:{})});socket.on('error',()=>{});
    const status=await new Promise(resolve=>socket.on('unexpected-response',(request,response)=>{resolve(response.statusCode);request.destroy();}));assert.equal(status,403);
  }
  assert.equal(attempts,validAttempts);
  for(const invalid of ['http://phone.invalid','https://phone.invalid/path','https://user:pass@phone.invalid','https://phone.invalid/?token=x'])
    assert.throws(()=>createHostedPreview({distDir:dist,upstreamOrigin:'https://private-worker.invalid',token:'test',browserOrigin:invalid}),/HTTPS origin/);
});

test('LAN preview requires explicit matching private interfaces and refuses public or wildcard binds',async t=>{
 const dist=await files(t),base={distDir:dist,upstreamOrigin:'https://private-worker.invalid',token:'test-token'};
 for(const listenAddress of ['0.0.0.0','8.8.8.8','::','10.300.1.2'])assert.throws(()=>createHostedPreview({...base,listenAddress}),/private IPv4/);
 for(const browserOrigin of [undefined,'http://10.2.3.5:5191'])assert.throws(()=>createHostedPreview({...base,listenAddress:'10.2.3.4',browserOrigin}),/matching explicit/);
 const preview=createHostedPreview({...base,listenAddress:'127.0.0.2',browserOrigin:'http://127.0.0.2:5191'});t.after(()=>preview.close());const address=await preview.listen(0);
 assert.equal(preview.server.address().address,'127.0.0.2');
 assert.match(await(await fetch(address,{headers:{Host:'127.0.0.2:5191'}})).text(),/Local rat build/);
});
