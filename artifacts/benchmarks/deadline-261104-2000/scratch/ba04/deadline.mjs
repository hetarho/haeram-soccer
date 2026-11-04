import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readdir,readFile,stat,lstat,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {vibeCheckpoint} from '/home/deep/.npm/_npx/26287f45a133efbe/node_modules/haeram-spec-creator/src/vibe.mjs';
const exec=promisify(execFile);
const root='/home/deep/haeram/haeram-soccor-balance';
const control=path.dirname(fileURLToPath(import.meta.url));
const tag='bd0420',branch='wip/bd0420';
const reportDir='spec/reports/261104-bd20';
const artifactDir='artifacts/benchmarks/deadline-261104-2000';
const planned=[{label:'safety-1955',at:Date.parse('2026-11-04T19:55:00+09:00')},{label:'deadline-2000',at:Date.parse('2026-11-04T20:00:00+09:00')}];
const receiptFile=path.join(control,'deadline-state.json');
const receipts=[];
const log=event=>process.stdout.write(JSON.stringify({at:new Date().toISOString(),...event})+'\n');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const git=async(args,options={})=>(await exec('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,timeout:120000,...options})).stdout.trim();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const ext=new Set(['.json','.mjs','.js','.ts','.tsx','.py','.md','.txt','.log','.patch','.diff','.csv','.yaml','.yml','.png','.zip']);
async function snapshot(label){
 log({event:'deadline_snapshot_start',label,branch});
 const started=new Date().toISOString();
 const raw=await vibeCheckpoint({targetRoot:root,tag,message:`${label}: owner deadline 2026-11-04 20:00 Asia/Seoul; unfinished work retained`});
 if(raw.pushError||raw.pushed===false)throw new Error(raw.pushError??'Raw WIP push did not succeed');
 const indexFile=path.join(control,`deadline-index-${Date.now()}`);
 const env={...process.env,GIT_INDEX_FILE:indexFile};
 const indexGit=(args,input)=>execFileSync('git',args,{cwd:root,env,input,encoding:'utf8',maxBuffer:16*1024*1024});
 indexGit(['read-tree',raw.commit]);
 const entries=[],files=[],omitted=[];
 let totalBytes=0;
 async function add(dest,bytes){
  const hash=indexGit(['hash-object','-w','--stdin'],bytes).trim();
  entries.push(`100644 ${hash}\t${dest}\0`);
 }
 async function include(source,dest){
  let bytes,info;
  try{info=await stat(source);bytes=await readFile(source);}catch(error){omitted.push({path:path.relative(root,source),reason:error.code??error.message});return;}
  const sourcePath=path.relative(root,source);
  const record={source:sourcePath,bytes:bytes.length,sha256:digest(bytes),modified:info.mtime.toISOString(),stored:[]};
  if(path.extname(source)==='.json'){try{JSON.parse(bytes.toString('utf8'));record.jsonComplete=true;}catch{record.jsonComplete=false;}}
  const packed=bytes.length>8*1024*1024?gzipSync(bytes,{level:6}):bytes;
  if(packed!==bytes){record.encoding='gzip';dest+='.gz';}
  else record.encoding='plain';
  if(packed.length>90*1024*1024){
   for(let offset=0,part=1;offset<packed.length;offset+=32*1024*1024,part++){
    const item=packed.subarray(offset,Math.min(packed.length,offset+32*1024*1024));
    const target=`${dest}.part${String(part).padStart(3,'0')}`;await add(target,item);record.stored.push({path:target,sha256:digest(item),bytes:item.length});
   }
  }else{await add(dest,packed);record.stored.push({path:dest,sha256:digest(packed),bytes:packed.length});}
  totalBytes+=bytes.length;files.push(record);
 }
 async function walk(directory,prefix){
  for(const item of await readdir(directory,{withFileTypes:true}).catch(()=>[])){
   const source=path.join(directory,item.name),relative=path.relative(root,source);
   if(item.isSymbolicLink()){omitted.push({path:relative,reason:'symlink; external target not copied'});continue;}
   if(item.isDirectory()){
    if(/^(?:node_modules|dist|\.git|worlds(?:[-_].*)?|.*cache.*|.*browser.*profile.*)$/i.test(item.name)){omitted.push({path:relative,reason:'reproducible world/build/tool cache'});continue;}
    if(await lstat(path.join(source,'.git')).then(()=>true).catch(()=>false)){
     const head=await git(['-C',source,'rev-parse','HEAD']);
     const patch=await git(['-C',source,'diff','--binary','HEAD']);
     await add(`${prefix}/${item.name}/source-head.txt`,Buffer.from(head+'\n'));
     if(patch)await add(`${prefix}/${item.name}/working.patch`,Buffer.from(patch+'\n'));
     omitted.push({path:relative,reason:'nested checkout preserved by Git HEAD and tracked patch; generated tree not duplicated'});continue;
    }
    await walk(source,`${prefix}/${item.name}`);continue;
   }
   if(!item.isFile()||!ext.has(path.extname(item.name)))continue;
   if(/\.haeram-save(?:\.json)?$|(?:^|[._-])(?:credentials?|secrets?|token|auth|env)(?:[._-]|$)/i.test(item.name)){omitted.push({path:relative,reason:'private input/credential file excluded'});continue;}
   if(source===path.join(control,'result.json')){
    const window=JSON.parse(await readFile(path.join(control,'window.json'),'utf8'));
    if((await stat(source)).mtimeMs<Date.parse(window.started)){omitted.push({path:relative,reason:'stale preflight result from before active loop'});continue;}
   }
   await include(source,`${prefix}/${item.name}`);
  }
 }
 await walk(path.join(root,'.tmp'),`${artifactDir}/scratch`);
 await walk(path.join(root,'test-results'),`${artifactDir}/test-results`);
 let loop=null;
 try{
  const input=JSON.parse(await readFile('/home/deep/haeram/haeram-soccor/.git/haeram/v1/loops/ba04/loop.json','utf8'));
  loop={tag:input.tag,startedAt:input.startedAt,units:input.units,running:input.running,reason:input.reason,error:input.error,report:input.report,priorityTask:input.priorityTask,recovery:input.recovery,dispatches:(input.dispatches??[]).map(({unit,head,at,exitCode,result,stopped,log})=>({unit,head,at,exitCode,result,stopped,log})),batches:input.batches};
  await add(`${reportDir}/loop.json`,Buffer.from(JSON.stringify(loop,null,2)+'\n'));
 }catch(error){omitted.push({path:'runtime loop.json',reason:error.message});}
 const sourceHead=await git(['rev-parse','HEAD']);
 const manifest={schemaVersion:1,label,deadline:'2026-11-04T20:00:00+09:00',capturedAt:started,rawSnapshot:raw.commit,sourceHead,sourceBranch:await git(['branch','--show-current']),files,totalBytes,omitted,note:'WIP preservation, not release verification. Source/STATE/tasks come from the raw worktree snapshot. Scratch measurement results and private automation handoff are included; reproducible caches and private save/credential inputs are not. jsonComplete describes parsing only, not a passed simulation or accepted candidate.'};
 await add(`${artifactDir}/manifest.json`,Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
 const report=`# REPORT 261104-bd20\n> mode:autopilot | host:hq-dev1-pve2-vm2 | from:${started} | to:${new Date().toISOString()} | push:${branch}\n\n## done\n- Preserved the isolated football-balance worktree at the owner's 20:00 Asia/Seoul deadline (${label}), including unfinished source, current task/document state and ${files.length} scratch/result files (${totalBytes} original bytes).\n- Source branch: codex/football-balance; raw WIP snapshot: ${raw.commit}; source HEAD when archived: ${sourceHead}. The primary main checkout was not changed.\n\n## decided\n- The deadline requires remote preservation of incomplete work and does not waive the existing realism or release gates. Work may continue after the checkpoint.\n\n## parked\n- Current unfinished and rejected experiments remain labelled in their task results. No unrun test or unaccepted candidate is declared successful by this snapshot.\n\n## checks\n- The archive manifest lists original paths, sizes, hashes, stored representations and parsing completeness. Large scratch records are stored losslessly as gzip; numbered parts, if any, concatenate before decompression.\n- Reproducible world/build caches and private save/credential inputs are excluded and listed in the manifest. The sanitized loop receipt captures completed unit outcomes.\n\n## next\n- Resume the current task queue and required coordinator corrections. Use final verification/CI evidence on the actual source commit before a main publication.\n- Preservation data: artifacts/benchmarks/deadline-261104-2000/manifest.json.\n`;
 await add('spec/reports/261104-bd20.md',Buffer.from(report));
 indexGit(['update-index','-z','--index-info'],entries.join(''));
 const tree=indexGit(['write-tree']).trim();
 const commit=indexGit(['commit-tree',tree,'-p',raw.commit,'-m',`checkpoint ${tag}: ${label} include measurement and handoff evidence`]).trim();
 await git(['update-ref',`refs/heads/${branch}`,commit,raw.commit]);
 await git(['push','--quiet','origin',`${commit}:refs/heads/${branch}`]);
 const remote=(await git(['ls-remote','origin',`refs/heads/${branch}`])).split(/\s/)[0];
 if(remote!==commit)throw new Error('Remote deadline WIP SHA did not match the archive commit');
 const receipt={label,branch,commit,remoteConfirmed:true,rawSnapshot:raw.commit,files:files.length,totalBytes,capturedAt:started,pushedAt:new Date().toISOString(),loopRunning:loop?.running,completedUnits:loop?.units};
 receipts.push(receipt);await writeFile(receiptFile,JSON.stringify({deadline:'2026-11-04T20:00:00+09:00',branch,receipts},null,2)+'\n');
 log({event:'deadline_snapshot_pushed',...receipt});return receipt;
}
async function preserve(label){
 for(let attempt=1;attempt<=3;attempt++){
  try{return await snapshot(label);}catch(error){log({event:'deadline_snapshot_error',label,attempt,error:error.message});if(attempt===3){receipts.push({label,error:error.message,at:new Date().toISOString()});await writeFile(receiptFile,JSON.stringify({deadline:'2026-11-04T20:00:00+09:00',branch,receipts},null,2)+'\n');return null;}await sleep(15000);}
 }
}
log({event:'deadline_job_armed',deadline:'2026-11-04T20:00:00+09:00',branch,planned:planned.map(p=>({label:p.label,at:new Date(p.at).toISOString()}))});
await preserve('initial-preservation');
for(const item of planned){while(Date.now()<item.at)await sleep(Math.min(60000,item.at-Date.now()));await preserve(item.label);}
log({event:'deadline_job_complete',branch,receipts});
process.exitCode=receipts.some(r=>r.label==='deadline-2000'&&r.remoteConfirmed)?0:1;
