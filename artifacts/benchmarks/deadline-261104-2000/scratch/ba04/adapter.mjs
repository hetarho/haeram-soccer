import {readFile} from 'node:fs/promises';
import {executeAgentAdapter} from '/home/deep/.npm/_npx/26287f45a133efbe/node_modules/haeram-spec-creator/src/agent-adapter.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const job=JSON.parse(input);
job.ownerInstructions=JSON.parse(await readFile(new URL('./owner.json',import.meta.url),'utf8'));
job.ownerInstructions.hostWindow=JSON.parse(await readFile(new URL('./window.json',import.meta.url),'utf8'));
if(job.status?.remaining?.every(t=>t.id==='T689')){
 job.brief=null;
 job.coordinatorDirective='The owner scope and STATE next take precedence over the mechanically selected lowest ID. If this pass has not planned/implemented its economic and retention issues, plan the next such slice first. Otherwise advance the sequential scope. Do not treat the old T689-only queue as the entire request.';
}
const result=await executeAgentAdapter({provider:'claude',job});
process.stdout.write(JSON.stringify(result)+'\n');
