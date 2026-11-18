// node summ.mjs <prefix> <variant...>: summarise pairday outputs <prefix>-<variant>-<p>.json.
import { readFileSync, existsSync } from 'node:fs';
const [prefix, ...variants] = process.argv.slice(2);
const tot = (r) => r.engine + (r.view ?? 0) + (r.publish ?? 0) + (r.post ?? 0);
const vw = (r) => (r.view ?? 0) + (r.publish ?? 0) + (r.post ?? 0);
const gm = (xs) => Math.exp(xs.reduce((a, b) => a + Math.log(b), 0) / xs.length);
function boot(logs, n = 4000) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ms = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < logs.length; j++) s += logs[Math.floor(rnd() * logs.length)];
    ms.push(s / logs.length);
  }
  ms.sort((a, b) => a - b);
  return [Math.exp(ms[Math.floor(0.025 * n)]), Math.exp(ms[Math.floor(0.975 * n)])];
}
for (const v of variants) {
  const runs = [];
  for (let p = 0; p < 9; p++) {
    const f = `${prefix}-${v}-${p}.json`;
    if (existsSync(f)) runs.push(JSON.parse(readFileSync(f, 'utf8')));
  }
  if (!runs.length) continue;
  const all = runs.flatMap((r) => r.rows);
  const days = runs[0].rows.length;
  const kinds = {};
  for (const x of all) {
    const k = x.a.kind.startsWith('round') ? 'round' : x.a.kind;
    const s = (kinds[k] ??= { n: 0, a: 0, b: 0, ae: 0, be: 0, av: 0, bv: 0, logs: [] });
    s.n++;
    s.a += tot(x.a);
    s.b += tot(x.b);
    s.ae += x.a.engine;
    s.be += x.b.engine;
    s.av += vw(x.a);
    s.bv += vw(x.b);
    if (tot(x.a) > 5 && tot(x.b) > 0) s.logs.push(Math.log(tot(x.b) / tot(x.a)));
  }
  const weekRatios = runs.map((r) => r.rows.reduce((s, x) => s + tot(x.b), 0) / r.rows.reduce((s, x) => s + tot(x.a), 0));
  const weekA = runs.map((r) => (7 * r.rows.reduce((s, x) => s + tot(x.a), 0)) / r.rows.length);
  const weekB = runs.map((r) => (7 * r.rows.reduce((s, x) => s + tot(x.b), 0)) / r.rows.length);
  // 7-day blocks (paired sums); the week ratio's interval resamples blocks and takes the ratio of sums.
  const blocks = runs.flatMap((r) => {
    const out = [];
    for (let i = 0; i + 7 <= r.rows.length; i += 7) {
      const blk = r.rows.slice(i, i + 7);
      out.push([blk.reduce((s, x) => s + tot(x.a), 0), blk.reduce((s, x) => s + tot(x.b), 0)]);
    }
    return out;
  });
  let seed2 = 777;
  const rnd2 = () => ((seed2 = (seed2 * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rs = [];
  for (let i = 0; i < 4000; i++) {
    let a = 0, b = 0;
    for (let j = 0; j < blocks.length; j++) { const k = blocks[Math.floor(rnd2() * blocks.length)]; a += k[0]; b += k[1]; }
    rs.push(b / a);
  }
  rs.sort((x, y) => x - y);
  const sumA = blocks.reduce((s, k) => s + k[0], 0), sumB = blocks.reduce((s, k) => s + k[1], 0);
  const weekCI = [rs[100], rs[3900]];
  const weekLogs = runs.flatMap((r) => {
    // Per-week paired ratios (7-day blocks) for an interval.
    const out = [];
    for (let i = 0; i + 7 <= r.rows.length; i += 7) {
      const blk = r.rows.slice(i, i + 7);
      out.push(Math.log(blk.reduce((s, x) => s + tot(x.b), 0) / blk.reduce((s, x) => s + tot(x.a), 0)));
    }
    return out;
  });
  const mismatch = all.filter((x) => x.a.day !== x.b.day || x.a.kind !== x.b.kind).length;
  console.log(`\n== ${v}: ${runs.length} procs × ${days} days, kind mismatches ${mismatch}`);
  console.log(
    `week (7 days, engine+view+publish+post) base ${(weekA.reduce((a, b) => a + b) / weekA.length).toFixed(0)} ms -> ${(weekB.reduce((a, b) => a + b) / weekB.length).toFixed(0)} ms; ratio of sums ${(sumB / sumA).toFixed(3)} CI95 ${weekCI.map((x) => x.toFixed(3)).join('–')} (block bootstrap, n=${blocks.length}); per proc ${weekRatios.map((x) => x.toFixed(3)).join(' ')}`,
  );
  for (const [k, s] of Object.entries(kinds)) {
    const ci = s.logs.length > 2 ? boot(s.logs).map((x) => x.toFixed(3)).join('–') : '-';
    console.log(
      `  ${k.padEnd(8)} n=${String(s.n).padStart(3)} total ${(s.a / s.n).toFixed(1)} -> ${(s.b / s.n).toFixed(1)} ms  (engine ${(s.ae / s.n).toFixed(1)} -> ${(s.be / s.n).toFixed(1)}, view+pub+post ${(s.av / s.n).toFixed(1)} -> ${(s.bv / s.n).toFixed(1)})  paired gm ${s.logs.length ? Math.exp(s.logs.reduce((a, b) => a + b, 0) / s.logs.length).toFixed(3) : '-'} CI95 ${ci}`,
    );
  }
}
