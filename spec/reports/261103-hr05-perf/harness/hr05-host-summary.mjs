import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const dir=resolve('.tmp/hr05-host',process.argv[2]??'baseline'),p=JSON.parse(readFileSync(dir+'/main.cpuprofile')),result=JSON.parse(readFileSync(dir+'/result.json')),lines=readFileSync(dir+'/api.mjs','utf8').split('\n'),nodes=new Map(p.nodes.map(n=>[n.id,n])),self=new Map(),parents=new Map(),inclusive=new Map();
for(const node of nodes.values())for(const child of node.children??[])parents.set(child,node.id);
for(let i=0;i<p.samples.length;i++){const id=p.samples[i],ms=p.timeDeltas[i]/1000;self.set(id,(self.get(id)??0)+ms);let at=id;while(at!==undefined){inclusive.set(at,(inclusive.get(at)??0)+ms);at=parents.get(at);}}
function location(frame){if(!frame.url.endsWith('api.mjs'))return {};let at=frame.lineNumber;while(at>=0&&!/^\/\/ (packages|apps|node_modules)\//.test(lines[at]))at--;return {source:lines[at],snippet:lines.slice(frame.lineNumber,frame.lineNumber+5).join('\n')};}
function row([id,ms]){const frame=nodes.get(id).callFrame;return {name:frame.functionName,line:frame.lineNumber,ms,...location(frame)};}
const sum=(xs,key)=>xs.reduce((s,x)=>s+(x[key]??0),0),stages={};
for(const own of [true,false]){const xs=result.spans.filter(x=>x.own===own);stages[own?'own':'other']={days:xs.length,...Object.fromEntries(['wallMs','cpuMs','projectionMs','publisherMs','cloneMs'].map(k=>[k,sum(xs,k)/xs.length]))};}
const summary={source:result.source,profileMs:(p.endTime-p.startTime)/1000,samples:p.samples.length,stages,self:[...self].sort((a,b)=>b[1]-a[1]).slice(0,25).map(row),inclusive:[...inclusive].sort((a,b)=>b[1]-a[1]).slice(0,35).map(row)};
writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
