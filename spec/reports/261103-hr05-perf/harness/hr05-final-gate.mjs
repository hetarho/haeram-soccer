import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),original=sha('haeram-2034.haeram-save.json');
function run(command,args,env=process.env){const r=spawnSync(command,args,{stdio:'inherit',env});if(r.status!==0)throw Error(command+' '+args.join(' ')+' failed: '+r.status);}
run('pnpm',['exec','tsx','.tmp/hr05-browser.mjs','--steps','365','--reps','2','--out','.tmp/hr05-browser-660']);
run(process.execPath,['.tmp/hr05-browser-analysis.mjs','.tmp/hr05-browser-660']);
const r=JSON.parse(readFileSync('.tmp/hr05-browser-660/summary.json')),a=JSON.parse(readFileSync('.tmp/hr05-browser-660/analysis.json'));
assert.equal(r.length,16);for(const item of r){for(const key of ['admitted','completed','shown'])assert.equal(item[key],item.fixture==='early'?660:365,item.name+':'+key);assert.deepEqual(item.errors,[]);assert.equal(item.reload.date,item.finalDate);assert(item.saves.every(s=>s.codecOk&&s.commit));const trace=JSON.parse(readFileSync('.tmp/hr05-browser-660/'+item.name+'.trace.json'));assert(item.saves.some(s=>s.start<trace.stopAt),'automatic save missing: '+item.name);}
for(const item of a.parity){assert.equal(item.runs,8);assert(item.allDatesEqual&&item.allFactsEqual&&item.allReloadDatesEqual);assert.deepEqual(item.differingKeys,[]);}
assert.equal(sha('haeram-2034.haeram-save.json'),original);console.log('PASS browser matrix: 16 runs, early 660 / retained 365 exact days; automatic/final saves, full saved facts and reloads agree');
run('pnpm',['run','verify:batch']);
