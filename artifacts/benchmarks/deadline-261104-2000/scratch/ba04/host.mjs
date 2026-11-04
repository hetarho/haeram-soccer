import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {vibeLoop,executeVibeUnit} from '/home/deep/.npm/_npx/26287f45a133efbe/node_modules/haeram-spec-creator/src/vibe-loop.mjs';
import {vibeCIWait,publicJobs} from '/home/deep/.npm/_npx/26287f45a133efbe/node_modules/haeram-spec-creator/src/vibe-ci.mjs';
import {jobHtml,parsed} from './ci-html.mjs';
const exec=promisify(execFile);
const control=path.dirname(fileURLToPath(import.meta.url));
const root='/home/deep/haeram/haeram-soccor-balance';
const cli='/home/deep/.npm/_npx/26287f45a133efbe/node_modules/haeram-spec-creator/bin/haeram-spec-creator.mjs';
const start=Date.now();
const window={started:new Date(start).toISOString(),implementationStop:new Date(start+7.5*3600000).toISOString(),hostStop:new Date(start+10*3600000).toISOString(),sourceBase:(await exec('git',['rev-parse','origin/main'],{cwd:root})).stdout.trim(),primaryCheckout:'Do not modify /home/deep/haeram/haeram-soccor'};
await writeFile(path.join(control,'window.json'),JSON.stringify(window,null,2)+'\n');
await writeFile(path.join(control,'adapter.json'),JSON.stringify({command:process.execPath,args:[path.join(control,'adapter.mjs')]})+'\n');
const log=(event)=>process.stdout.write(JSON.stringify({at:new Date().toISOString(),...event})+'\n');
let unit=0,current=null,lastProgress='',progressBusy=false;
const progress=setInterval(async()=>{
 if(progressBusy||!current)return;progressBusy=true;
 try{
  const {stdout}=await exec('git',['status','--short'],{cwd:root,maxBuffer:1024*1024});
  const signature=stdout.trim();
  if(signature!==lastProgress){lastProgress=signature;log({event:'unit_progress',unit,current,changedPaths:signature.split('\n').filter(Boolean).slice(0,12)});}
 }catch{}finally{progressBusy=false;}
},60000);
const names=new Map(),jobStates=new Map();
async function ci(options){
 log({event:'ci_start',commit:options.commit});
 const fetchCompatible=async(address,init)=>{
  const response=await fetch(address,init);
  const url=new URL(address);
  if(!response.ok||url.hostname!=='github.com'||!url.pathname.includes('/actions/runs/'))return response;
  const html=await response.text();
  for(const job of publicJobs(html,'hetarho/haeram-soccer'))names.set(job.url,job.name);
  const id=url.pathname.match(/\/job\/(\d+)$/)?.[1];
  const normalized=id?jobHtml(html,id):html;
  if(id){const result=parsed(normalized,url.href,names.get(url.href)??id);const state=JSON.stringify([result.status,result.conclusion]);if(jobStates.get(id)!==state){jobStates.set(id,state);log({event:'ci_job',...result});}}
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(normalized,{status:response.status,statusText:response.statusText,headers});
 };
 const result=await vibeCIWait({...options,timeoutMs:Math.min(options.timeoutMs??7200000,7200000)},{fetch:fetchCompatible});
 await writeFile(path.join(control,`ci-${options.commit}.json`),JSON.stringify(result,null,2)+'\n');log({event:'ci_end',...result});return result;
}
const options={targetRoot:root,tag:'ba04',provider:'claude',permissionMode:'acceptEdits',adapter:path.join(control,'adapter.json'),
 allowTool:['Bash(git *)',`Bash(${process.execPath} ${cli} *)`,'Bash(node *)','Bash(pnpm *)','Bash(python3 *)','Bash(rg *)','Bash(sed *)','Bash(cat *)','Bash(tail *)','Bash(head *)','Bash(wc *)','Bash(ls *)','Bash(mkdir *)','Bash(mv *)','Bash(cp *)','Bash(tar *)','Bash(date *)','Bash(sort *)'],
 probe:'git status --porcelain',probeTimeoutMs:120000,maxUnits:24,maxHours:10,batchSize:3,timeoutMs:10800000,verify:['pnpm run verify:batch'],env:{...process.env,TZ:'Asia/Seoul'}};
try{
 log({event:'loop_start',...window});
 const result=await vibeLoop(options,{execute:async(o,job,dir,limits)=>{
  unit++;current={selected:job.brief?.roots??null,doing:job.status.next?.[0]??null};lastProgress='';log({event:'unit_start',unit,...current});
  const receipt=await executeVibeUnit(o,job,dir,limits);
  log({event:'unit_end',unit,exitCode:receipt.exitCode,result:receipt.result,log:receipt.log});current=null;return receipt;
 },ci});
 await writeFile(path.join(control,'result.json'),JSON.stringify(result,null,2)+'\n');log({event:'loop_end',result});
 process.exitCode=result.ok?0:1;
}catch(error){log({event:'host_error',error:error.stack});process.exitCode=1;}finally{clearInterval(progress);}
