import {mkdirSync,writeFileSync} from 'node:fs';
export function writeBotExperimentReport(kind,data){
 if(!['controlled','physics'].includes(kind))throw Error('Unknown experiment report');
 const out=new URL('../../output/bot-experiments-2026-09-14/',import.meta.url);
 mkdirSync(out,{recursive:true});
 writeFileSync(new URL(`${kind}.json`,out),JSON.stringify({recordedAt:new Date().toISOString(),data},null,2));
}
