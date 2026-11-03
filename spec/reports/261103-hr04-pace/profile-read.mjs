import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const file=process.argv[2];const profile=JSON.parse(readFileSync(file));
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();
for(const node of nodes.values())for(const child of node.children??[])parents.set(child,node.id);
const self=new Map(),inclusive=new Map();
for(let i=0;i<profile.samples.length;i++){
 const id=profile.samples[i],ms=profile.timeDeltas[i]/1000;self.set(id,(self.get(id)??0)+ms);
 let current=id;while(current!==undefined){inclusive.set(current,(inclusive.get(current)??0)+ms);current=parents.get(current);}
}
const total=(profile.endTime-profile.startTime)/1000;
function row([id,ms]){const node=nodes.get(id),frame=node.callFrame;let snippet;
 if(frame.url.includes('/assets/')){try{const text=readFileSync('.tmp/hr04-x20/apps/web/dist/assets/'+path.basename(new URL(frame.url).pathname),'utf8');const line=text.split('\n')[frame.lineNumber];snippet=line?.slice(frame.columnNumber,frame.columnNumber+450);}catch{}}
 return {id,name:frame.functionName,script:frame.url.split('/').at(-1),line:frame.lineNumber,column:frame.columnNumber,ms,pct:100*ms/total,snippet};}
const grouped=new Map();for(const [id,ms]of self){const f=nodes.get(id).callFrame;const key=JSON.stringify(f);if(!grouped.has(key))grouped.set(key,{frame:f,ms:0});grouped.get(key).ms+=ms;}const result={file,totalMs:total,samples:profile.samples.length,groupedSelf:[...grouped.values()].sort((a,b)=>b.ms-a.ms),self:[...self].sort((a,b)=>b[1]-a[1]).slice(0,30).map(row),inclusive:[...inclusive].sort((a,b)=>b[1]-a[1]).slice(0,45).map(row)};
writeFileSync(file+'.summary.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,self:result.self.slice(0,12),inclusive:result.inclusive.slice(0,16)},null,2));
