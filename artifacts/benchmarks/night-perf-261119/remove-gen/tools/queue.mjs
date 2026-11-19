// node queue.mjs <jobs.json> <concurrency>: runs [{name, args}] node jobs, logs to <name>.log beside the jobs file.
import { readFileSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
const [jobsFile, concArg] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
const dir = dirname(jobsFile);
let next = 0;
const run = () => new Promise((resolve) => {
  if (next >= jobs.length) return resolve();
  const job = jobs[next++];
  const fd = openSync(join(dir, job.name + '.log'), 'w');
  const t = Date.now();
  const child = spawn(process.execPath, ["--max-old-space-size=8000", ...job.args], { stdio: ["ignore", fd, fd], env: { ...process.env, ...(job.env ?? {}) } });
  child.on('close', (code) => { console.log(new Date().toISOString(), job.name, 'exit', code, ((Date.now() - t) / 1000).toFixed(0) + 's'); resolve(run()); });
});
await Promise.all(Array.from({ length: Number(concArg) }, run));
console.log('all done');
