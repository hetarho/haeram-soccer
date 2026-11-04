// T696 measurement driver: runs the jobs of a JSON list with a concurrency limit, each job's
// stdout and stderr to its own log, a job starting only once the jobs it names in `after` are done.
import { spawn } from 'node:child_process';
import { readFileSync, openSync, writeFileSync } from 'node:fs';

const [listPath, limitText] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(listPath, 'utf8'));
const limit = Number(limitText ?? 8);
const cwd = '/home/deep/haeram/haeram-soccor-balance';
const done = new Set(),
  started = new Set(),
  failed = [];
let running = 0;
const t0 = Date.now();
const status = [];

function next() {
  for (const job of jobs) {
    if (running >= limit) return;
    if (started.has(job.name)) continue;
    if ((job.after ?? []).some((name) => !done.has(name))) continue;
    if ((job.after ?? []).some((name) => failed.includes(name))) continue;
    started.add(job.name);
    running++;
    const out = openSync(`${job.log}.out`, 'w'),
      err = openSync(`${job.log}.err`, 'w');
    const begun = Date.now();
    const child = spawn('pnpm', ['exec', 'tsx', ...job.args], { cwd, stdio: ['ignore', out, err] });
    child.on('exit', (code) => {
      running--;
      status.push({ name: job.name, code, seconds: (Date.now() - begun) / 1000 });
      if (code === 0) done.add(job.name);
      else failed.push(job.name);
      writeFileSync(`${listPath}.status.json`, JSON.stringify(status, null, 1));
      next();
      if (running === 0 && !jobs.some((j) => !started.has(j.name) && !(j.after ?? []).some((n) => failed.includes(n)))) {
        console.log(`all done in ${((Date.now() - t0) / 1000).toFixed(0)} s; failed: ${failed.join(', ') || 'none'}`);
        for (const s of status) console.log(`${s.name} ${s.code} ${s.seconds.toFixed(0)} s`);
      }
    });
  }
}
next();
