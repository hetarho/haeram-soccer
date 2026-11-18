// node lookahead.mjs <prefix> <variant...>: a 10x clock (100 ms a day) fed by an engine that may run
// k days ahead of the shown day; per-day CPU = mean over procs of the pair runs. Prints the longest
// single stall and the total stall over the days for base and each variant, k = 0..6.
import { readFileSync, existsSync } from 'node:fs';
const [prefix, ...vs] = process.argv.slice(2);
const tot = (r) => r.engine + (r.view ?? 0) + (r.publish ?? 0) + (r.post ?? 0);
function sim(c, k, B = 100) {
  const P = [], S = [];
  let maxStall = 0, sum = 0;
  for (let i = 0; i < c.length; i++) {
    const free = i - k - 1 >= 0 ? S[i - k - 1] : 0;
    const start = Math.max(i ? P[i - 1] : 0, free);
    P[i] = start + c[i];
    const due = i ? S[i - 1] + B : 0;
    S[i] = Math.max(due, P[i]);
    const stall = S[i] - due;
    if (i) { maxStall = Math.max(maxStall, stall); sum += stall; }
  }
  return `${maxStall.toFixed(0)}/${sum.toFixed(0)}`;
}
for (const v of vs) {
  const runs = [];
  for (let p = 0; p < 9; p++) if (existsSync(`${prefix}-${v}-${p}.json`)) runs.push(JSON.parse(readFileSync(`${prefix}-${v}-${p}.json`, 'utf8')).rows);
  if (!runs.length) continue;
  const n = runs[0].length;
  const a = [], b = [];
  for (let i = 0; i < n; i++) { a.push(runs.reduce((s, r) => s + tot(r[i].a), 0) / runs.length); b.push(runs.reduce((s, r) => s + tot(r[i].b), 0) / runs.length); }
  const ks = [0, 1, 2, 3, 4, 6];
  console.log(`${v}: max stall/total stall ms over ${n} days, k = ${ks.join(', ')} days ahead`);
  console.log('  base    ', ks.map((k) => sim(a, k).padStart(10)).join(''));
  console.log('  variant ', ks.map((k) => sim(b, k).padStart(10)).join(''));
}
