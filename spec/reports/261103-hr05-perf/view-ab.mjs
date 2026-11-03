import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadavg, hostname, cpus } from 'node:os';
import { median, verdict } from '../scripts/perf/stats.ts';

const sha=s=>createHash('sha256').update(s).digest('hex');
function frames(){
 let current={world:{id:'prepared-view-capacity',revision:0,calendar:{day:0},players:Array.from({length:1800},(_,i)=>({id:'player:'+i,name:'Player '+i,age:24,position:i%11,ability:60,potential:80,pace:60,shooting:60,passing:60,tackling:60,stamina:60,wage:'1000',contract:2,goals:0,assists:0,appearances:0,fitness:0,detail:{club:'club:'+Math.floor(i/24),history:Array.from({length:12},(_,y)=>({year:2020+y,apps:30,goals:i%8}))}})),tables:{club:{points:20}},history:Array.from({length:84},(_,i)=>({year:1950+i,rank:i%20}))}};
 const values=[current];
 for(let day=1;day<=14;day++){current={...current,world:{...current.world,revision:day,calendar:{day},players:current.world.players.map(p=>({...p,fitness:day%3}))}};values.push(current);}
 return values;
}
if(process.argv[2]==='--child'){
 const [aFile,bFile,indexRaw]=process.argv.slice(3),index=Number(indexRaw),a=await import(pathToFileURL(aFile)),b=await import(pathToFileURL(bFile)),input=frames();
 const state=view=>({view,busy:false,processing:false,activity:'idle',readonly:false,savedRevision:view.world.revision,progress:0});
 function exercise(mod){const store=mod.createGameStore(state(input[0]));for(const frame of input.slice(1)){const s=state(frame);store.publish(s,{viewShared:true});store.publish({...s,processing:true},{viewShared:true});store.publish({...s,savedRevision:s.savedRevision-1},{viewShared:true});store.publish(s,{viewShared:true});}return store.getSnapshot();}
 const cpu=()=>{const x=process.threadCpuUsage();return (x.user+x.system)/1000;};
 function batch(mod,count){let result;for(let i=0;i<count;i++)result=exercise(mod);return result;}function calibrate(mod){let count=1;while(count<65536){const begin=cpu();batch(mod,count);if(cpu()-begin>=50)return count;count*=2;}return count;}const counts={a:calibrate(a),b:calibrate(b)};function timed(mod,count){const c=cpu(),t=performance.now(),result=batch(mod,count);const batchCpuMs=cpu()-c,wall=performance.now()-t;if(batchCpuMs<5)throw Error('CPU sample below resolution floor');return {cpu:batchCpuMs/count,wall:wall/count,count,batchCpuMs,hash:sha(JSON.stringify(result))};}
 for(let n=0;n<3;n++){exercise(a);exercise(b);}
 const pairs=[];for(let n=0;n<16;n++){let x,y;if((n+index)%2){y=timed(b,counts.b);x=timed(a,counts.a);}else{x=timed(a,counts.a);y=timed(b,counts.b);}if(x.hash!==y.hash)throw Error('publication outputs differ');pairs.push({a:x,b:y});}
 console.log(JSON.stringify({index,counts,pairs}));
}else{
 const dir=resolve('.tmp/hr05-view-perf');mkdirSync(dir,{recursive:true});const baseRef='f447d8788970edaf9b130874ecac433d0ad1ad09';
 const source='apps/web/src/runtime/store.ts',base=execFileSync('git',['show',baseRef+':'+source],{encoding:'utf8'}),candidate=process.argv.includes('--same')?base:readFileSync(source,'utf8');
 const out=process.argv.includes('--same')?'aa-batched':'ab-batched';const bundle={};
 for(const [side,contents]of [['base',base],['candidate',candidate]]){const file=resolve(dir,side+'-'+out+'.mjs');await build({stdin:{contents,sourcefile:'store.ts',resolveDir:resolve('apps/web/src/runtime'),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:file,logLevel:'error'});bundle[side]={file,hash:sha(readFileSync(file))};}
 const before=loadavg(),runs=[];for(let index=0;index<8;index++){const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--child',bundle.base.file,bundle.candidate.file,String(index)],{encoding:'utf8',maxBuffer:1<<22});if(r.status!==0)throw Error(r.stderr);runs.push(JSON.parse(r.stdout.trim().split('\n').at(-1)));}
 const measure=key=>verdict(runs.map(run=>median(run.pairs.map(p=>Math.log(p.b[key]/p.a[key])))));
 const result={runnerHash:sha(readFileSync(new URL(import.meta.url))),sourceHashes:{base:sha(base),candidate:sha(candidate)},source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseRef,kind:'prepared-store-publication-only; adaptive batches normalize equal work above CPU clock resolution',fixture:{players:1800,retainedYearsPerPlayer:12,seasons:84,days:14,publicationsPerDay:4},processes:8,warm:3,reps:16,node:process.version,host:hostname(),cpu:cpus()[0].model,loadBefore:before,loadAfter:loadavg(),bundles:bundle,cpu:measure('cpu'),wall:measure('wall'),outputHashes:[...new Set(runs.flatMap(r=>r.pairs.flatMap(p=>[p.a.hash,p.b.hash])))],runs};
 writeFileSync(resolve(dir,out+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,runs:undefined}));
}
