import {spawnSync} from 'node:child_process';
for(const args of [['.tmp/hr05-host-profile.mjs','candidate'],['.tmp/hr05-host-ab.mjs'],['.tmp/hr05-host-ab.mjs','--same']]){const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:1<<24});process.stdout.write(r.stdout);process.stderr.write(r.stderr);if(r.status!==0)process.exit(r.status??1);}
