// T689 cv04-rec: copy this window's band logs (`.log` is gitignored, kept as `.txt`) into the
// evidence directory. Job lists and their status files are written there directly.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const logs = root + '.tmp/cv04/logs/';
const dst = root + 'artifacts/benchmarks/scoring-261104-cv04-rec/';
mkdirSync(dst + 'bands', { recursive: true });
let n = 0;
// `ctl` is cv04's (its band log is cv04's evidence); this window ran only its diagnostic.
for (const name of readdirSync(dst + 'candidates')
  .map((f) => f.replace(/\.json$/, ''))
  .filter((n) => n !== 'ctl')) {
  const f = `bands-${name}-400.log`;
  if (!existsSync(logs + f)) continue;
  copyFileSync(logs + f, dst + 'bands/' + f.replace(/\.log$/, '.txt'));
  n++;
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
