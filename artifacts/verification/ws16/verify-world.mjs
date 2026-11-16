import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root=process.argv[2];
assert(root);
const load=(file)=>import(pathToFileURL(root+'/'+file).href);
const { historyWorld, liveHistory }=await load('packages/engine/src/history.ts');
const { takeOver }=await load('packages/engine/src/takeover.ts');
const { validateWorld, canonical }=await load('packages/contracts/src/index.ts');
const { checkpoint, decode }=await load('apps/web/src/adapters/persistence.ts');
const at=Date.now();
const seed='save-overlap-diagnosis';
const rows=[];
const number=(date)=>date.year*366+date.day;
const coach=(role)=>!['player','manager','director','scout'].includes(role);
function checkOverlaps(world) {
  const today={year:world.year,day:world.calendar?.day ?? world.round*7};
  let count=0;
  for(const person of Object.values(world.people ?? {}))
    for(let a=0;a<person.employment.length;a++)
      for(let b=a+1;b<person.employment.length;b++) {
        const left=person.employment[a], right=person.employment[b];
        const overlap=Math.max(number(left.from),number(right.from)) < Math.min(number(left.to ?? today),number(right.to ?? today));
        const legal=left.club===right.club && ((left.role==='player' && coach(right.role)) || (right.role==='player' && coach(left.role)));
        if(overlap && !legal) count++;
      }
  return count;
}
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const world=historyWorld(seed);
liveHistory(world,1946,(year,current)=>{
  const row={year,overlaps:checkOverlaps(current),ms:Date.now()-at};
  rows.push(row);
  console.log(JSON.stringify(row));
  assert.equal(row.overlaps,0);
});
takeOver(world,'ENG:3:0:0',{tier:'oil',traits:[],decade:1940,seed});
const expected=canonical(validateWorld(world));
const saved=await checkpoint(world);
const decoded=await decode(saved.raw);
assert.equal(canonical(decoded.world),expected);
assert.equal(checkOverlaps(decoded.world),0);
const report={head,seed,engine:world.engine,year:world.year,boundaries:rows,overlaps:0,validation:true,checkpoint:true,portableDecode:true,canonicalEqual:true,bytes:Buffer.byteLength(saved.raw),ms:Date.now()-at};
writeFileSync('/tmp/ws16-world-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
