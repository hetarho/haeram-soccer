import {writeFileSync} from 'node:fs';
import {createWorld} from '../../packages/engine/src/index.ts';
import {buildGridSetup} from '../../packages/engine/src/grid/setup.ts';
import {createState} from '../../packages/engine/src/grid/state.ts';
import {setPieceTargets,moveAll} from '../../packages/engine/src/grid/shape.ts';
import {placeAtOnce} from '../../packages/engine/src/grid/restarts.ts';
const w=createWorld({country:'ENG',name:'Set Piece Stages',color:'#2a5d8f',seed:'set-piece-measure-261022',level:'normal'});
const cs=w.clubs.filter(c=>c.country==='ENG'&&c.tier===0&&c.id!==w.playerClub);
const setup=buildGridSetup(w,{...w.fixtures[0]!,id:'set-piece-stages',home:cs[0].id,away:cs[1].id},{observe:true,recordPlayers:true,tactics:['balanced','possession']});
const s=createState(setup); s.elapsed=600; s.t=600; s.ball=[105,15]; s.possession=0; s.owner=undefined;
const scene=setPieceTargets(s,0,4); const rs={kind:'corner' as const,side:0 as const,spot:[105,0.5] as [number,number],dead:32};
function snapshot(stage:string){return {stage,sides:s.players.map(ps=>ps.filter(p=>p.slot>0&&p.slot<11).map(p=>({idx:p.idx,pos:[...p.pos],run:p.run??null})))}};
const stages=[snapshot('before')]; placeAtOnce(s,rs,4,scene); stages.push(snapshot('placed')); moveAll(s,8); stages.push(snapshot('after-moveAll-8'));
const out={seed:w.seed,tactics:setup.tactics,attackingSide:0,scene:{attackers:scene.up.length,markers:scene.marks.length},stages};
writeFileSync(process.argv[2] ?? '/tmp/haeram-set-piece-stages.json',JSON.stringify(out,null,2));
for (const st of stages){console.log(st.stage,st.sides.map(ps=>({runJobs:ps.filter(p=>p.run).length,cluster10:Math.max(...ps.map(p=>ps.filter(q=>Math.hypot(p.pos[0]-q.pos[0],p.pos[1]-q.pos[1])<=10).length))})));}
process.exit(0);
