// node summ2.mjs <prefix> <from day> <to day> <variant...>: pairday outputs <prefix>-<variant>-<p>.json limited to
// days [from, to]: week CPU base -> variant (block bootstrap of the ratio), per-kind means, worst days.
import { readFileSync, existsSync } from 'node:fs';
const [prefix, fromArg, toArg, ...variants] = process.argv.slice(2);
const from = Number(fromArg), to = Number(toArg);
const tot = (r) => r.engine + (r.view ?? 0) + (r.publish ?? 0) + (r.post ?? 0);
const vw = (r) => (r.view ?? 0) + (r.publish ?? 0) + (r.post ?? 0);
const allBase = {};
for (const v of variants) {
  const runs = [];
  for (let p = 0; p < 9; p++) {
    const f = `${prefix}-${v}-${p}.json`;
    if (existsSync(f)) runs.push(JSON.parse(readFileSync(f, 'utf8')).rows.filter((x) => x.a.day >= from && x.a.day <= to));
  }
  if (!runs.length) continue;
  const days = runs[0].length;
  const kinds = {};
  for (const rows of runs)
    for (const x of rows) {
      const k = x.a.kind.startsWith('round') ? 'round' : x.a.kind;
      const s = (kinds[k] ??= { n: 0, a: 0, b: 0, ae: 0, be: 0, av: 0, bv: 0 });
      s.n++; s.a += tot(x.a); s.b += tot(x.b); s.ae += x.a.engine; s.be += x.b.engine; s.av += vw(x.a); s.bv += vw(x.b);
      const B = (allBase[k] ??= { n: 0, t: 0, e: 0 }); B.n++; B.t += tot(x.a); B.e += x.a.engine;
    }
  const blocks = runs.flatMap((rows) => {
    const out = [];
    for (let i = 0; i + 7 <= rows.length; i += 7) {
      const blk = rows.slice(i, i + 7);
      out.push([blk.reduce((s, x) => s + tot(x.a), 0), blk.reduce((s, x) => s + tot(x.b), 0)]);
    }
    return out;
  });
  let seed = 777;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rs = [];
  for (let i = 0; i < 4000; i++) {
    let a = 0, b = 0;
    for (let j = 0; j < blocks.length; j++) { const k = blocks[Math.floor(rnd() * blocks.length)]; a += k[0]; b += k[1]; }
    rs.push(b / a);
  }
  rs.sort((x, y) => x - y);
  const sumA = runs.flat().reduce((s, x) => s + tot(x.a), 0), sumB = runs.flat().reduce((s, x) => s + tot(x.b), 0);
  const n = runs.flat().length;
  // Worst day: per day, the mean over procs; then the max day.
  const perDay = [];
  for (let i = 0; i < days; i++) {
    const xs = runs.map((r) => r[i]).filter(Boolean);
    perDay.push({ day: xs[0].a.day, kind: xs[0].a.kind, kindB: xs[0].b.kind, a: xs.reduce((s, x) => s + tot(x.a), 0) / xs.length, b: xs.reduce((s, x) => s + tot(x.b), 0) / xs.length });
  }
  const worstA = perDay.reduce((m, d) => (d.a > m.a ? d : m)), worstB = perDay.reduce((m, d) => (d.b > m.b ? d : m));
  const mkt = perDay.filter((d) => d.kind === 'market' || d.kindB === 'market');
  console.log(`\n== ${v}: ${runs.length} procs x ${days} days (days ${from}-${to})`);
  console.log(`week base ${((7 * sumA) / n).toFixed(0)} ms -> ${((7 * sumB) / n).toFixed(0)} ms; ratio ${(sumB / sumA).toFixed(3)} CI95 ${rs[100].toFixed(3)}-${rs[3900].toFixed(3)} (7-day blocks n=${blocks.length})`);
  console.log(`worst day base d${worstA.day} ${worstA.kind} ${worstA.a.toFixed(0)} ms; variant d${worstB.day} ${worstB.kindB} ${worstB.b.toFixed(0)} ms`);
  console.log(`market days (base->variant ms): ${mkt.map((d) => `d${d.day} ${d.a.toFixed(0)}->${d.b.toFixed(0)}`).join(', ')}`);
  for (const [k, s] of Object.entries(kinds))
    console.log(`  ${k.padEnd(8)} n=${String(s.n).padStart(4)} total ${(s.a / s.n).toFixed(1)} -> ${(s.b / s.n).toFixed(1)} ms (engine ${(s.ae / s.n).toFixed(1)} -> ${(s.be / s.n).toFixed(1)}, view+pub+post ${(s.av / s.n).toFixed(1)} -> ${(s.bv / s.n).toFixed(1)}); share of base week ${((100 * s.a) / sumA).toFixed(1)}%`);
}
const N = Object.values(allBase).reduce((s, k) => s + k.n, 0), TT = Object.values(allBase).reduce((s, k) => s + k.t, 0);
console.log(`\n== base sides pooled (${N} day-samples): week ${((7 * TT) / N).toFixed(0)} ms`);
for (const [k, s] of Object.entries(allBase)) console.log(`  ${k.padEnd(8)} n=${s.n} mean total ${(s.t / s.n).toFixed(1)} ms (engine ${(s.e / s.n).toFixed(1)}); ${((100 * s.t) / TT).toFixed(1)}% of week; per week ${((7 * s.t) / N).toFixed(0)} ms`);
