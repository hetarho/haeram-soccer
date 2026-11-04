// T689 cv04-hold: copy this window's band logs (`.log` is gitignored, kept as `.txt`) and job lists
// into the evidence directory. Only candidates this window ran: ctl and kl6kc8 are cv04's.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const logs = root + '.tmp/cv04/logs/';
const jobs = root + '.tmp/cv04/hold/';
const dst = root + 'artifacts/benchmarks/scoring-261104-cv04-hold/';
mkdirSync(dst + 'bands', { recursive: true });
mkdirSync(dst + 'analysis/jobs', { recursive: true });
const names = readdirSync(dst + 'candidates')
  .map((f) => f.replace(/\.json$/, ''))
  .filter((n) => n !== 'ctl' && n !== 'kl6kc8');
let n = 0;
for (const name of names) {
  const f = `bands-${name}-400.log`;
  if (!existsSync(logs + f)) continue;
  copyFileSync(logs + f, dst + 'bands/' + f.replace(/\.log$/, '.txt'));
  n++;
}
for (const f of readdirSync(jobs)) copyFileSync(jobs + f, dst + 'analysis/jobs/' + f);
let size = 0;
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = d + '/' + f;
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else size += s.size;
  }
};
walk(dst);
console.log(n, 'band logs;', (size / 1e6).toFixed(2), 'MB in', dst);
