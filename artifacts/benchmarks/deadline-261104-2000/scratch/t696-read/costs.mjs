// Read-only: operating costs and wages of the strongest top-flight clubs on T694's books.
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2);
const spread = { 1950: 0.22, 1960: 0.22, 1970: 0.22, 1980: 0.4, 1990: 0.57, 2000: 0.81, 2010: 1 };
const pct = (x) => (100 * x).toFixed(0).padStart(4);
for (const f of files) {
  const rows = JSON.parse(readFileSync(f, 'utf8'));
  const cases = new Map();
  for (const r of rows) {
    const k = `${r.seed.slice(-1)} ${r.year} ${r.code}`;
    if (!cases.has(k)) cases.set(k, []);
    cases.get(k).push(r);
  }
  for (const [k, list] of cases) {
    const top = list.filter((r) => r.tier === 0).sort((a, b) => b.strength - a.strength);
    const median = top[Math.floor(top.length / 2)];
    const s = spread[list[0].year];
    const at = (r) =>
      r.ordinary + r.stars.reduce((sum, [W, W80]) => sum + W80 * (W / W80) ** s - W80, 0);
    const line = top.slice(0, 3).map(
      (r) =>
        `${r.strength}${r.project ? 'P' : ' '} inc×${(r.income / median.income).toFixed(2)} w${pct(r.wages / r.income)} w(s)${pct(at(r) / r.income)} c${pct(r.costs / r.income)} be${pct(1 - r.costs / r.income)}`,
    );
    const over = list
      .filter((r) => !r.project && at(r) > r.income)
      .map((r) => `${r.id}:${r.strength}:${pct(at(r) / r.income)}`);
    console.log(
      `${k} | ${line.join(' | ')} | med ${median.strength} c${pct(median.costs / median.income)} w${pct(median.wages / median.income)} | over(s) ${over.join(' ')}`,
    );
  }
}
