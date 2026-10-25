// node cp.mjs <name> ...: counter's win share minus press's over the press–counter pairings of runs/<name>.json,
// with a 95% interval, plus draws and each side's goals and xG a match.
import { readFileSync } from 'node:fs';
const dir = new URL('./runs/', import.meta.url).pathname;
for (const name of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(`${dir}${name}.json`, 'utf8'));
  let n = 0, c = 0, p = 0, d = 0, cg = 0, pg = 0, cx = 0, px = 0;
  for (const ch of r.chunks) {
    if (!/tactics:(press-counter|counter-press)/.test(ch.condition)) continue;
    for (const s of ch.samples) {
      const t = s.record.tactics;
      const sc = s.record.regulation ?? s.record.score;
      const ci = t[0] === 'counter' ? 0 : 1;
      const g = [sc.home, sc.away];
      n++;
      cg += g[ci]; pg += g[1 - ci];
      cx += s.record.xg[ci]; px += s.record.xg[1 - ci];
      if (g[ci] > g[1 - ci]) c++;
      else if (g[ci] < g[1 - ci]) p++;
      else d++;
    }
  }
  const diff = (c - p) / n;
  // Each match scores +1, −1 or 0: the variance of that score over the sample.
  const v = (c + p) / n - diff * diff;
  const half = 1.96 * Math.sqrt(v / n);
  console.log(
    `${name}\tn ${n}\tcounter−press ${diff.toFixed(3)} [${(diff - half).toFixed(3)}, ${(diff + half).toFixed(3)}]\tdraws ${(d / n).toFixed(3)}\tgoals c ${(cg / n).toFixed(2)} p ${(pg / n).toFixed(2)}\txG c ${(cx / n).toFixed(2)} p ${(px / n).toFixed(2)}`,
  );
}
