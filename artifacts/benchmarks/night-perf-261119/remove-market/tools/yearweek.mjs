// node yearweek.mjs <out dir> <world tag> <variant>:<impact variant> ...: estimated mean week over a whole year.
// Per base-kind mean day CPU (engine+view+publish+post) of each side from the pair runs (days 8-196),
// times the kind counts of a year (impact run: day 8 of Y to day 7 of Y+1), plus the close day and the
// day after it (the summer's opening settlement) from the impact run's engine CPU + an ordinary day's view.
import { readFileSync, existsSync } from 'node:fs';
const [dir, tag, ...specs] = process.argv.slice(2);
const tot = (r) => r.engine + (r.view ?? 0) + (r.publish ?? 0) + (r.post ?? 0);
const vw = (r) => (r.view ?? 0) + (r.publish ?? 0) + (r.post ?? 0);
for (const spec of specs) {
  const [v, iv] = spec.split(':');
  const runs = [];
  for (let p = 0; p < 9; p++) if (existsSync(`${dir}/${tag}-${v}-${p}.json`)) runs.push(JSON.parse(readFileSync(`${dir}/${tag}-${v}-${p}.json`, 'utf8')).rows);
  const ib = JSON.parse(readFileSync(`${dir}/imp-${tag}-base.json`, 'utf8'));
  const iv2 = JSON.parse(readFileSync(`${dir}/imp-${tag}-${iv}.json`, 'utf8'));
  const K = {};
  for (const rows of runs) for (const x of rows) {
    const k = x.a.kind.startsWith('round') ? 'round' : x.a.kind;
    const s = (K[k] ??= { n: 0, a: 0, b: 0, va: 0, vb: 0 });
    s.n++; s.a += tot(x.a); s.b += tot(x.b); s.va += vw(x.a); s.vb += vw(x.b);
  }
  // A year of kinds from the base impact run: Y day 8.. to Y+1 day 7.
  const Y = ib.rows[0][0];
  const yr = ib.rows.filter((r) => (r[0] === Y && r[1] >= 8) || (r[0] === Y + 1 && r[1] <= 7));
  const cnt = {};
  for (const r of yr) { const k = r[2].startsWith('round') ? 'round' : r[2]; cnt[k] = (cnt[k] ?? 0) + 1; }
  const close = (imp) => imp.rows.find((r) => r[2] === 'close')[3];
  const day1 = (imp) => imp.rows.find((r) => r[0] === Y + 1 && r[1] === 1)[3];
  let A = 0, B = 0;
  for (const [k, n] of Object.entries(cnt)) {
    if (k === 'close') continue;
    const s = K[k] ?? K.other;
    A += n * (s.a / s.n); B += n * (s.b / s.n);
  }
  // Day 1 of Y+1 was counted as 'other': replace its engine with the impact run's (the opening settlement).
  const o = K.other;
  A += close(ib) + o.va / o.n + day1(ib) - 0; B += close(iv2) + o.vb / o.n + day1(iv2);
  const days = yr.length;
  console.log(`${tag} ${v}: year ${days} days; mean week base ${((7 * A) / days).toFixed(0)} ms -> ${((7 * B) / days).toFixed(0)} ms (${((100 * (B - A)) / A).toFixed(1)}%); close engine ${close(ib).toFixed(0)} -> ${close(iv2).toFixed(0)}, opening settlement day ${day1(ib).toFixed(0)} -> ${day1(iv2).toFixed(0)}; kinds ${JSON.stringify(cnt)}`);
}
