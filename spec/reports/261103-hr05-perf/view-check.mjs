import {spawnSync} from 'node:child_process';
for(const args of [[],['--same']]){const r=spawnSync(process.execPath,['.tmp/hr05-view-ab.mjs',...args],{encoding:'utf8',maxBuffer:1<<23});process.stdout.write(r.stdout);process.stderr.write(r.stderr);if(r.status!==0)process.exit(r.status??1);}
