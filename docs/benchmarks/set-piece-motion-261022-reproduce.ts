import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createWorld } from '../../packages/engine/src/index.ts';
import { playGrid } from '../../packages/engine/src/grid/engine.ts';
import { buildGridSetup } from '../../packages/engine/src/grid/setup.ts';
import { buildFrames } from '../../packages/engine/src/grid/playback.ts';
import { MATCH_MODEL_REVISION } from '../../packages/contracts/src/match-model.ts';
import type { TraceEntry } from '../../packages/engine/src/grid/trace.ts';
import type { Tactic } from '../../packages/contracts/src/types.ts';

const w = createWorld({country:'ENG',name:'Set Piece Measurement',color:'#2a5d8f',seed:'set-piece-measure-261022',level:'normal'});
const clubs = w.clubs.filter(c=>c.country==='ENG' && c.tier===0 && c.id!==w.playerClub);
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function points(e:TraceEntry,side:number) {
 return Array.from({length:10},(_,i)=>i+1).filter(slot=>e.slots[side*11+slot]>=0).map(slot=>({idx:e.slots[side*11+slot],xy:[e.positions[(side*11+slot)*2],e.positions[(side*11+slot)*2+1]]}));
}
function dense(ps:{idx:number,xy:number[]}[],radius:number) {return Math.max(0,...ps.map(a=>ps.filter(b=>distance(a.xy,b.xy)<=radius).length));}
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const rows:any[]=[]; const examples:any[]=[]; const runs:any[]=[];
const tactics:Tactic[]=['balanced','possession','press','counter'];
for(const candidate of [false,true]) for(let n=0;n<4;n++) {
 const f={...w.fixtures[0]!,id:`set-piece-probe-${n}`,home:clubs[0].id,away:clubs[1].id};
 const setup=buildGridSetup(w,f,{observe:true,recordPlayers:true,tactics:[tactics[n],tactics[(n+1)%4]],...(candidate?{model:MATCH_MODEL_REVISION}:{})});
 const result=playGrid(setup); const frames=buildFrames(result,setup,w.seed); const trace=result.trace!;
 let corners=0;
 for(let i=1;i<trace.length;i++) {
  const e=trace[i]; if(e.action!=='corner')continue;
  const before=trace[i-1]; if(before.period!==e.period)continue;
  corners++;
  const each=[0,1].map(side=>{
   const a=points(before,side), b=points(e,side); const moves=b.map(p=>distance(p.xy,a.find(q=>q.idx===p.idx)?.xy??p.xy));
   return {side,role:side===e.side?'attacking':'defending',movedOver1m:moves.filter(x=>x>1).length,meanMove:mean(moves),maxMove:Math.max(...moves),cluster5:dense(b,5),cluster10:dense(b,10),beforeCluster10:dense(a,10),restartJobsAfter:e.intentions?.slice(side*11,side*11+11).filter(x=>x?.kind==='restart'&&!('end'in x)).length??null};
  });
  rows.push({candidate,match:f.id,tactics:setup.tactics,traceIndex:i,elapsed:e.elapsed,period:e.period,attackingSide:e.side,spot:e.spot,dead:e.dead,kind:e.kind,each});
  if(examples.filter(x=>x.candidate===candidate).length<4 || each.some(x=>x.cluster5>=7)) {
   const start=before.elapsed-5, end=e.elapsed+10;
   const samples=frames.filter(fr=>fr.period===e.period).flatMap(fr=>(fr.motion??[]).filter(m=>m.elapsedSeconds>=start&&m.elapsedSeconds<=end).map(m=>({time:m.elapsedSeconds,ball:m.ball,phase:m.phase,ownerId:m.ownerId,players:m.players})));
   examples.push({candidate,match:f.id,traceIndex:i,period:e.period,attackingSide:e.side,before:before.elapsed,after:e.elapsed,knots:e.knots,snapshots:[before,e,...trace.slice(i+1,i+4)].map(t=>({elapsed:t.elapsed,action:t.action,side:t.side,ball:t.ball,sides:[points(t,0),points(t,1)],intentions:t.intentions})),samples});
  }
 }
 const samples=frames.flatMap(f=>f.motion??[]); const held=samples.filter(s=>s.ownerId); const mapped=held.filter(s=>s.players.some(ps=>ps.some(p=>p.id===s.ownerId)));
 runs.push({candidate,match:f.id,tactics:setup.tactics,corners,samples:samples.length,ownerSamples:held.length,ownerMapped:mapped.length,score:result.record.score});
 process.stdout.write(JSON.stringify(runs.at(-1))+'\n');
}
const summary=[false,true].flatMap(candidate=>['attacking','defending'].map(role=>{
 const xs=rows.filter(r=>r.candidate===candidate).flatMap(r=>r.each.filter((s:any)=>s.role===role));
 return {candidate,role,corners:xs.length,meanMovedOver1m:mean(xs.map(x=>x.movedOver1m)),allStationary:xs.filter(x=>x.movedOver1m===0).length,meanMove:mean(xs.map(x=>x.meanMove)),maxMove:Math.max(...xs.map(x=>x.maxMove)),maxCluster5:Math.max(...xs.map(x=>x.cluster5)),maxCluster10:Math.max(...xs.map(x=>x.cluster10)),meanCluster10:mean(xs.map(x=>x.cluster10)),cluster5AtLeast7:xs.filter(x=>x.cluster5>=7).length,restartJobsAfterMean:mean(xs.map(x=>x.restartJobsAfter??0))};
}));
examples.splice(0, examples.length, ...[false, true].map(candidate => examples.find(x => x.candidate === candidate)!));
const out={date:'2026-10-22',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),worldSeed:w.seed,clubs:clubs.slice(0,2).map(c=>({id:c.id,name:c.name})),method:'Trace positions in metres; outfield slots 1..10; a cluster counts teammates within radius of a player; before is preceding trace entry, after is corner completion; includes preparation and delivery, not a per-second movement rate.',runs,summary,rows,examples};
writeFileSync(process.argv[2] ?? '/tmp/haeram-set-piece-motion.json',JSON.stringify(out,null,2));
process.stdout.write(JSON.stringify(summary,null,2)+'\n');
