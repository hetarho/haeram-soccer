// T689 cv04: copy band logs, job lists and runner scripts into the evidence directory.
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const src = root + '.tmp/cv04/';
const dst = root + 'artifacts/benchmarks/scoring-261104-cv04/';
mkdirSync(dst + 'bands', { recursive: true });
mkdirSync(dst + 'analysis/jobs', { recursive: true });
let n = 0;
for (const f of readdirSync(src + 'logs')) {
  if (!f.startsWith('bands-') || f.startsWith('smoke')) continue;
  copyFileSync(src + 'logs/' + f, dst + 'bands/' + f);
  n++;
}
for (const f of readdirSync(src)) {
  if (/^w\d+(\.status)?\.json$/.test(f)) copyFileSync(src + f, dst + 'analysis/jobs/' + f);
  if (['run.mjs', 'make-jobs.mjs', 'make-candidates.mjs', 'collect.mjs'].includes(f))
    copyFileSync(src + f, dst + 'analysis/' + f);
}
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
