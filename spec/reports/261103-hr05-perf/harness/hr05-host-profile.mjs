import { build } from 'esbuild';
import { Worker,isMainThread,parentPort,workerData } from 'node:worker_threads';
import { Session } from 'node:inspector/promises';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
const sha=s=>createHash('sha256').update(s).digest('hex');
if(!isMainThread){
 const api=await import(pathToFileURL(workerData.bundle));const answer=api.createFixtureHelper();parentPort.on('message',job=>parentPort.postMessage(answer(job)));parentPort.postMessage({ready:true});
}else{
 const label=process.argv[2]??'baseline',dir=resolve('.tmp/hr05-host/'+label);mkdirSync(dir,{recursive:true});const bundle=resolve(dir,'api.mjs');
 await build({entryPoints:['.tmp/hr05-host-api.ts'],bundle:true,platform:'node',format:'esm',outfile:bundle,logLevel:'error',banner:{js:"import{createRequire}from'module';const require=createRequire(import.meta.url);"}});
 const api=await import(pathToFileURL(bundle));const raw=readFileSync('.tmp/hr04-fixtures/late.json','utf8'),world=(await api.decode(raw)).world,host=new api.Host();host.world=world;
 const workers=[],ports=await Promise.all(Array.from({length:2},()=>new Promise((resolve,reject)=>{const worker=new Worker(new URL(import.meta.url),{workerData:{bundle}});workers.push(worker);const port={onmessage:null,postMessage:job=>worker.postMessage(job)};worker.once('error',reject);worker.once('message',()=>{worker.off('error',reject);worker.on('message',data=>port.onmessage?.({data}));resolve(port);});})));
 host.helpers=new api.HelperPool(ports);let serial=0,seq=host.publish().viewSeq,spans=[],current;
 const timed=(name,fn)=>{const t=performance.now();const result=fn();if(current)current[name]=(current[name]??0)+performance.now()-t;return result;};
 const view=host.view.bind(host),publish=host.views.publish.bind(host.views);host.view=(...args)=>timed('projectionMs',()=>view(...args));host.views.publish=(...args)=>timed('publisherMs',()=>publish(...args));
 async function day(record){const before=host.world.ownMatches.length,rev=host.world.revision;current=record?{}:undefined;const begin=performance.now(),c=process.threadCpuUsage();const reply=await host.handle({protocol:1,session:'hr05-profile',requestId:'profile:'+serial++,expectedRevision:rev,generation:1,parentGeneration:0,viewBase:seq,body:{type:'command',command:{type:'advance-days',days:1,stop:[]}}});if(!reply.ok)throw Error(reply.error);timed('cloneMs',()=>structuredClone(api.forPosting(reply)));seq=reply.viewSeq;if(host.world.revision===rev)throw Error('day did not advance');if(host.world.critical||host.world.bankrupt)throw Error('intentional stop');if(!host.helpers.active)throw Error('helper fallback');if(current){const end=process.threadCpuUsage();spans.push({...current,wallMs:performance.now()-begin,cpuMs:(end.user-c.user+end.system-c.system)/1000,own:host.world.ownMatches.length>before,year:host.world.year,day:host.world.calendar.day});}current=undefined;}
 const inspector=new Session();inspector.connect();try{
 for(let i=0;i<14;i++)await day(false);
 const loadBefore=os.loadavg();await inspector.post('Profiler.enable');await inspector.post('Profiler.setSamplingInterval',{interval:1000});await inspector.post('Profiler.start');
 for(let i=0;i<60;i++)await day(true);
 const {profile}=await inspector.post('Profiler.stop');writeFileSync(resolve(dir,'main.cpuprofile'),JSON.stringify(profile));
 const projected=host.view(),{world:w,...rest}=projected,parts=[...Object.entries(rest).map(([key,v])=>({key,chars:JSON.stringify(v)?.length??0})),...Object.entries(w).map(([key,v])=>({key:'world.'+key,chars:JSON.stringify(v)?.length??0}))].sort((a,b)=>b.chars-a.chars);
 const facts={...host.world};delete facts.receiptIds;
 const result={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),bundleHash:sha(readFileSync(bundle)),fixtureHash:sha(raw),host:os.hostname(),cpu:os.cpus()[0].model,node:process.version,scope:'retained Host with two real helpers; no codec/autosave; clone cost explicit; main Host thread profile excludes helper CPU',warmDays:14,days:60,loadBefore,loadAfter:os.loadavg(),factsHash:sha(api.canonical(facts)),spans,parts};writeFileSync(resolve(dir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,spans:undefined,parts:parts.slice(0,10)}));
 }finally{inspector.disconnect();await Promise.all(workers.map(worker=>worker.terminate()));}
}
